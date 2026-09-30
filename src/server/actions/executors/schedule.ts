import { and, asc, eq, gte, inArray, ne } from "drizzle-orm";
import { DomainEventPayloads } from "@/contracts";
import * as t from "@/db/schema";
import { bumpVersion } from "@/db/versioning";
import { ExecutionError, impact, type Executor } from "../types";
import { iso, mustLoad, sessionAttendees, sessionSpeakerIds, sessionVolunteers } from "./_util";

type SessionRow = typeof t.sessions.$inferSelect;

function slot(s: Pick<SessionRow, "startsAt" | "endsAt" | "roomId">) {
  return { startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(), roomId: s.roomId };
}

async function peopleFor(db: Parameters<typeof sessionAttendees>[0], sessionId: string) {
  const [attendees, volunteers, speakers] = await Promise.all([
    sessionAttendees(db, sessionId),
    sessionVolunteers(db, sessionId),
    sessionSpeakerIds(db, sessionId),
  ]);
  return { attendees, volunteers, speakers: speakers.length, speakerIds: speakers };
}

export const moveSession: Executor<"schedule.move_session"> = {
  kind: "schedule.move_session",
  async describe(p, ctx) {
    const s = await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
    if (new Date(p.newEndsAt) <= new Date(p.newStartsAt))
      throw new ExecutionError("The new end must be after the new start");
    const who = await peopleFor(ctx.db, s.id);
    const after = { startsAt: p.newStartsAt, endsAt: p.newEndsAt, roomId: p.newRoomId ?? s.roomId };
    return {
      diff: [{ entity: "sessions", id: s.id, before: slot(s), after }],
      impact: impact({
        people: who.attendees + who.volunteers + who.speakers,
        attendees: who.attendees,
        volunteers: who.volunteers,
        sessions: 1,
      }),
      preconditions: [{ entity: "sessions", id: s.id, version: s.version }],
    };
  },
  async execute(p, ctx) {
    const s = await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
    let capacity = s.capacity;
    if (p.newRoomId && p.newRoomId !== s.roomId) {
      const room = await mustLoad(ctx.db, t.rooms, p.newRoomId, ctx.eventId, "Room");
      capacity = room.capacity;
    }
    await ctx.db
      .update(t.sessions)
      .set({
        startsAt: new Date(p.newStartsAt),
        endsAt: new Date(p.newEndsAt),
        roomId: p.newRoomId ?? s.roomId,
        capacity,
        version: bumpVersion(t.sessions),
      })
      .where(eq(t.sessions.id, s.id));
    ctx.emit({
      type: "session.updated",
      entity: "sessions",
      entityId: s.id,
      payload: DomainEventPayloads["session.updated"].parse({
        sessionId: s.id,
        before: slot(s),
        after: { startsAt: p.newStartsAt, endsAt: p.newEndsAt, roomId: p.newRoomId ?? s.roomId },
        proposalId: ctx.proposalId,
      }),
    });
    return { undoData: { before: { ...slot(s), capacity: s.capacity } } };
  },
  async inverse(p, undo, ctx) {
    const b = undo.before as { startsAt: string; endsAt: string; roomId: string; capacity: number };
    const s = await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
    await ctx.db
      .update(t.sessions)
      .set({
        startsAt: new Date(b.startsAt),
        endsAt: new Date(b.endsAt),
        roomId: b.roomId,
        capacity: b.capacity,
        version: bumpVersion(t.sessions),
      })
      .where(eq(t.sessions.id, s.id));
    ctx.emit({
      type: "session.updated",
      entity: "sessions",
      entityId: s.id,
      payload: {
        sessionId: s.id,
        before: slot(s),
        after: { startsAt: b.startsAt, endsAt: b.endsAt, roomId: b.roomId },
        undo: true,
      },
    });
  },
};

