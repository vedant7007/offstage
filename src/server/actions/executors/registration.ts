import { and, eq, inArray, sql } from "drizzle-orm";
import * as t from "@/db/schema";
import { bumpVersion } from "@/db/versioning";
import { signTicket } from "@/server/checkin/ticket";
import { ExecutionError, impact, type Executor } from "../types";
import { loadMany, mustLoad, sessionAttendees } from "./_util";

async function confirmedCount(db: Parameters<typeof mustLoad>[0], eventId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.registrations)
    .where(and(eq(t.registrations.eventId, eventId), eq(t.registrations.status, "confirmed")));
  return r?.n ?? 0;
}

export const promoteWaitlist: Executor<"registration.promote_waitlist"> = {
  kind: "registration.promote_waitlist",
  async describe(p, ctx) {
    const rows = await loadMany(ctx.db, t.registrations, p.registrationIds, ctx.eventId);
    return {
      diff: rows.map((r) => ({
        entity: "registrations",
        id: r.id,
        before: { status: r.status, waitlistPosition: r.waitlistPosition },
        after: { status: "confirmed", waitlistPosition: null },
      })),
      impact: impact({ people: rows.length, attendees: rows.length, channels: ["in_app", "email"] }),
      preconditions: rows.map((r) => ({ entity: "registrations", id: r.id, version: r.version })),
    };
  },
  async execute(p, ctx) {
    const rows = await loadMany(ctx.db, t.registrations, p.registrationIds, ctx.eventId);
    if (rows.length !== p.registrationIds.length)
      throw new ExecutionError("Some registrations are not in this event");
    const notWaiting = rows.filter((r) => r.status !== "waitlisted");
    if (notWaiting.length) throw new ExecutionError(`${notWaiting.length} of these are not on the waitlist`);

    // Capacity, checked under the proposal's transaction (rows are locked by the precondition check).
    const [ev] = await ctx.db.select().from(t.events).where(eq(t.events.id, ctx.eventId)).for("update");
    const confirmed = await confirmedCount(ctx.db, ctx.eventId);
    if (ev && ev.capacity > 0 && confirmed + rows.length > ev.capacity) {
      throw new ExecutionError(`Only ${Math.max(0, ev.capacity - confirmed)} event seats are free`);
    }
    if (p.sessionId) {
      const s = await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
      const taken = await sessionAttendees(ctx.db, s.id);
      if (taken + rows.length > s.capacity)
        throw new ExecutionError(`Only ${Math.max(0, s.capacity - taken)} seats are free in that session`);
    }

    const tickets: string[] = [];
    const ordered = p.registrationIds.map((id) => rows.find((r) => r.id === id)!);
    for (const r of ordered) {
      await ctx.db
        .update(t.registrations)
        .set({ status: "confirmed", waitlistPosition: null, version: bumpVersion(t.registrations) })
        .where(eq(t.registrations.id, r.id));
      const [existing] = await ctx.db
        .select({ id: t.tickets.id })
        .from(t.tickets)
        .where(eq(t.tickets.registrationId, r.id));
      if (!existing) {
        const ticketId = globalThis.crypto.randomUUID();
        const expiresAt = new Date(ev!.endsAt.getTime() + 24 * 3_600_000);
        await ctx.db.insert(t.tickets).values({
          id: ticketId,
          eventId: ctx.eventId,
          registrationId: r.id,
          token: signTicket({
            ticketId,
            registrationId: r.id,
            eventId: ctx.eventId,
            exp: Math.floor(expiresAt.getTime() / 1000),
          }),
          expiresAt,
        });
        tickets.push(ticketId);
      }
      ctx.emit({
        type: "registration.promoted",
        entity: "registrations",
        entityId: r.id,
        payload: { registrationId: r.id, sessionId: p.sessionId, proposalId: ctx.proposalId },
      });
    }
    // Close the gaps in the remaining waitlist.
    await ctx.db.execute(sql`
      with ranked as (
        select id, row_number() over (order by waitlist_position, created_at) as pos
        from registrations where event_id = ${ctx.eventId} and status = 'waitlisted'
      )
      update registrations r set waitlist_position = ranked.pos from ranked where r.id = ranked.id`);
    return {
      undoData: {
        promoted: ordered.map((r) => ({ id: r.id, waitlistPosition: r.waitlistPosition })),
        tickets,
      },
    };
  },
  async inverse(_p, undo, ctx) {
    const promoted = undo.promoted as { id: string; waitlistPosition: number | null }[];
    for (const r of promoted) {
      await ctx.db
        .update(t.registrations)
        .set({
          status: "waitlisted",
          waitlistPosition: r.waitlistPosition,
          version: bumpVersion(t.registrations),
        })
        .where(and(eq(t.registrations.id, r.id), eq(t.registrations.eventId, ctx.eventId)));
    }
    const tickets = undo.tickets as string[];
    if (tickets.length)
      await ctx.db
        .update(t.tickets)
        .set({ revoked: true, revokedAt: ctx.now })
        .where(inArray(t.tickets.id, tickets));
    await ctx.db.execute(sql`
      with ranked as (
        select id, row_number() over (order by waitlist_position, created_at) as pos
        from registrations where event_id = ${ctx.eventId} and status = 'waitlisted'
      )
      update registrations r set waitlist_position = ranked.pos from ranked where r.id = ranked.id`);
  },
};

