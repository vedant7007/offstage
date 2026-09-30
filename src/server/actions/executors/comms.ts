/**
 * Outbound messages. Every message goes through: recipients from the segment, per-person
 * hourly cap, 24 hour dedupe, and quiet hours (22:00 to 07:00 IST unless a human approved an
 * emergency). Rows that are held back are still written, as `skipped` with the reason, so the
 * console shows exactly who got what and why not.
 */
import { createHash } from "node:crypto";
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import type {
  AnnouncementCategory,
  BodyByChannel,
  Channel,
  DirectRecipient,
  EventSettings,
  Segment,
} from "@/contracts";
import * as t from "@/db/schema";
import { istDateKey, istToUtc, isWithinIstHours } from "@/lib/time";
import { driverFor } from "@/server/channels/registry";
import { encrypt } from "@/server/pii";
import { ExecutionError, impact, type ExecCtx, type Executor, type Tx } from "../types";
import { mustLoad } from "./_util";

export interface Recipient {
  type: DirectRecipient["type"];
  id: string;
  userId: string | null;
  emailEnc: string | null;
  phoneEnc: string | null;
}

// ---------------------------------------------------------------- recipients

async function volunteersAsRecipients(db: Tx, eventId: string, onlyIds?: string[]): Promise<Recipient[]> {
  const conds = [eq(t.volunteers.eventId, eventId), eq(t.volunteers.active, true)];
  if (onlyIds) conds.push(inArray(t.volunteers.id, onlyIds.length ? onlyIds : ["-"]));
  const rows = await db
    .select({
      id: t.volunteers.id,
      userId: t.volunteers.userId,
      phoneEnc: t.volunteers.phoneEnc,
      email: t.users.email,
    })
    .from(t.volunteers)
    .leftJoin(t.users, eq(t.users.id, t.volunteers.userId))
    .where(and(...conds));
  return rows.map((r) => ({
    type: "volunteer",
    id: r.id,
    userId: r.userId,
    emailEnc: r.email ? encrypt(r.email) : null,
    phoneEnc: r.phoneEnc,
  }));
}

export async function resolveSegment(db: Tx, eventId: string, segment: Segment): Promise<Recipient[]> {
  switch (segment.type) {
    case "all": {
      const rows = await db
        .select({
          id: t.registrations.id,
          userId: t.registrations.userId,
          emailEnc: t.registrations.emailEnc,
          phoneEnc: t.registrations.phoneEnc,
        })
        .from(t.registrations)
        .where(and(eq(t.registrations.eventId, eventId), eq(t.registrations.status, "confirmed")));
      return rows.map((r) => ({ type: "registration", ...r }));
    }
    case "session": {
      const rows = await db
        .select({
          id: t.registrations.id,
          userId: t.registrations.userId,
          emailEnc: t.registrations.emailEnc,
          phoneEnc: t.registrations.phoneEnc,
        })
        .from(t.sessionChoices)
        .innerJoin(t.registrations, eq(t.registrations.id, t.sessionChoices.registrationId))
        .where(
          and(
            eq(t.sessionChoices.sessionId, segment.ref!),
            eq(t.registrations.eventId, eventId),
            eq(t.registrations.status, "confirmed"),
          ),
        );
      return rows.map((r) => ({ type: "registration", ...r }));
    }
    case "volunteers":
      return volunteersAsRecipients(db, eventId);
    case "crew_role": {
      const ids = await db
        .selectDistinct({ id: t.shiftAssignments.volunteerId })
        .from(t.shiftAssignments)
        .innerJoin(t.shifts, eq(t.shifts.id, t.shiftAssignments.shiftId))
        .where(
          and(
            eq(t.shifts.eventId, eventId),
            eq(t.shifts.role, segment.ref!),
            inArray(t.shiftAssignments.status, ["assigned", "checked_in"]),
          ),
        );
      return volunteersAsRecipients(
        db,
        eventId,
        ids.map((r) => r.id),
      );
    }
    case "speakers": {
      const rows = await db
        .select({ id: t.speakers.id, emailEnc: t.speakers.emailEnc, phoneEnc: t.speakers.phoneEnc })
        .from(t.speakers)
        .where(and(eq(t.speakers.eventId, eventId), ne(t.speakers.status, "declined")));
      return rows.map((r) => ({ type: "speaker", userId: null, ...r }));
    }
    case "sponsors": {
      const rows = await db
        .select({ id: t.sponsorProspects.id, emailEnc: t.sponsorProspects.contactEmailEnc })
        .from(t.sponsorProspects)
        .where(
          and(
            eq(t.sponsorProspects.eventId, eventId),
            inArray(t.sponsorProspects.stage, ["confirmed", "negotiating"]),
          ),
        );
      return rows.map((r) => ({
        type: "sponsor_contact",
        id: r.id,
        userId: null,
        emailEnc: r.emailEnc,
        phoneEnc: null,
      }));
    }
    case "custom":
      throw new ExecutionError("Custom segments are not supported yet; pick a session, role or everyone");
  }
}