export const changeRoom: Executor<"schedule.change_room"> = {
  kind: "schedule.change_room",
  async describe(p, ctx) {
    const s = await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
    const room = await mustLoad(ctx.db, t.rooms, p.newRoomId, ctx.eventId, "Room");
    const who = await peopleFor(ctx.db, s.id);
    return {
      diff: [
        {
          entity: "sessions",
          id: s.id,
          before: { roomId: s.roomId, capacity: s.capacity },
          after: { roomId: room.id, capacity: room.capacity },
        },
      ],
      impact: impact({
        people: who.attendees + who.volunteers + who.speakers,
        attendees: who.attendees,
        volunteers: who.volunteers,
        sessions: 1,
      }),
      preconditions: [{ entity: "sessions", id: s.id, version: s.version }],
    };
  },
  async execute(p, ctx) {
    const s = await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
    const room = await mustLoad(ctx.db, t.rooms, p.newRoomId, ctx.eventId, "Room");
    await ctx.db
      .update(t.sessions)
      .set({ roomId: room.id, capacity: room.capacity, version: bumpVersion(t.sessions) })
      .where(eq(t.sessions.id, s.id));
    const payload = DomainEventPayloads["session.updated"].parse({
      sessionId: s.id,
      before: slot(s),
      after: { ...slot(s), roomId: room.id },
      proposalId: ctx.proposalId,
    });
    ctx.emit({ type: "session.room_changed", entity: "sessions", entityId: s.id, payload });
    ctx.emit({ type: "session.updated", entity: "sessions", entityId: s.id, payload });
    return { undoData: { roomId: s.roomId, capacity: s.capacity } };
  },
  async inverse(p, undo, ctx) {
    await ctx.db
      .update(t.sessions)
      .set({
        roomId: undo.roomId as string,
        capacity: undo.capacity as number,
        version: bumpVersion(t.sessions),
      })
      .where(and(eq(t.sessions.id, p.sessionId), eq(t.sessions.eventId, ctx.eventId)));
    ctx.emit({
      type: "session.room_changed",
      entity: "sessions",
      entityId: p.sessionId,
      payload: { sessionId: p.sessionId, roomId: undo.roomId, undo: true },
    });
  },
};

export const cancelSession: Executor<"schedule.cancel_session"> = {
  kind: "schedule.cancel_session",
  async describe(p, ctx) {
    const s = await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
    const who = await peopleFor(ctx.db, s.id);
    return {
      diff: [{ entity: "sessions", id: s.id, before: { status: s.status }, after: { status: "cancelled" } }],
      impact: impact({
        people: who.attendees + who.volunteers + who.speakers,
        attendees: who.attendees,
        volunteers: who.volunteers,
        sessions: 1,
      }),
      preconditions: [{ entity: "sessions", id: s.id, version: s.version }],
    };
  },
  async execute(p, ctx) {
    const s = await mustLoad(ctx.db, t.sessions, p.sessionId, ctx.eventId, "Session");
    if (s.status === "cancelled") throw new ExecutionError("Session is already cancelled");
    const who = await peopleFor(ctx.db, s.id);
    await ctx.db
      .update(t.sessions)
      .set({ status: "cancelled", version: bumpVersion(t.sessions) })
      .where(eq(t.sessions.id, s.id));
    ctx.emit({
      type: "session.cancelled",
      entity: "sessions",
      entityId: s.id,
      payload: DomainEventPayloads["session.cancelled"].parse({
        sessionId: s.id,
        reason: p.reason,
        speakerIds: who.speakerIds,
        registeredCount: who.attendees,
        proposalId: ctx.proposalId,
      }),
    });
    return { undoData: { status: s.status } };
  },
  async inverse(p, undo, ctx) {
    await ctx.db
      .update(t.sessions)
      .set({ status: undo.status as string, version: bumpVersion(t.sessions) })
      .where(and(eq(t.sessions.id, p.sessionId), eq(t.sessions.eventId, ctx.eventId)));
    ctx.emit({
      type: "session.updated",
      entity: "sessions",
      entityId: p.sessionId,
      payload: { sessionId: p.sessionId, restored: true, undo: true },
    });
  },
};

export const createSession: Executor<"schedule.create_session"> = {
  kind: "schedule.create_session",
  async describe(p, ctx) {
    const room = await mustLoad(ctx.db, t.rooms, p.roomId, ctx.eventId, "Room");
    if (new Date(p.endsAt) <= new Date(p.startsAt))
      throw new ExecutionError("The end must be after the start");
    return {
      diff: [
        {
          entity: "sessions",
          id: null,
          before: null,
          after: { title: p.title, roomId: room.id, startsAt: p.startsAt, endsAt: p.endsAt },
        },
      ],
      impact: impact({ people: p.speakerIds.length, sessions: 1 }),
      preconditions: [],
    };
  },
  async execute(p, ctx) {
    const room = await mustLoad(ctx.db, t.rooms, p.roomId, ctx.eventId, "Room");
    const [row] = await ctx.db
      .insert(t.sessions)
      .values({
        eventId: ctx.eventId,
        trackId: p.trackId ?? null,
        roomId: room.id,
        title: p.title,
        description: p.description ?? null,
        kind: p.kind,
        startsAt: new Date(p.startsAt),
        endsAt: new Date(p.endsAt),
        capacity: p.capacity ?? room.capacity,
      })
      .returning({ id: t.sessions.id });
    if (p.speakerIds.length) {
      await ctx.db
        .insert(t.sessionSpeakers)
        .values(p.speakerIds.map((speakerId) => ({ sessionId: row!.id, speakerId })));
    }
    ctx.emit({
      type: "session.created",
      entity: "sessions",
      entityId: row!.id,
      payload: { sessionId: row!.id, title: p.title },
    });
    return { undoData: { sessionId: row!.id } };
  },
  async inverse(_p, undo, ctx) {
    const id = undo.sessionId as string;
    const choices = await sessionAttendees(ctx.db, id);
    if (choices > 0) throw new ExecutionError("People already chose this session; cancel it instead");
    await ctx.db.delete(t.sessions).where(and(eq(t.sessions.id, id), eq(t.sessions.eventId, ctx.eventId)));
  },
};