export const setStatus: Executor<"registration.set_status"> = {
  kind: "registration.set_status",
  async describe(p, ctx) {
    const r = await mustLoad(ctx.db, t.registrations, p.registrationId, ctx.eventId, "Registration");
    return {
      diff: [
        { entity: "registrations", id: r.id, before: { status: r.status }, after: { status: p.status } },
      ],
      impact: impact({ people: 1, attendees: 1, channels: ["in_app", "email"] }),
      preconditions: [{ entity: "registrations", id: r.id, version: r.version }],
    };
  },
  async execute(p, ctx) {
    const r = await mustLoad(ctx.db, t.registrations, p.registrationId, ctx.eventId, "Registration");
    await ctx.db
      .update(t.registrations)
      .set({ status: p.status, version: bumpVersion(t.registrations) })
      .where(eq(t.registrations.id, r.id));
    if (p.status === "cancelled" || p.status === "rejected") {
      await ctx.db
        .update(t.tickets)
        .set({ revoked: true, revokedAt: ctx.now })
        .where(eq(t.tickets.registrationId, r.id));
    }
    ctx.emit({
      type: "registration.status_changed",
      entity: "registrations",
      entityId: r.id,
      payload: { registrationId: r.id, from: r.status, to: p.status, reason: p.reason },
    });
    return { undoData: { status: r.status } };
  },
  async inverse(p, undo, ctx) {
    await ctx.db
      .update(t.registrations)
      .set({ status: undo.status as string, version: bumpVersion(t.registrations) })
      .where(and(eq(t.registrations.id, p.registrationId), eq(t.registrations.eventId, ctx.eventId)));
    if (undo.status === "confirmed")
      await ctx.db
        .update(t.tickets)
        .set({ revoked: false, revokedAt: null })
        .where(eq(t.tickets.registrationId, p.registrationId));
  },
};

export const flagDuplicate: Executor<"registration.flag_duplicate"> = {
  kind: "registration.flag_duplicate",
  async describe(p, ctx) {
    const r = await mustLoad(ctx.db, t.registrations, p.registrationId, ctx.eventId, "Registration");
    await mustLoad(ctx.db, t.registrations, p.duplicateOfId, ctx.eventId, "Registration");
    return {
      diff: [
        {
          entity: "registrations",
          id: r.id,
          before: { duplicateOfId: r.duplicateOfId },
          after: { duplicateOfId: p.duplicateOfId },
        },
      ],
      impact: impact(),
      preconditions: [{ entity: "registrations", id: r.id, version: r.version }],
    };
  },
  async execute(p, ctx) {
    const r = await mustLoad(ctx.db, t.registrations, p.registrationId, ctx.eventId, "Registration");
    await ctx.db
      .update(t.registrations)
      .set({ duplicateOfId: p.duplicateOfId, version: bumpVersion(t.registrations) })
      .where(eq(t.registrations.id, r.id));
    ctx.emit({
      type: "registration.duplicate_flagged",
      entity: "registrations",
      entityId: r.id,
      payload: { registrationId: r.id, duplicateOfId: p.duplicateOfId, matchType: p.matchType },
    });
    return { undoData: { duplicateOfId: r.duplicateOfId } };
  },
  async inverse(p, undo, ctx) {
    await ctx.db
      .update(t.registrations)
      .set({
        duplicateOfId: (undo.duplicateOfId as string | null) ?? null,
        version: bumpVersion(t.registrations),
      })
      .where(and(eq(t.registrations.id, p.registrationId), eq(t.registrations.eventId, ctx.eventId)));
  },
};

