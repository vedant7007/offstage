/**
 * Deterministic fake data for every contract. Same output on every run, on server and browser.
 *
 *   import { fixtures } from "@/contracts/fixtures";
 *   const world = fixtures.eventFull();          // the whole HackNova 2026 event
 *   const s = fixtures.session({ title: "x" });  // one valid Session, with overrides
 *   const res = fixtures.api.publicEvent();      // a PublicEventResponse
 *
 * The seed (pnpm db:seed) inserts exactly these worlds, so fixture ids match the database.
 * Every function returns a fresh copy: mutate freely.
 */
import type { AgentConfigSummary, AgentRun, AgentStep } from "./agents";
import type { DemoPersona } from "./api";
import type {
  Announcement,
  Briefing,
  BudgetCategory,
  Checkin,
  Checklist,
  Conversation,
  Escalation,
  Event,
  EventBrief,
  EventMembership,
  FinanceSummary,
  FoodCount,
  FunnelSnapshot,
  Incident,
  InventoryItem,
  KbChunkRef,
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
  TicketClaims,
  Track,
  User,
  Volunteer,
  WhatIfResult,
} from "./domain";
import type { DomainEvent } from "./events";
import type { Actor } from "./identity";
import type { ActionProposal } from "./proposals";
import { buildCharityDrive, CHARITY_SLUG } from "./fixtures/charity";
import { buildHackNova, HACKNOVA_NOW, HACKNOVA_SLUG } from "./fixtures/hacknova";
import { makeProposal, diffHashOf } from "./fixtures/proposals";
import * as responses from "./fixtures/responses";
import { stableId } from "./fixtures/rng";
import { financeSummary, metricsSnapshot, type EventWorld, type Persona } from "./fixtures/world";

export type { EventWorld, Persona };
export { CHARITY_SLUG, HACKNOVA_NOW, HACKNOVA_SLUG, diffHashOf, makeProposal, stableId };

let hacknovaCache: EventWorld | undefined;
let charityCache: EventWorld | undefined;

function hacknova(): EventWorld {
  hacknovaCache ??= buildHackNova();
  return hacknovaCache;
}
function charity(): EventWorld {
  charityCache ??= buildCharityDrive(hacknova());
  return charityCache;
}

const clone = <T>(v: T): T => structuredClone(v);

/** Pick an item from the HackNova world (first by default) and apply shallow overrides. */
function one<T extends object>(list: (w: EventWorld) => T[], index = 0) {
  return (overrides: Partial<T> = {}): T => {
    const items = list(hacknova());
    const base = items[Math.min(index, items.length - 1)];
    if (!base) throw new Error("fixture list is empty");
    return { ...clone(base), ...overrides };
  };
}

const w = () => hacknova();