export const shiftDownstream: Executor<"schedule.shift_downstream"> = {
  kind: "schedule.shift_downstream",
  async describe(p, ctx) {
    const affected = await affectedSessions(p, ctx);
    let attendees = 0;
    for (const s of affected) attendees += await sessionAttendees(ctx.db, s.id);
    return {
      diff: affected.map((s) => ({
        entity: "sessions",
        id: s.id,
        before: { startsAt: iso(s.startsAt), endsAt: iso(s.endsAt), delayMinutes: s.delayMinutes },
        after: {
          startsAt: iso(new Date(s.startsAt.getTime() + p.minutes * 60_000)),
          endsAt: iso(new Date(s.endsAt.getTime() + p.minutes * 60_000)),
          delayMinutes: s.delayMinutes + p.minutes,
        },
      })),
      impact: impact({ people: attendees, attendees, sessions: affected.length }),
      preconditions: affected.map((s) => ({ entity: "sessions", id: s.id, version: s.version })),
    };
  },
  async execute(p, ctx) {
    const affected = await affectedSessions(p, ctx);
    if (affected.length === 0) throw new ExecutionError("No sessions match; nothing to shift");
    for (const s of affected) {
      const delay = s.delayMinutes + p.minutes;
      await ctx.db
        .update(t.sessions)
        .set({
          startsAt: new Date(s.startsAt.getTime() + p.minutes * 60_000),
          endsAt: new Date(s.endsAt.getTime() + p.minutes * 60_000),
          delayMinutes: Math.max(0, delay),
          status: delay > 0 && s.status === "scheduled" ? "delayed" : s.status,
          version: bumpVersion(t.sessions),
        })
        .where(eq(t.sessions.id, s.id));
      if (p.minutes > 0) {
        ctx.emit({
          type: "session.running_late",
          entity: "sessions",
          entityId: s.id,
          payload: { sessionId: s.id, minutes: p.minutes },
        });
      }
      ctx.emit({
        type: "session.updated",
        entity: "sessions",
        entityId: s.id,
        payload: {
          sessionId: s.id,
          before: slot(s),
          after: {
            ...slot({
              ...s,
              startsAt: new Date(s.startsAt.getTime() + p.minutes * 60_000),
              endsAt: new Date(s.endsAt.getTime() + p.minutes * 60_000),
            }),
          },
          proposalId: ctx.proposalId,
        },
      });
    }
    return {
      undoData: {
        sessions: affected.map((s) => ({
          id: s.id,
          startsAt: iso(s.startsAt),
          endsAt: iso(s.endsAt),
          delayMinutes: s.delayMinutes,
          status: s.status,
        })),
      },
    };
  },
  async inverse(_p, undo, ctx) {
    for (const s of undo.sessions as {
      id: string;
      startsAt: string;
      endsAt: string;
      delayMinutes: number;
      status: string;
    }[]) {
      await ctx.db
        .update(t.sessions)
        .set({
          startsAt: new Date(s.startsAt),
          endsAt: new Date(s.endsAt),
          delayMinutes: s.delayMinutes,
          status: s.status,
          version: bumpVersion(t.sessions),
        })
        .where(and(eq(t.sessions.id, s.id), eq(t.sessions.eventId, ctx.eventId)));
    }
  },
};

async function affectedSessions(
  p: { fromTime: string; roomId?: string; trackId?: string; sessionIds?: string[] },
  ctx: { db: Parameters<typeof mustLoad>[0]; eventId: string },
): Promise<SessionRow[]> {
  const conds = [eq(t.sessions.eventId, ctx.eventId), ne(t.sessions.status, "cancelled")];
  if (p.sessionIds?.length) conds.push(inArray(t.sessions.id, p.sessionIds));
  else {
    conds.push(gte(t.sessions.startsAt, new Date(p.fromTime)));
    if (p.roomId) conds.push(eq(t.sessions.roomId, p.roomId));
    if (p.trackId) conds.push(eq(t.sessions.trackId, p.trackId));
  }
  return ctx.db
    .select()
    .from(t.sessions)
    .where(and(...conds))
    .orderBy(asc(t.sessions.startsAt));
}