export const mergeRegistrations: Executor<"registration.merge"> = {
  kind: "registration.merge",
  async describe(p, ctx) {
    const keep = await mustLoad(ctx.db, t.registrations, p.keepId, ctx.eventId, "Registration");
    const merged = await loadMany(ctx.db, t.registrations, p.mergeIds, ctx.eventId);
    return {
      diff: merged.map((r) => ({
        entity: "registrations",
        id: r.id,
        before: { status: r.status, duplicateOfId: r.duplicateOfId },
        after: { status: "cancelled", duplicateOfId: keep.id },
      })),
      impact: impact({ people: 1, attendees: 1 }),
      preconditions: [keep, ...merged].map((r) => ({
        entity: "registrations",
        id: r.id,
        version: r.version,
      })),
    };
  },
  async execute(p, ctx) {
    const keep = await mustLoad(ctx.db, t.registrations, p.keepId, ctx.eventId, "Registration");
    if (p.mergeIds.includes(keep.id)) throw new ExecutionError("Cannot merge a registration into itself");
    const merged = await loadMany(ctx.db, t.registrations, p.mergeIds, ctx.eventId);
    if (merged.length !== p.mergeIds.length)
      throw new ExecutionError("Some registrations are not in this event");
    const keepChoices = new Set(
      (
        await ctx.db
          .select({ s: t.sessionChoices.sessionId })
          .from(t.sessionChoices)
          .where(eq(t.sessionChoices.registrationId, keep.id))
      ).map((r) => r.s),
    );
    const added: string[] = [];
    for (const r of merged) {
      const choices = await ctx.db
        .select({ s: t.sessionChoices.sessionId })
        .from(t.sessionChoices)
        .where(eq(t.sessionChoices.registrationId, r.id));
      for (const c of choices) {
        if (!keepChoices.has(c.s)) {
          await ctx.db
            .insert(t.sessionChoices)
            .values({ registrationId: keep.id, sessionId: c.s, eventId: ctx.eventId });
          keepChoices.add(c.s);
          added.push(c.s);
        }
      }
      await ctx.db
        .update(t.registrations)
        .set({ status: "cancelled", duplicateOfId: keep.id, version: bumpVersion(t.registrations) })
        .where(eq(t.registrations.id, r.id));
      await ctx.db
        .update(t.tickets)
        .set({ revoked: true, revokedAt: ctx.now })
        .where(eq(t.tickets.registrationId, r.id));
    }
    ctx.emit({
      type: "registration.merged",
      entity: "registrations",
      entityId: keep.id,
      payload: { keepId: keep.id, mergeIds: p.mergeIds },
    });
    return {
      undoData: {
        merged: merged.map((r) => ({ id: r.id, status: r.status, duplicateOfId: r.duplicateOfId })),
        added,
      },
    };
  },
  async inverse(p, undo, ctx) {
    for (const r of undo.merged as { id: string; status: string; duplicateOfId: string | null }[]) {
      await ctx.db
        .update(t.registrations)
        .set({ status: r.status, duplicateOfId: r.duplicateOfId, version: bumpVersion(t.registrations) })
        .where(and(eq(t.registrations.id, r.id), eq(t.registrations.eventId, ctx.eventId)));
      if (r.status === "confirmed")
        await ctx.db
          .update(t.tickets)
          .set({ revoked: false, revokedAt: null })
          .where(eq(t.tickets.registrationId, r.id));
    }
    const added = undo.added as string[];
    if (added.length)
      await ctx.db
        .delete(t.sessionChoices)
        .where(
          and(eq(t.sessionChoices.registrationId, p.keepId), inArray(t.sessionChoices.sessionId, added)),
        );
  },
};

export const setCapacity: Executor<"registration.capacity.set"> = {
  kind: "registration.capacity.set",
  async describe(p, ctx) {
    if (p.sessionId) {
      const s = await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
      return {
        diff: [
          { entity: "sessions", id: s.id, before: { capacity: s.capacity }, after: { capacity: p.capacity } },
        ],
        impact: impact({ sessions: 1 }),
        preconditions: [{ entity: "sessions", id: s.id, version: s.version }],
      };
    }
    const [ev] = await ctx.db.select().from(t.events).where(eq(t.events.id, ctx.eventId));
    return {
      diff: [
        {
          entity: "events",
          id: ctx.eventId,
          before: { capacity: ev?.capacity ?? null },
          after: { capacity: p.capacity },
        },
      ],
      impact: impact(),
      preconditions: ev ? [{ entity: "events", id: ev.id, version: ev.version }] : [],
    };
  },
  async execute(p, ctx) {
    if (p.sessionId) {
      const s = await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
      await ctx.db
        .update(t.sessions)
        .set({ capacity: p.capacity, version: bumpVersion(t.sessions) })
        .where(eq(t.sessions.id, s.id));
      ctx.emit({
        type: "session.updated",
        entity: "sessions",
        entityId: s.id,
        payload: { sessionId: s.id, capacity: { before: s.capacity, after: p.capacity } },
      });
      return { undoData: { capacity: s.capacity } };
    }
    const [ev] = await ctx.db.select().from(t.events).where(eq(t.events.id, ctx.eventId));
    await ctx.db
      .update(t.events)
      .set({ capacity: p.capacity, version: bumpVersion(t.events) })
      .where(eq(t.events.id, ctx.eventId));
    return { undoData: { capacity: ev?.capacity ?? 0 } };
  },
  async inverse(p, undo, ctx) {
    if (p.sessionId)
      await ctx.db
        .update(t.sessions)
        .set({ capacity: undo.capacity as number, version: bumpVersion(t.sessions) })
        .where(and(eq(t.sessions.id, p.sessionId), eq(t.sessions.eventId, ctx.eventId)));
    else
      await ctx.db
        .update(t.events)
        .set({ capacity: undo.capacity as number, version: bumpVersion(t.events) })
        .where(eq(t.events.id, ctx.eventId));
  },
};