export async function resolveDirect(db: Tx, eventId: string, r: DirectRecipient): Promise<Recipient> {
  switch (r.type) {
    case "registration": {
      const row = await mustLoad(db, t.registrations, r.id, eventId, "Registration");
      return {
        type: "registration",
        id: row.id,
        userId: row.userId,
        emailEnc: row.emailEnc,
        phoneEnc: row.phoneEnc,
      };
    }
    case "volunteer": {
      const [v] = await volunteersAsRecipients(db, eventId, [r.id]);
      if (!v) throw new ExecutionError("Volunteer not found in this event");
      return v;
    }
    case "speaker": {
      const s = await mustLoad(db, t.speakers, r.id, eventId, "Speaker");
      return { type: "speaker", id: s.id, userId: null, emailEnc: s.emailEnc, phoneEnc: s.phoneEnc };
    }
    case "sponsor_contact": {
      const s = await mustLoad(db, t.sponsorProspects, r.id, eventId, "Sponsor");
      return { type: "sponsor_contact", id: s.id, userId: null, emailEnc: s.contactEmailEnc, phoneEnc: null };
    }
    case "user": {
      const [m] = await db
        .select({ userId: t.memberships.userId, email: t.users.email })
        .from(t.memberships)
        .innerJoin(t.users, eq(t.users.id, t.memberships.userId))
        .where(and(eq(t.memberships.eventId, eventId), eq(t.memberships.userId, r.id)));
      if (!m) throw new ExecutionError("That user is not part of this event");
      return { type: "user", id: m.userId, userId: m.userId, emailEnc: encrypt(m.email), phoneEnc: null };
    }
  }
}

// ---------------------------------------------------------------- delivery rules

/** When a message may go out: now, or the end of quiet hours (IST) if now is inside them. */
export function sendTime(
  at: Date,
  settings: Pick<EventSettings, "quietHours">,
  category: AnnouncementCategory,
  humanApproved: boolean,
): { at: Date; deferred: boolean } {
  const { startHour, endHour } = settings.quietHours;
  if (category === "emergency" && humanApproved) return { at, deferred: false };
  if (!isWithinIstHours(at, startHour, endHour)) return { at, deferred: false };
  const hh = String(endHour).padStart(2, "0");
  let next = istToUtc(`${istDateKey(at)}T${hh}:00`);
  if (next <= at) next = new Date(next.getTime() + 86_400_000);
  return { at: next, deferred: true };
}

export function dedupeKey(recipient: Pick<Recipient, "type" | "id">, channel: Channel, body: string): string {
  return createHash("sha256").update(`${recipient.type}:${recipient.id}|${channel}|${body}`).digest("hex");
}

interface Delivery {
  recipients: Recipient[];
  channels: Channel[];
  bodyByChannel: BodyByChannel;
  subject: string;
  category: AnnouncementCategory;
  scheduledFor?: string;
  announcementId?: string;
}

export interface DeliveryCounts {
  queued: number;
  inApp: number;
  skipped: Record<string, number>;
  deferredUntil: string | null;
}

