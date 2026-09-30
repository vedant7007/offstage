// Daily briefing. Every number is a fact computed here from read services; the model only writes the
// sentences, and a section whose text carries a number that is not one of its facts falls back to the
// rules sentence. Blueprint section 5, "Commander extras".

import { z } from "zod";
import type { Briefing, Domain, Fact } from "@/contracts";
import type { ReadServices } from "@/agents/runtime/services";
import type { PipelineIO } from "@/agents/runtime/types";
import { draft, onlyGivenNumbers } from "@/agents/runtime/wording";
import { spentBy } from "@/agents/finance/config";
import { formatInr } from "@/lib/format";
import { formatTime, istDateKey } from "@/lib/time";

type Key = Briefing["sections"][number]["key"];
type Section = { key: Key; title: string; facts: Fact[]; rules: string };

/** Numbers the services cannot see: decisions waiting in the approval queue. */
export type QueueFacts = { pending: number; pendingTwoApprovals: number };

/** Which lead gets which section; the event head gets all of them. */
const SECTION_DOMAINS: Record<Key, Domain[]> = {
  yesterday: ["planning"],
  today: ["planning", "schedule", "logistics"],
  at_risk: ["planning", "schedule"],
  decisions: ["planning"],
  money: ["finance", "sponsorship"],
  registrations: ["registrations", "marketing"],
  incidents: ["ops", "crew", "helpdesk"],
  agents: ["planning"],
};

const f = (id: string, label: string, value: string | number, source: string): Fact => ({
  id,
  label,
  value,
  source,
});

export async function briefingSections(s: ReadServices, queue: QueueFacts): Promise<Section[]> {
  const now = s.now();
  const today = istDateKey(now);
  const [sessions, rooms, milestones, budget, regs, incidents, checkins] = await Promise.all([
    s.sessions(),
    s.rooms(),
    s.milestones(),
    s.budget(),
    s.registrations({ limit: 100_000 }),
    s.incidents(),
    s.checkins(),
  ]);

  const todays = sessions
    .filter((x) => istDateKey(x.startsAt) === today)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const live = todays.filter((x) => x.status !== "cancelled");
  const cancelled = todays.length - live.length;
  const first = live[0];
  const today_: Section = {
    key: "today",
    title: "Today",
    facts: [
      f("sessions.today", "Sessions today", live.length, "sessions"),
      f("sessions.cancelled_today", "Cancelled today", cancelled, "sessions"),
      ...(first
        ? [
            f(
              "sessions.first",
              "First session",
              `${formatTime(first.startsAt)}, ${first.title}`,
              `sessions/${first.id}`,
            ),
          ]
        : []),
    ],
    rules: first
      ? `${live.length} sessions today, starting at ${formatTime(first.startsAt)} with ${first.title}.${cancelled ? ` ${cancelled} cancelled.` : ""}`
      : "No sessions today.",
  };

  const overdue = milestones.filter((m) => m.dueOn < today && m.status !== "done" && m.status !== "skipped");
  const room = new Map(rooms.map((r) => [r.id, r]));
  const overfull = live.filter((x) => {
    const cap = x.capacity ?? room.get(x.roomId ?? "")?.capacity;
    return cap !== undefined && x.registeredCount > cap;
  });
  const atRisk: Section = {
    key: "at_risk",
    title: "At risk",
    facts: [
      f("milestones.overdue", "Overdue milestones", overdue.length, "milestones"),
      f(
        "milestones.overdue_critical",
        "Critical overdue",
        overdue.filter((m) => m.critical).length,
        "milestones",
      ),
      f("sessions.overfull", "Sessions with more registrations than seats", overfull.length, "sessions"),
      ...overdue.slice(0, 3).map((m) => f(`milestone.${m.id}`, "Overdue", m.title, `milestones/${m.id}`)),
      ...overfull.slice(0, 3).map((x) => f(`session.${x.id}`, "Over capacity", x.title, `sessions/${x.id}`)),
    ],
    rules:
      overdue.length || overfull.length
        ? `${overdue.length} overdue milestones and ${overfull.length} sessions with more registrations than seats.`
        : "Nothing overdue and no session over capacity.",
  };

  const decisions: Section = {
    key: "decisions",
    title: "Decisions waiting",
    facts: [
      f("proposals.pending", "Waiting for approval", queue.pending, "proposals"),
      f("proposals.pending_t3", "Need two approvals", queue.pendingTwoApprovals, "proposals"),
    ],
    rules: `${queue.pending} proposals wait for approval, ${queue.pendingTwoApprovals} of them need two approvals.`,
  };

  const spent = spentBy(budget.ledger);
  const cap = budget.categories.reduce((a, c) => a + c.capInr, 0);
  const used = budget.categories.reduce((a, c) => a + (spent.get(c.id) ?? 0), 0);
  const hot = budget.categories.filter((c) => (spent.get(c.id) ?? 0) >= 0.8 * c.capInr);
  const money: Section = {
    key: "money",
    title: "Money",
    facts: [
      f("budget.total.cap", "Total budget", formatInr(cap), "budget_categories"),
      f("budget.total.used", "Spent or committed", formatInr(used), "ledger_entries"),
      f("budget.total.pct", "Share used", `${cap ? Math.round((used / cap) * 100) : 0}%`, "ledger_entries"),
      ...hot.map((c) =>
        f(
          `budget.${c.key}.pct`,
          `${c.name} used`,
          `${Math.round(((spent.get(c.id) ?? 0) / c.capInr) * 100)}%`,
          `budget_categories/${c.id}`,
        ),
      ),
    ],
    rules: `${formatInr(used)} of ${formatInr(cap)} spent or committed.${hot.length ? ` ${hot.map((c) => c.name).join(", ")} at 80% or more of the cap.` : ""}`,
  };

  const confirmed = regs.filter((r) => r.status === "confirmed").length;
  const waitlisted = regs.filter((r) => r.status === "waitlisted").length;
  const inToday = checkins.filter((c) => !c.duplicate && istDateKey(c.serverTime) === today).length;
  const registrations: Section = {
    key: "registrations",
    title: "Registrations",
    facts: [
      f("registrations.confirmed", "Confirmed", confirmed, "registrations"),
      f("registrations.waitlisted", "Waitlisted", waitlisted, "registrations"),
      f("checkins.today", "Checked in today", inToday, "checkins"),
    ],
    rules: `${confirmed} confirmed, ${waitlisted} on the waitlist, ${inToday} checked in today.`,
  };

  const open = incidents.filter((i) => i.status !== "resolved");
  const serious = open.filter((i) => i.severity === "high" || i.severity === "critical");
  const incidents_: Section = {
    key: "incidents",
    title: "Incidents",
    facts: [
      f("incidents.open", "Open incidents", open.length, "incidents"),
      f("incidents.serious", "High or critical", serious.length, "incidents"),
      ...serious.slice(0, 3).map((i) => f(`incident.${i.id}`, "Open", i.title, `incidents/${i.id}`)),
    ],
    rules: `${open.length} open incidents, ${serious.length} high or critical.`,
  };

  return [today_, atRisk, decisions, money, registrations, incidents_];
}

