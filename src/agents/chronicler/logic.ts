// The numbers of the final report, computed in code. The model may word them, never change them.

import type { Checkin, Incident, LedgerEntry, RegistrationSummary, Session, Volunteer } from "@/contracts";

export type ReportFacts = {
  confirmed: number;
  attended: number;
  sessionsDone: number;
  sessionsCancelled: number;
  sessionsTotal: number;
  incidents: number;
  incidentsResolved: number;
  helpdeskQuestions: number;
  volunteers: number;
  volunteerHours: number;
  moneyInInr: number;
  moneyOutInr: number;
};

export function reportFacts(w: {
  registrations: RegistrationSummary[];
  checkins: Checkin[];
  sessions: Session[];
  incidents: Incident[];
  helpdeskQuestions: number;
  volunteers: Volunteer[];
  ledger: LedgerEntry[];
}): ReportFacts {
  const sum = (xs: LedgerEntry[]) => xs.reduce((s, e) => s + e.amountInr, 0);
  const active = w.volunteers.filter((v) => v.active);
  return {
    confirmed: w.registrations.filter((r) => r.status === "confirmed").length,
    attended: new Set(w.checkins.filter((c) => !c.duplicate).map((c) => c.registrationId)).size,
    sessionsDone: w.sessions.filter((s) => s.status === "done").length,
    sessionsCancelled: w.sessions.filter((s) => s.status === "cancelled").length,
    sessionsTotal: w.sessions.length,
    incidents: w.incidents.length,
    incidentsResolved: w.incidents.filter((i) => i.status === "resolved").length,
    helpdeskQuestions: w.helpdeskQuestions,
    volunteers: active.length,
    volunteerHours: Math.round(active.reduce((s, v) => s + v.hoursServed, 0) * 10) / 10,
    moneyInInr: sum(w.ledger.filter((e) => e.type === "income" && e.status === "received")),
    moneyOutInr: sum(
      w.ledger.filter((e) => e.type === "expense" && (e.status === "paid" || e.status === "committed")),
    ),
  };
}

/** Non-emergency incidents that were resolved, oldest first: each one is a lesson for next year. */
export const lessonIncidents = (incidents: Incident[]) =>
  incidents
    .filter((i) => i.status === "resolved" && !i.emergency)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));

export const minutesToResolve = (i: Incident) =>
  i.resolvedAt
    ? Math.max(0, Math.round((Date.parse(i.resolvedAt) - Date.parse(i.createdAt)) / 60_000))
    : null;
