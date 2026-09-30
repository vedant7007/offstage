/**
 * Registration search for the check-in desk ("my QR will not load"). Crew with check-in rights only,
 * one event, at most 20 results, contact details masked. Email and phone are encrypted at rest,
 * so they match exactly through their lookup hash; names and roll numbers match by substring.
 */
import { and, asc, eq, ilike, or, type SQL } from "drizzle-orm";
import type { RegistrationSummary, UserActor } from "@/contracts";
import { db } from "@/db/client";
import { registrations } from "@/db/schema";
import { maskEmail, maskPhone } from "@/lib/format";
import { requirePermission } from "@/server/authz";
import { enforce } from "@/server/rate-limit";
import { decrypt, decryptOptional, emailHash, phoneHash } from "@/server/pii";

const LIMIT = 20;

/** Escape LIKE wildcards so "a_b" or "50%" match literally. */
const like = (s: string) => `%${s.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export async function searchRegistrations(actor: UserActor, q: string): Promise<RegistrationSummary[]> {
  requirePermission(actor, "registration.search", { eventId: actor.eventId });
  requirePermission(actor, "checkin.scan", { eventId: actor.eventId });
  // Enough for a busy desk, too few to page through everyone.
  await enforce(`crew-search:${actor.userId}`, 60, 60, "Too many searches. Wait a minute.");

  const term = q.trim();
  const match: SQL[] = [ilike(registrations.name, like(term)), ilike(registrations.rollNo, like(term))];
  if (term.includes("@")) match.push(eq(registrations.emailHash, emailHash(term)));
  const ph = /\d{6,}/.test(term) ? phoneHash(term) : null;
  if (ph) match.push(eq(registrations.phoneHash, ph));

  const rows = await db
    .select()
    .from(registrations)
    .where(and(eq(registrations.eventId, actor.eventId), or(...match)))
    .orderBy(asc(registrations.name))
    .limit(LIMIT);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    college: r.college,
    department: r.department,
    year: r.year,
    section: r.section,
    emailMasked: maskEmail(decrypt(r.emailEnc)),
    phoneMasked: r.phoneEnc ? maskPhone(decryptOptional(r.phoneEnc)!) : undefined,
    status: r.status as RegistrationSummary["status"],
    checkedInAt: r.checkedInAt?.toISOString(),
  }));
}