const Narratives = z.object({
  sections: z.array(z.object({ key: z.string(), narrative: z.string().max(600) })),
});

export async function writeBriefing(
  s: ReadServices,
  queue: QueueFacts,
  opts: { domain?: Domain; io: Pick<PipelineIO, "runId" | "onAttempt" | "critical"> | null },
): Promise<Omit<Briefing, "id" | "eventId" | "generatedAt">> {
  const all = await briefingSections(s, queue);
  const sections = opts.domain ? all.filter((x) => SECTION_DOMAINS[x.key].includes(opts.domain!)) : all;
  const factText = (x: Section) => x.facts.map((q) => `${q.label}: ${q.value}`).join("; ");
  const words = opts.io
    ? await draft(opts.io, {
        schema: Narratives,
        instructions:
          "Write the event head's morning briefing. For each section key, one or two calm sentences using only that section's facts. Numbers exactly as given.",
        facts: sections.map((x) => `[${x.key}] ${factText(x)}`).join("\n"),
      })
    : null;
  let modelUsed = false;
  const out = sections.map((x) => {
    const n = words?.sections.find((w) => w.key === x.key)?.narrative;
    // A narrative that just lists "Label: value" pairs says less than the rules sentence.
    const listing = !!n && x.facts.filter((q) => n.includes(`${q.label}:`)).length >= 2;
    const ok = !!n && !listing && onlyGivenNumbers(n, `${factText(x)} ${x.rules}`);
    if (ok) modelUsed = true;
    return { key: x.key, title: x.title, narrative: ok ? n! : x.rules, factIds: x.facts.map((q) => q.id) };
  });
  return {
    date: istDateKey(s.now()),
    scope: { domain: opts.domain, full: !opts.domain },
    sections: out,
    facts: sections.flatMap((x) => x.facts),
    generatedBy: modelUsed ? "model" : "rules",
  };
}
