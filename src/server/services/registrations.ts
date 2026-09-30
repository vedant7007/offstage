/**
 * Registration reads. Always scoped by the actor's event; full records (with decrypted contact
 * details) only for the owner of the record or staff allowed by `registration.read`.
 */
import { and, eq } from "drizzle-orm";
import { Registration, type Actor, type UserActor } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import { registrations, sessionChoices } from "@/db/schema";
import { requirePermission } from "@/server/authz";
import { notFound } from "@/server/http";
import { decrypt, decryptOptional } from "@/server/pii";

type Row = typeof registrations.$inferSelect;

export function toRegistration(r: Row, choices: string[]): Registration {
  return Registration.parse({
    id: r.id,
    eventId: r.eventId,
    userId: r.userId ?? undefined,
    name: r.name,
    email: decrypt(r.emailEnc),
    phone: decryptOptional(r.phoneEnc),
    college: r.college,
    department: r.department,
    year: r.year,
    section: r.section,
    rollNo: r.rollNo ?? undefined,
    status: r.status,
    waitlistPosition: r.waitlistPosition ?? undefined,
    sessionChoices: choices,
    teamId: r.teamId ?? undefined,
    foodPref: r.foodPref,
    accessibility: r.accessibility ?? undefined,
    adultConfirmed: r.adultConfirmed,
    guardianConsent: r.guardianConsent,
    consentVersion: r.consentVersion,
    duplicateOfId: r.duplicateOfId ?? undefined,
    checkedInAt: r.checkedInAt?.toISOString(),
    createdAt: r.createdAt.toISOString(),
    version: r.version,
  });
}

async function choicesFor(client: Pick<Db, "select">, registrationId: string): Promise<string[]> {
  const rows = await client
    .select({ sessionId: sessionChoices.sessionId })
    .from(sessionChoices)
    .where(eq(sessionChoices.registrationId, registrationId));
  return rows.map((r) => r.sessionId);
}

function eventOf(actor: Actor): string {
  if (!actor.eventId) throw notFound();
  return actor.eventId;
}

/** One registration of the actor's event. 404 if it is not in that event, 403 if not theirs to see. */
export async function getRegistration(
  actor: Actor,
  registrationId: string,
  client: Pick<Db, "select"> = defaultDb,
): Promise<Registration> {
  const eventId = eventOf(actor);
  const [row] = await client
    .select()
    .from(registrations)
    .where(and(eq(registrations.id, registrationId), eq(registrations.eventId, eventId)))
    .limit(1);
  if (!row) throw notFound("Registration not found");
  requirePermission(actor, "registration.read", { eventId, ownerUserId: row.userId });
  return toRegistration(row, await choicesFor(client, row.id));
}

/** The caller's own registration for their active event, or null. */
export async function getMyRegistration(
  actor: UserActor,
  client: Pick<Db, "select"> = defaultDb,
): Promise<Registration | null> {
  const [row] = await client
    .select()
    .from(registrations)
    .where(and(eq(registrations.eventId, actor.eventId), eq(registrations.userId, actor.userId)))
    .limit(1);
  return row ? toRegistration(row, await choicesFor(client, row.id)) : null;
}
