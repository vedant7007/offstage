import type { AgentConfigSummary, AgentRun, AgentStep } from "../agents";
import type { DemoPersona } from "../api";
import type {
  Announcement,
  Briefing,
  BudgetCategory,
  BudgetCategoryStatus,
  Checkin,
  Checklist,
  Conversation,
  Escalation,
  Event,
  EventMembership,
  FinanceSummary,
  FunnelSnapshot,
  Incident,
  InventoryItem,
  KbDocument,
  LedgerEntry,
  MarketingPost,
  Message,
  MetricsSnapshot,
  Milestone,
  Org,
  PlaybookLesson,
  Quote,
  Registration,
  Room,
  Session,
  Shift,
  ShiftAssignment,
  Speaker,
  SponsorProspect,
  Task,
  Team,
  Ticket,
  Track,
  User,
  Volunteer,
  WhatIfResult,
} from "../domain";
import type { DomainEvent } from "../events";
import type { Role } from "../identity";
import type { ActionProposal } from "../proposals";

export interface Persona {
  userId: string;
  name: string;
  email: string;
  role: Role;
}

/** One complete event with everything around it. The seed inserts exactly this. */
export interface EventWorld {
  org: Org;
  users: User[];
  memberships: EventMembership[];
  personas: Partial<Record<DemoPersona, Persona>>;
  event: Event;
  rooms: Room[];
  tracks: Track[];
  sessions: Session[];
  speakers: Speaker[];
  registrations: Registration[];
  teams: Team[];
  tickets: Ticket[];
  checkins: Checkin[];
  volunteers: Volunteer[];
  shifts: Shift[];
  shiftAssignments: ShiftAssignment[];
  tasks: Task[];
  incidents: Incident[];
  kbDocuments: KbDocument[];
  conversations: Conversation[];
  messages: Message[];
  escalations: Escalation[];
  announcements: Announcement[];
  milestones: Milestone[];
  budgetCategories: BudgetCategory[];
  ledgerEntries: LedgerEntry[];
  quotes: Quote[];
  sponsorProspects: SponsorProspect[];
  marketingPosts: MarketingPost[];
  funnel: FunnelSnapshot[];
  checklists: Checklist[];
  inventory: InventoryItem[];
  proposals: ActionProposal[];
  agents: AgentConfigSummary[];
  agentRuns: AgentRun[];
  agentSteps: AgentStep[];
  domainEvents: DomainEvent[];
  briefings: Briefing[];
  whatIfRuns: WhatIfResult[];
  playbookLessons: PlaybookLesson[];
  /** The instant the fixture world is frozen at. Relative things ("last 10 minutes") use this. */
  now: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** finance.summary(): the same arithmetic the finance service uses. */
export function financeSummary(categories: BudgetCategory[], ledger: LedgerEntry[]): FinanceSummary {
  const rows: BudgetCategoryStatus[] = categories.map((c) => {
    const expenses = ledger.filter((e) => e.type === "expense" && e.categoryId === c.id);
    const refunds = ledger.filter((e) => e.type === "refund" && e.categoryId === c.id);
    const spent = expenses.filter((e) => e.status === "paid").reduce((s, e) => s + e.amountInr, 0);
    const committed = expenses.filter((e) => e.status === "committed").reduce((s, e) => s + e.amountInr, 0);
    const refunded = refunds.reduce((s, e) => s + e.amountInr, 0);
    const spentNet = Math.max(0, spent - refunded);
    const usedRatio = c.capInr > 0 ? (spentNet + committed) / c.capInr : 0;
    return {
      id: c.id,
      key: c.key,
      name: c.name,
      capInr: c.capInr,
      spentInr: round2(spentNet),
      committedInr: round2(committed),
      remainingInr: round2(c.capInr - spentNet - committed),
      usedRatio: Math.round(usedRatio * 10_000) / 10_000,
      flag: usedRatio >= 1 ? "over_100" : usedRatio >= 0.8 ? "warn_80" : "ok",
    };
  });
  const income = ledger.filter((e) => e.type === "income");
  const totalCap = rows.reduce((s, r) => s + r.capInr, 0);
  const spent = rows.reduce((s, r) => s + r.spentInr, 0);
  const committed = rows.reduce((s, r) => s + r.committedInr, 0);
  return {
    totalCapInr: round2(totalCap),
    spentInr: round2(spent),
    committedInr: round2(committed),
    incomeReceivedInr: round2(
      income.filter((e) => e.status === "received").reduce((s, e) => s + e.amountInr, 0),
    ),
    incomeDueInr: round2(income.filter((e) => e.status === "due").reduce((s, e) => s + e.amountInr, 0)),
    remainingInr: round2(totalCap - spent - committed),
    categories: rows,
  };
}

/** metrics.snapshot(): computed only from rows in the world. */
export function metricsSnapshot(w: EventWorld): MetricsSnapshot {
  const now = new Date(w.now).getTime();
  const tenMinAgo = now - 10 * 60_000;
  const confirmed = w.registrations.filter((r) => r.status === "confirmed").length;
  const firstCheckins = w.checkins.filter((c) => !c.duplicate);
  const pending = w.proposals.filter((p) => p.status === "pending");
  const pendingByDomain: MetricsSnapshot["pendingByDomain"] = {};
  for (const p of pending) pendingByDomain[p.domain] = (pendingByDomain[p.domain] ?? 0) + 1;

  const recentQuestions = w.messages.filter(
    (m) => m.role === "user" && new Date(m.at).getTime() >= tenMinAgo,
  );
  const clusters = new Map<string, { count: number; sample: string }>();
  for (const m of recentQuestions) {
    const key = m.body.toLowerCase().includes("lunch")
      ? "lunch_location"
      : m.body.toLowerCase().includes("wifi")
        ? "wifi"
        : "other";
    const c = clusters.get(key) ?? { count: 0, sample: m.body.slice(0, 200) };
    c.count += 1;
    clusters.set(key, c);
  }

  const summary = financeSummary(w.budgetCategories, w.ledgerEntries);
  const lastFunnel = w.funnel[w.funnel.length - 1];
  const spendToday = w.agentRuns.reduce((s, r) => s + r.costUsd, 0);

  return {
    at: w.now,
    registrations: {
      confirmed,
      waitlisted: w.registrations.filter((r) => r.status === "waitlisted").length,
      cancelled: w.registrations.filter((r) => r.status === "cancelled").length,
      target: w.event.settings.registrationTarget,
    },
    checkins: {
      count: firstCheckins.length,
      rate: confirmed > 0 ? Math.round((firstCheckins.length / confirmed) * 10_000) / 10_000 : 0,
      lastTenMinutes: firstCheckins.filter((c) => new Date(c.serverTime).getTime() >= tenMinAgo).length,
    },
    incidentsOpen: w.incidents.filter((i) => i.status !== "resolved").length,
    emergenciesOpen: w.incidents.filter((i) => i.status !== "resolved" && i.emergency).length,
    pendingApprovals: pending.length,
    pendingByDomain,
    helpdesk: {
      lastTenMinutes: recentQuestions.length,
      clusters: [...clusters.entries()].map(([key, v]) => ({ key, count: v.count, sample: v.sample })),
      escalationsOpen: w.escalations.filter((e) => e.status === "open").length,
    },
    budget: summary.categories,
    funnel: {
      actual: lastFunnel?.registrations ?? confirmed,
      target: w.event.settings.registrationTarget ?? 0,
    },
    modelSpendUsdToday: Math.round(spendToday * 10_000) / 10_000,
  };
}
