/**
 * Crew reads. Scoped by the event of the calling actor, never by input.
 * More crew services (shifts, assignments) land with the read services in Checkpoint 4.
 */
import { asc, eq } from "drizzle-orm";
import { Availability, type Actor } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import { availability } from "@/db/schema";

function eventOf(actor: Actor): string {
  if (!actor.eventId) throw new Error("This actor is not bound to an event");
  return actor.eventId;
}

/** Availability windows for every volunteer of the actor's event (issue #20). */
export async function listAvailability(
  actor: Actor,
  client: Pick<Db, "select"> = defaultDb,
): Promise<Availability[]> {
  const rows = await client
    .select()
    .from(availability)
    .where(eq(availability.eventId, eventOf(actor)))
    .orderBy(asc(availability.volunteerId), asc(availability.start));
  return rows.map((r) =>
    Availability.parse({
      id: r.id,
      eventId: r.eventId,
      volunteerId: r.volunteerId,
      start: r.start.toISOString(),
      end: r.end.toISOString(),
    }),
  );
}
