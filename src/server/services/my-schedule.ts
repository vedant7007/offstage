/**
 * The attendee's schedule: every session of their event, which ones they chose, and the most
 * recent change to each (for the "changed" chip). Change text is written from the session's
 * current state, so it always matches what the schedule shows.
 */
import { and, desc, eq, inArray } from "drizzle-orm";
import type { UserActor } from "@/contracts";
import type { MyScheduleResponse } from "@/contracts/api";
import { db } from "@/db/client";
import { domainEvents, registrations, sessionChoices } from "@/db/schema";
import { formatTime } from "@/lib/time";
import { cachedWorld } from "./public";

const CHANGE_KIND = {
  "session.updated": "moved",
  "session.room_changed": "room_changed",
  "session.cancelled": "cancelled",
  "session.running_late": "delayed",
} as const;
type ChangeType = keyof typeof CHANGE_KIND;

export async function getMySchedule(actor: UserActor): Promise<MyScheduleResponse> {
  const world = await cachedWorld(actor.eventId);
  const [mine, changes] = await Promise.all([
    db
      .select({ sessionId: sessionChoices.sessionId })
      .from(sessionChoices)
      .innerJoin(registrations, eq(registrations.id, sessionChoices.registrationId))
      .where(and(eq(registrations.eventId, actor.eventId), eq(registrations.userId, actor.userId))),
    db
      .select({ type: domainEvents.type, sessionId: domainEvents.entityId, at: domainEvents.at })
      .from(domainEvents)
      .where(
        and(
          eq(domainEvents.eventId, actor.eventId),
          eq(domainEvents.entity, "session"),
          inArray(domainEvents.type, Object.keys(CHANGE_KIND)),
        ),
      )
      .orderBy(desc(domainEvents.seq))
      .limit(500),
  ]);
  const chosen = new Set(mine.map((m) => m.sessionId));
  const latest = new Map<string, (typeof changes)[number]>();
  for (const c of changes) if (!latest.has(c.sessionId)) latest.set(c.sessionId, c);
  const roomName = (id: string) => world.rooms.find((r) => r.id === id)?.name ?? "a new room";

  return {
    sessions: world.sessions.map((s) => {
      const c = latest.get(s.id);
      const kind = c && CHANGE_KIND[c.type as ChangeType];
      const text =
        kind === "cancelled"
          ? "Cancelled"
          : kind === "delayed"
            ? `Running ${s.delayMinutes} min late`
            : kind === "room_changed"
              ? `Now in ${roomName(s.roomId)}`
              : `Now at ${formatTime(s.startsAt)} in ${roomName(s.roomId)}`;
      return {
        ...s,
        mine: chosen.has(s.id),
        change: kind && c ? { kind, text, at: c.at.toISOString() } : undefined,
      };
    }),
    rooms: world.rooms,
  };
}