export const fixtures = {
  /** The full HackNova 2026 world (blueprint Section 11), frozen at 10:30 IST on day 1. */
  eventFull: (): EventWorld => clone(hacknova()),
  /** The small charity blood-donation drive, the second seeded event. */
  charityDrive: (): EventWorld => clone(charity()),
  /** Both seeded worlds, in seed order. */
  worlds: (): EventWorld[] => [clone(hacknova()), clone(charity())],

  org: (o: Partial<Org> = {}): Org => ({ ...clone(w().org), ...o }),
  user: one<User>((x) => x.users),
  membership: one<EventMembership>((x) => x.memberships),
  persona: (p: DemoPersona): Persona => clone(w().personas[p] ?? w().personas.attendee!),
  event: (o: Partial<Event> = {}): Event => ({ ...clone(w().event), ...o }),
  eventBrief: (o: Partial<EventBrief> = {}): EventBrief => ({ ...clone(w().event.brief!), ...o }),
  room: one<Room>((x) => x.rooms),
  track: one<Track>((x) => x.tracks),
  session: one<Session>((x) => x.sessions),
  speaker: one<Speaker>((x) => x.speakers),
  /** Registration 0 is Sneha, the demo attendee. */
  registration: one<Registration>((x) => x.registrations),
  registrationSummary: (id?: string) => responses.registrationSummary(w(), id ?? w().registrations[0]!.id),
  team: one<Team>((x) => x.teams),
  ticket: one<Ticket>((x) => x.tickets),
  ticketClaims: (o: Partial<TicketClaims> = {}): TicketClaims => {
    const t = w().tickets[0]!;
    return {
      ticketId: t.id,
      registrationId: t.registrationId,
      eventId: t.eventId,
      exp: Math.floor(new Date(t.expiresAt).getTime() / 1000),
      ...o,
    };
  },
  checkin: one<Checkin>((x) => x.checkins),
  volunteer: one<Volunteer>((x) => x.volunteers),
  shift: one<Shift>((x) => x.shifts),
  shiftAssignment: one<ShiftAssignment>((x) => x.shiftAssignments),
  task: one<Task>((x) => x.tasks),
  incident: one<Incident>((x) => x.incidents),
  kbDocument: one<KbDocument>((x) => x.kbDocuments),
  kbChunkRef: (o: Partial<KbChunkRef> = {}): KbChunkRef => ({
    chunkId: stableId("fixture:chunk", "faq-od"),
    docId: "kb-faq",
    docTitle: "HackNova 2026 FAQ",
    section: "Do I get an OD letter?",
    snippet:
      "Deccan Institute students get On Duty attendance through their department; the OD list goes to HODs by 28 October.",
    score: 0.83,
    docVersion: 1,
    ...o,
  }),
  conversation: one<Conversation>((x) => x.conversations),
  message: one<Message>((x) => x.messages, 1),
  escalation: one<Escalation>((x) => x.escalations),
  announcement: one<Announcement>((x) => x.announcements),
  milestone: one<Milestone>((x) => x.milestones),
  budgetCategory: one<BudgetCategory>((x) => x.budgetCategories, 1),
  ledgerEntry: one<LedgerEntry>((x) => x.ledgerEntries),
  quote: one<Quote>((x) => x.quotes),
  sponsorProspect: one<SponsorProspect>((x) => x.sponsorProspects),
  marketingPost: one<MarketingPost>((x) => x.marketingPosts),
  funnelSnapshot: one<FunnelSnapshot>((x) => x.funnel, 22),
  checklist: one<Checklist>((x) => x.checklists),
  inventoryItem: one<InventoryItem>((x) => x.inventory),
  foodCount: (o: Partial<FoodCount> = {}): FoodCount => {
    const confirmed = w().registrations.filter((r) => r.status === "confirmed");
    const count = (p: string) => confirmed.filter((r) => r.foodPref === p).length;
    return {
      date: "2026-10-24",
      meal: "lunch",
      veg: count("veg"),
      nonVeg: count("non_veg"),
      vegan: count("vegan"),
      jain: count("jain"),
      other: count("none"),
      ...o,
    };
  },
  playbookLesson: one<PlaybookLesson>((x) => x.playbookLessons),
  briefing: one<Briefing>((x) => x.briefings),
  whatIfResult: one<WhatIfResult>((x) => x.whatIfRuns),
  /** Proposal 0 is the pending T2 room change for the overbooked Lab 204 workshop. */
  proposal: one<ActionProposal>((x) => x.proposals),
  proposals: (): ActionProposal[] => clone(w().proposals),
  domainEvent: one<DomainEvent>((x) => x.domainEvents),
  agentRun: one<AgentRun>((x) => x.agentRuns),
  agentStep: one<AgentStep>((x) => x.agentSteps),
  agentConfigSummary: one<AgentConfigSummary>((x) => x.agents),
  metricsSnapshot: (): MetricsSnapshot => metricsSnapshot(w()),
  financeSummary: (): FinanceSummary => financeSummary(w().budgetCategories, w().ledgerEntries),
  actor: (kind: Actor["kind"] = "user"): Actor => {
    const x = w();
    if (kind === "agent")
      return { kind: "agent", agent: "scheduler", runId: x.agentRuns[0]!.id, eventId: x.event.id };
    if (kind === "system") return { kind: "system", eventId: x.event.id, reason: "fixture" };
    const p = x.personas.owner!;
    return { kind: "user", userId: p.userId, orgId: x.org.id, eventId: x.event.id, role: "owner" };
  },

  certificate: (revoked = false) => responses.certificate(w(), revoked),
  odList: () => responses.odList(w()),
  feedback: () => responses.feedback(w()),

  /** Ready-made API responses, one per endpoint, for the mock api-client. */
  api: {
    overview: () => responses.overview(w()),
    listProposals: (status?: "pending") => responses.listProposals(w(), status),
    proposal: (id?: string) => responses.proposalDetail(w(), id ?? w().proposals[0]!.id),
    agentRun: (id?: string) => responses.agentRun(w(), id),
    me: (persona: DemoPersona = "attendee") => responses.me(w(), persona),
    myRegistration: () => responses.myRegistration(w()),
    myTicket: () => responses.myTicket(w()),
    mySchedule: () => responses.mySchedule(w()),
    publicEvent: () => responses.publicEvent(w()),
    publicStatus: () => responses.publicStatus(w()),
    verifyKey: () => responses.verifyKey(w()),
    crewShifts: () => responses.crewShifts(w()),
    crewSearch: (q = "a") => responses.crewSearch(w(), q),
    checkinResults: () => responses.checkinResults(w()),
    finance: () => responses.finance(w()),
    sponsors: () => responses.sponsors(w()),
    marketing: () => responses.marketing(w()),
    milestones: () => responses.milestones(w()),
    incidents: () => responses.incidents(w()),
    chatAnswered: () => responses.chatAnswered(w()),
    chatEscalated: () => responses.chatEscalated(w()),
    chatBlocked: () => responses.chatBlocked(),
    certificateVerify: (revoked = false) => responses.certificateVerify(w(), revoked),
  },
};
