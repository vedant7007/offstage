// The numbers of the final report, computed in code. The model may word them, never change them.

import type {
  Checkin,
  CloseoutReport,
  Escalation,
  Incident,
  LedgerEntry,
  RegistrationSummary,
  Session,
  Volunteer,
} from "@/contracts";
import { formatInr } from "@/lib/format";

export type ReportFacts = {
  confirmed: number;
  attended: number;
  sessionsDone: number;
  sessionsCancelled: number;
  sessionsTotal: number;
  incidents: number;
  incidentsResolved: number;
  helpdeskQuestions: number;
  escalations: number;
  escalationsOpen: number;
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
  escalations: Escalation[];
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
    escalations: w.escalations.length,
    escalationsOpen: w.escalations.filter((e) => e.status === "open").length,
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

// The close-out report page (src/server/services/closeout.ts) counts in SQL; these turn its numbers into text.
export type CloseoutFacts = Omit<CloseoutReport, "summary" | "generatedAt">;

/** The numbers as "label: value" lines: what the model sees, and what its summary is checked against. */
export function closeoutFactLines(f: CloseoutFacts): string {
  const a = f.attendance;
  const sent = f.messages.reduce((s, m) => s + m.real + m.mock, 0);
  return [
    `Registered: ${a.registered}`,
    `Confirmed: ${a.confirmed}`,
    `Attended: ${a.attended}`,
    `No-shows: ${a.noShows}`,
    `Attendance rate: ${a.ratePct}%`,
    `Sessions: ${f.sessions.total}`,
    `Sessions changed: ${f.sessions.changed}`,
    `Sessions cancelled: ${f.sessions.cancelled}`,
    `Messages delivered (real and mock): ${sent}`,
    `In-app notifications: ${f.inAppNotifications}`,
    `Helpdesk questions: ${f.helpdesk.questions}`,
    `Injection attempts blocked: ${f.helpdesk.blocked}`,
    `Escalations: ${f.helpdesk.escalations}`,
    `Escalations still open: ${f.helpdesk.escalationsOpen}`,
    `Incidents: ${f.incidents.total}`,
    `Incidents resolved: ${f.incidents.resolved}`,
    `Budget cap: ${formatInr(f.budget.capInr)}`,
    `Budget spent or committed: ${formatInr(f.budget.spentInr)}`,
    `Income received: ${formatInr(f.budget.incomeInr)}`,
    `Proposals: ${f.approvals.reduce((s, x) => s + x.total, 0)}`,
    `Proposals executed: ${f.approvals.reduce((s, x) => s + x.executed, 0)}`,
    `Certificates issued: ${f.certificates.issued}`,
    `OD letters: ${f.odLetters.students}`,
  ].join("\n");
}

export function closeoutRulesSummary(f: CloseoutFacts): string {
  const a = f.attendance;
  return `${a.attended} of ${a.confirmed} confirmed people attended (${a.ratePct}%). ${f.sessions.changed} sessions changed and ${f.sessions.cancelled} were cancelled. The helpdesk took ${f.helpdesk.questions} questions and escalated ${f.helpdesk.escalations}. ${f.incidents.resolved} of ${f.incidents.total} incidents were resolved.`;
}
