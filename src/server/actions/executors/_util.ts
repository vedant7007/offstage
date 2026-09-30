import { and, eq, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import * as t from "@/db/schema";
import { ExecutionError, type Tx } from "../types";

type Scoped = PgTable & { id: AnyPgColumn; eventId: AnyPgColumn };

/** Load one row of the event or fail the proposal with a clear message. */
export async function mustLoad<T extends Scoped>(
  db: Tx,
  table: T,
  id: string,
  eventId: string,
  what: string,
): Promise<T["$inferSelect"]> {
  const rows = (await db
    .select()
    .from(table as PgTable)
    .where(and(eq(table.id, id), eq(table.eventId, eventId)))
    .limit(1)) as T["$inferSelect"][];
  const row = rows[0];
  if (!row) throw new ExecutionError(`${what} ${id} not found in this event`);
  return row;
}

export async function loadMany<T extends Scoped>(
  db: Tx,
  table: T,
  ids: string[],
  eventId: string,
): Promise<T["$inferSelect"][]> {
  if (ids.length === 0) return [];
  return (await db
    .select()
    .from(table as PgTable)
    .where(and(inArray(table.id, ids), eq(table.eventId, eventId)))) as T["$inferSelect"][];
}

/** Confirmed registrations that chose a session. */
export async function sessionAttendees(db: Tx, sessionId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(t.sessionChoices)
    .innerJoin(t.registrations, eq(t.registrations.id, t.sessionChoices.registrationId))
    .where(and(eq(t.sessionChoices.sessionId, sessionId), eq(t.registrations.status, "confirmed")));
  return rows[0]?.n ?? 0;
}

/** Volunteers assigned to shifts tied to a session. */
export async function sessionVolunteers(db: Tx, sessionId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(distinct ${t.shiftAssignments.volunteerId})::int` })
    .from(t.shiftAssignments)
    .innerJoin(t.shifts, eq(t.shifts.id, t.shiftAssignments.shiftId))
    .where(
      and(eq(t.shifts.sessionId, sessionId), inArray(t.shiftAssignments.status, ["assigned", "checked_in"])),
    );
  return rows[0]?.n ?? 0;
}

export async function sessionSpeakerIds(db: Tx, sessionId: string): Promise<string[]> {
  const rows = await db
    .select({ id: t.sessionSpeakers.speakerId })
    .from(t.sessionSpeakers)
    .where(eq(t.sessionSpeakers.sessionId, sessionId));
  return rows.map((r) => r.id);
}

export const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);