async function deliver(ctx: ExecCtx, d: Delivery): Promise<DeliveryCounts> {
  const counts: DeliveryCounts = { queued: 0, inApp: 0, skipped: {}, deferredUntil: null };
  const skip = (reason: string) => (counts.skipped[reason] = (counts.skipped[reason] ?? 0) + 1);
  const base = d.scheduledFor ? new Date(d.scheduledFor) : ctx.now;
  const when = sendTime(base, ctx.settings, d.category, ctx.humanApproved);
  if (when.deferred) counts.deferredUntil = when.at.toISOString();

  // Per-person hourly cap: distinct messages already queued to each recipient in the last hour.
  const recipientIds = d.recipients.map((r) => r.id);
  const recent = recipientIds.length
    ? await ctx.db
        .select({
          id: t.outbox.recipientId,
          n: sql<number>`count(distinct coalesce(${t.outbox.announcementId}, ${t.outbox.proposalId}))::int`,
        })
        .from(t.outbox)
        .where(
          and(
            eq(t.outbox.eventId, ctx.eventId),
            inArray(t.outbox.recipientId, recipientIds),
            ne(t.outbox.status, "skipped"),
            gt(t.outbox.createdAt, sql`now() - interval '1 hour'`),
          ),
        )
        .groupBy(t.outbox.recipientId)
    : [];
  const sentLastHour = new Map(recent.map((r) => [r.id, r.n]));
  const cap = ctx.settings.perPersonHourlyCap;

  const pushChannels = d.channels.filter((c) => c !== "in_app");
  const keys = d.recipients.flatMap((r) =>
    pushChannels.map((c) => dedupeKey(r, c, d.bodyByChannel[c] ?? "")),
  );
  const dupRows = keys.length
    ? await ctx.db
        .select({ k: t.outbox.dedupeKey })
        .from(t.outbox)
        .where(
          and(
            inArray(t.outbox.dedupeKey, keys),
            ne(t.outbox.status, "skipped"),
            gt(t.outbox.createdAt, sql`now() - interval '24 hours'`),
          ),
        )
    : [];
  const seen = new Set(dupRows.map((r) => r.k));

  const outboxRows: (typeof t.outbox.$inferInsert)[] = [];
  const notes: (typeof t.notifications.$inferInsert)[] = [];
  for (const r of d.recipients) {
    const overCap = d.category !== "emergency" && (sentLastHour.get(r.id) ?? 0) >= cap;
    for (const channel of d.channels) {
      const body = d.bodyByChannel[channel];
      if (!body) continue;
      if (channel === "in_app") {
        if (r.userId) {
          notes.push({
            eventId: ctx.eventId,
            userId: r.userId,
            title: d.subject,
            body,
            category: d.category,
            announcementId: d.announcementId ?? null,
          });
          counts.inApp++;
        } else skip("in_app_no_account");
        continue;
      }
      const key = dedupeKey(r, channel, body);
      const address =
        channel === "email" ? r.emailEnc : channel === "sms" || channel === "whatsapp" ? r.phoneEnc : null;
      let reason: string | null = null;
      if (channel === "telegram") reason = "telegram_not_linked";
      else if (!address) reason = `no_${channel === "email" ? "email" : "phone"}`;
      else if (seen.has(key)) reason = "duplicate_24h";
      else if (overCap) reason = "hourly_cap";
      if (reason) skip(reason);
      else counts.queued++;
      seen.add(key);
      outboxRows.push({
        eventId: ctx.eventId,
        channel,
        driver: driverFor(channel),
        toEnc: address ?? encrypt(""),
        recipientType: r.type,
        recipientId: r.id,
        subject: d.subject,
        body,
        dedupeKey: key,
        status: reason ? "skipped" : "pending",
        error: reason,
        announcementId: d.announcementId ?? null,
        proposalId: ctx.proposalId,
        scheduledFor: when.at,
      });
    }
  }
  for (let i = 0; i < outboxRows.length; i += 500)
    await ctx.db.insert(t.outbox).values(outboxRows.slice(i, i + 500));
  for (let i = 0; i < notes.length; i += 500)
    await ctx.db.insert(t.notifications).values(notes.slice(i, i + 500));
  return counts;
}

