import { and, eq, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { bumpVersion } from "@/db/versioning";
import { ExecutionError, impact, type Executor } from "../types";
import { mustLoad, sessionSpeakerIds } from "./_util";

export const confirmSpeaker: Executor<"speaker.confirm"> = {
  kind: "speaker.confirm",
  async describe(p, ctx) {
    const s = await mustLoad(ctx.db, t.speakers, p.speakerId, ctx.eventId, "Speaker");
    if (p.sessionId) await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
    return {
      diff: [
        { entity: "speakers", id: s.id, before: { status: s.status }, after: { status: p.status } },
        ...(p.sessionId
          ? [{ entity: "session_speakers", id: null, before: null, after: { sessionId: p.sessionId } }]
          : []),
      ],
      impact: impact(),
      preconditions: [{ entity: "speakers", id: s.id, version: s.version }],
    };
  },
  async execute(p, ctx) {
    const s = await mustLoad(ctx.db, t.speakers, p.speakerId, ctx.eventId, "Speaker");
    await ctx.db
      .update(t.speakers)
      .set({ status: p.status, version: bumpVersion(t.speakers) })
      .where(eq(t.speakers.id, s.id));
    let linked = false;
    if (p.sessionId) {
      await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
      if (!(await sessionSpeakerIds(ctx.db, p.sessionId)).includes(s.id)) {
        await ctx.db.insert(t.sessionSpeakers).values({ sessionId: p.sessionId, speakerId: s.id });
        linked = true;
      }
    }
    if (p.status === "confirmed")
      ctx.emit({
        type: "speaker.confirmed",
        entity: "speakers",
        entityId: s.id,
        payload: { speakerId: s.id, sessionId: p.sessionId },
      });
    return { undoData: { status: s.status, linked } };
  },
  async inverse(p, u, ctx) {
    await ctx.db
      .update(t.speakers)
      .set({ status: u.status as string, version: bumpVersion(t.speakers) })
      .where(and(eq(t.speakers.id, p.speakerId), eq(t.speakers.eventId, ctx.eventId)));
    if (u.linked && p.sessionId)
      await ctx.db
        .delete(t.sessionSpeakers)
        .where(
          and(eq(t.sessionSpeakers.sessionId, p.sessionId), eq(t.sessionSpeakers.speakerId, p.speakerId)),
        );
  },
};

type Requirements = {
  av: string[];
  travel: string | null;
  stay: string | null;
  materials: string | null;
  notes: string | null;
};

export const recordRequirements: Executor<"speaker.requirement.record"> = {
  kind: "speaker.requirement.record",
  async describe(p, ctx) {
    await mustLoad(ctx.db, t.speakers, p.speakerId, ctx.eventId, "Speaker");
    const [cur] = await ctx.db
      .select()
      .from(t.speakerRequirements)
      .where(eq(t.speakerRequirements.speakerId, p.speakerId));
    return {
      diff: [
        {
          entity: "speaker_requirements",
          id: p.speakerId,
          before: cur ? pick(cur) : null,
          after: { av: p.av, travel: p.travel, stay: p.stay, materials: p.materials, notes: p.notes },
        },
      ],
      impact: impact(),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    await mustLoad(ctx.db, t.speakers, p.speakerId, ctx.eventId, "Speaker");
    const [cur] = await ctx.db
      .select()
      .from(t.speakerRequirements)
      .where(eq(t.speakerRequirements.speakerId, p.speakerId));
    const values = {
      av: p.av,
      travel: p.travel ?? null,
      stay: p.stay ?? null,
      materials: p.materials ?? null,
      notes: p.notes ?? null,
    };
    if (cur)
      await ctx.db
        .update(t.speakerRequirements)
        .set({ ...values, version: sql`${t.speakerRequirements.version} + 1` })
        .where(eq(t.speakerRequirements.speakerId, p.speakerId));
    else
      await ctx.db
        .insert(t.speakerRequirements)
        .values({ speakerId: p.speakerId, eventId: ctx.eventId, ...values });
    return { undoData: { previous: cur ? pick(cur) : null } };
  },
  async inverse(p, u, ctx) {
    const where = and(
      eq(t.speakerRequirements.speakerId, p.speakerId),
      eq(t.speakerRequirements.eventId, ctx.eventId),
    );
    const prev = u.previous as Requirements | null;
    if (!prev) await ctx.db.delete(t.speakerRequirements).where(where);
    else
      await ctx.db
        .update(t.speakerRequirements)
        .set({ ...prev, version: sql`${t.speakerRequirements.version} + 1` })
        .where(where);
  },
};

function pick(r: Requirements): Requirements {
  return { av: r.av, travel: r.travel, stay: r.stay, materials: r.materials, notes: r.notes };
}

// There is no reminder table yet: like comms.reminder.schedule, the executed proposal's payload is
// the reminder record, and undoing the proposal withdraws it. Execution only checks the slot is real.
export const scheduleSpeakerReminder: Executor<"speaker.reminder.schedule"> = {
  kind: "speaker.reminder.schedule",
  async describe(p, ctx) {
    await mustLoad(ctx.db, t.speakers, p.speakerId, ctx.eventId, "Speaker");
    const s = await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
    return {
      diff: p.offsetsMinutes.map((m) => ({
        entity: "reminder_rules",
        id: null,
        before: null,
        after: {
          speakerId: p.speakerId,
          sessionId: s.id,
          sendAt: new Date(s.startsAt.getTime() - m * 60_000).toISOString(),
          channels: p.channels,
        },
      })),
      impact: impact({ people: 1, channels: p.channels }),
      preconditions: [{ entity: "sessions", id: s.id, version: s.version }],
    };
  },
  async execute(p, ctx) {
    await mustLoad(ctx.db, t.speakers, p.speakerId, ctx.eventId, "Speaker");
    await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
    if (!(await sessionSpeakerIds(ctx.db, p.sessionId)).includes(p.speakerId))
      throw new ExecutionError("That speaker is not on that session");
    return { undoData: {} };
  },
  async inverse() {
    // Undoing marks the proposal undone; the reminder job ignores undone proposals.
  },
};
