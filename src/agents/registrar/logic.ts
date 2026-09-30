// Registrar judgement, as plain functions over masked registration rows: likely duplicates and who comes off
// the waitlist next. No contact details are needed for either.

import type { RegistrationSummary } from "@/contracts";

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

/** Same person, typed twice: same normalised name, college, department and year. */
export const personKey = (r: RegistrationSummary) =>
  [norm(r.name), norm(r.college), norm(r.department), r.year].join("|");

/**
 * Later rows that match an earlier live row. The first row in list order is the original; cancelled and
 * rejected rows are ignored. With `onlyId`, only pairs where that registration is the duplicate.
 */
export function duplicates(regs: RegistrationSummary[], onlyId?: string) {
  const first = new Map<string, string>();
  const out: { registrationId: string; duplicateOfId: string }[] = [];
  for (const r of regs) {
    if (r.status === "cancelled" || r.status === "rejected") continue;
    const k = personKey(r);
    const orig = first.get(k);
    if (!orig) first.set(k, r.id);
    else if (!onlyId || r.id === onlyId) out.push({ registrationId: r.id, duplicateOfId: orig });
  }
  return out;
}

/** Waitlisted ids to promote, in list (waitlist) order, filling the seats confirmed rows leave free. */
export function toPromote(regs: RegistrationSummary[], capacity: number): string[] {
  const confirmed = regs.filter((r) => r.status === "confirmed").length;
  const free = Math.max(0, capacity - confirmed);
  return regs
    .filter((r) => r.status === "waitlisted")
    .slice(0, Math.min(free, 500))
    .map((r) => r.id);
}