function channelsImpact(recipients: Recipient[], channels: Channel[]) {
  return impact({
    people: recipients.length,
    attendees: recipients.filter((r) => r.type === "registration").length,
    volunteers: recipients.filter((r) => r.type === "volunteer").length,
    channels,
    reversible: false,
  });
}

function draftedBy(ctx: ExecCtx): string | null {
  return ctx.proposedBy.kind === "agent" ? ctx.proposedBy.agent : null;
}

// ---------------------------------------------------------------- executors

export const sendAnnouncement: Executor<"comms.send_announcement"> = {
  kind: "comms.send_announcement",
  async describe(p, ctx) {
    const recipients = await resolveSegment(ctx.db, ctx.eventId, p.segment);
    return {
      diff: [
        {
          entity: "announcements",
          id: null,
          before: null,
          after: {
            title: p.title,
            category: p.category,
            segment: p.segment,
            channels: p.channels,
            recipients: recipients.length,
          },
        },
      ],
      impact: channelsImpact(recipients, p.channels),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    const recipients = await resolveSegment(ctx.db, ctx.eventId, p.segment);
    const body = p.bodyByChannel.in_app ?? p.bodyByChannel[p.channels[0]!] ?? "";
    const [ann] = await ctx.db
      .insert(t.announcements)
      .values({
        eventId: ctx.eventId,
        title: p.title,
        body,
        bodyByChannel: p.bodyByChannel,
        segment: p.segment,
        channels: p.channels,
        category: p.category,
        public: p.public,
        status: "scheduled",
        scheduledFor: p.scheduledFor ? new Date(p.scheduledFor) : null,
        recipientCount: recipients.length,
        approvedByRole: ctx.approvedByRole,
        draftedBy: draftedBy(ctx),
        proposalId: ctx.proposalId,
      })
      .returning({ id: t.announcements.id });
    const counts = await deliver(ctx, {
      recipients,
      channels: p.channels,
      bodyByChannel: p.bodyByChannel,
      subject: p.title,
      category: p.category,
      scheduledFor: p.scheduledFor,
      announcementId: ann!.id,
    });
    if (counts.deferredUntil || p.scheduledFor) {
      await ctx.db
        .update(t.announcements)
        .set({ scheduledFor: new Date(counts.deferredUntil ?? p.scheduledFor!) })
        .where(eq(t.announcements.id, ann!.id));
    }
    ctx.emit({
      type: "announcement.scheduled",
      entity: "announcements",
      entityId: ann!.id,
      payload: { announcementId: ann!.id, recipients: recipients.length, ...counts },
    });
    return { undoData: { announcementId: ann!.id, counts } };
  },
};

export const sendDirect: Executor<"comms.send_direct"> = {
  kind: "comms.send_direct",
  async describe(p, ctx) {
    const r = await resolveDirect(ctx.db, ctx.eventId, p.recipient);
    return {
      diff: [
        { entity: "outbox", id: null, before: null, after: { recipient: p.recipient, channels: p.channels } },
      ],
      impact: channelsImpact([r], p.channels),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    const r = await resolveDirect(ctx.db, ctx.eventId, p.recipient);
    const counts = await deliver(ctx, {
      recipients: [r],
      channels: p.channels,
      bodyByChannel: p.bodyByChannel,
      subject: p.subject ?? "Message from the organisers",
      category: p.category,
    });
    return { undoData: { counts } };
  },
};

/** Rules live on the executed proposal; the reminder job (Checkpoint 6) reads executed, not undone, rules. */
export const scheduleReminders: Executor<"comms.reminder.schedule"> = {
  kind: "comms.reminder.schedule",
  async describe(p) {
    return {
      diff: p.rules.map((r) => ({ entity: "reminder_rules", id: null, before: null, after: { ...r } })),
      impact: impact({ channels: [...new Set(p.rules.flatMap((r) => r.channels))] }),
      preconditions: [],
    };
  },
  async execute() {
    return { undoData: {} };
  },
  async inverse() {
    // Undoing marks the proposal undone; the reminder job ignores undone rule sets.
  },
};
