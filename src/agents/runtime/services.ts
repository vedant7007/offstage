// The read surface agent tools use, bound to one event by whoever builds it (from the actor, never from input).
// Production: Abhinav's DB services implement it. Tests and what-if: worldServices() over an EventWorld.
// Only masked or public shapes cross this line, so no raw email or phone can reach a prompt.

import type {
  Announcement,
  Availability,
  Event,
  KbChunkRef,
  KbDocument,
  PlaybookLesson,
  PublicSpeaker,
  RegistrationSummary,
  Room,
  Session,
  Shift,
  ShiftAssignment,
  Track,
  Volunteer,
} from "./contracts";
import type {
  BudgetCategory,
  Checkin,
  Checklist,
  FunnelSnapshot,
  Incident,
  InventoryItem,
  LedgerEntry,
  MarketingPost,
  Milestone,
  Quote,
  SponsorProspect,
  Task,
} from "@/contracts";
import type { EventWorld } from "@/contracts/fixtures";
import { maskEmail, maskPhone } from "@/lib/format";

export interface ReadServices {
  /** Current instant. The fixture world is frozen at its own `now`; production uses the real clock. */
  now(): string;
  event(): Promise<Event>;
  rooms(): Promise<Room[]>;
  tracks(): Promise<Track[]>;
  sessions(): Promise<Session[]>;
  speakers(): Promise<PublicSpeaker[]>;
  /** Which sessions each registration chose, by registration id only. */
  sessionChoices(sessionIds?: string[]): Promise<{ registrationId: string; sessionIds: string[] }[]>;
  registrations(q?: { sessionId?: string; limit?: number }): Promise<RegistrationSummary[]>;
  volunteers(): Promise<Volunteer[]>;
  shifts(): Promise<Shift[]>;
  shiftAssignments(): Promise<ShiftAssignment[]>;
  /** Volunteer availability windows. A volunteer with none is treated as always available. */
  availability(): Promise<Availability[]>;
  /** With `sinceIso`, only announcements sent at or after it. */
  announcements(sinceIso?: string): Promise<Announcement[]>;
  kbDocuments(): Promise<KbDocument[]>;
  /** Hybrid KB search. `score` is the cosine similarity of the chunk to the query, 0 to 1. */
  searchKb(query: string, k?: number): Promise<KbChunkRef[]>;
  lessons(): Promise<PlaybookLesson[]>;
  incidents(): Promise<Incident[]>;
  tasks(): Promise<Task[]>;
  milestones(): Promise<Milestone[]>;
  budget(): Promise<{ categories: BudgetCategory[]; ledger: LedgerEntry[] }>;
  quotes(): Promise<Quote[]>;
  sponsors(): Promise<SponsorProspect[]>;
  marketing(): Promise<{ posts: MarketingPost[]; funnel: FunnelSnapshot[] }>;
  checklists(): Promise<Checklist[]>;
  inventory(): Promise<InventoryItem[]>;
  /** Check-ins (no contact details), with `sinceIso` only those at or after it. */
  checkins(sinceIso?: string): Promise<Checkin[]>;
  /** Speakers with status and requirements, never contact details. */
  speakerRoster(): Promise<SpeakerRosterEntry[]>;
  /** Attendee and volunteer helpdesk questions since an instant. Untrusted text: wrap before a prompt. */
  helpdeskQuestions(sinceIso: string): Promise<HelpdeskQuestion[]>;
}

export type SpeakerRosterEntry = {
  id: string;
  name: string;
  status: string;
  sessionIds: string[];
  requirementsSubmitted: boolean;
};
export type HelpdeskQuestion = { messageId: string; text: string; at: string; channel: string };

/** Read services over an in-memory world. Pass a clone (see snapshot) when the caller may mutate it. */
export function worldServices(
  world: EventWorld,
  opts: { searchKb?: ReadServices["searchKb"] } = {},
): ReadServices {
  const checkedIn = new Map(
    world.checkins.filter((c) => !c.duplicate).map((c) => [c.registrationId, c.serverTime]),
  );
  return {
    now: () => world.now,
    event: async () => world.event,
    rooms: async () => world.rooms,
    tracks: async () => world.tracks,
    sessions: async () => world.sessions,
    speakers: async () =>
      world.speakers.map(({ id, name, title, organization, bio }) => ({
        id,
        name,
        title,
        organization,
        bio,
      })) as PublicSpeaker[],
    sessionChoices: async (ids) =>
      world.registrations
        .filter((r) => r.status === "confirmed")
        .map((r) => ({
          registrationId: r.id,
          sessionIds: ids ? r.sessionChoices.filter((s) => ids.includes(s)) : r.sessionChoices,
        }))
        .filter((c) => c.sessionIds.length),
    registrations: async (q = {}) =>
      world.registrations
        .filter((r) => !q.sessionId || r.sessionChoices.includes(q.sessionId))
        .slice(0, q.limit ?? 50)
        .map((r) => ({
          id: r.id,
          name: r.name,
          college: r.college,
          department: r.department,
          year: r.year,
          section: r.section,
          emailMasked: maskEmail(r.email),
          ...(r.phone ? { phoneMasked: maskPhone(r.phone) } : {}),
          status: r.status,
          ...(checkedIn.has(r.id) ? { checkedInAt: checkedIn.get(r.id) } : {}),
        })),
    volunteers: async () => world.volunteers,
    shifts: async () => world.shifts,
    shiftAssignments: async () => world.shiftAssignments,
    availability: async () => world.availability,
    announcements: async (since) =>
      world.announcements.filter((a) => !since || (a.sentAt !== undefined && a.sentAt >= since)),
    kbDocuments: async () => world.kbDocuments,
    // Fixture documents carry no text, so search is injected (tests use the golden KB index).
    searchKb: opts.searchKb ?? (async () => []),
    lessons: async () => world.playbookLessons.filter((l) => l.eventType === world.event.type),
    incidents: async () => world.incidents,
    tasks: async () => world.tasks,
    milestones: async () => world.milestones,
    budget: async () => ({ categories: world.budgetCategories, ledger: world.ledgerEntries }),
    quotes: async () => world.quotes,
    sponsors: async () => world.sponsorProspects,
    marketing: async () => ({ posts: world.marketingPosts, funnel: world.funnel }),
    checklists: async () => world.checklists,
    inventory: async () => world.inventory,
    checkins: async (since) => world.checkins.filter((c) => !since || c.serverTime >= since),
    speakerRoster: async () =>
      world.speakers.map(({ id, name, status, sessionIds, requirementsSubmitted }) => ({
        id,
        name,
        status,
        sessionIds,
        requirementsSubmitted,
      })),
    helpdeskQuestions: async (since) => {
      const channel = new Map(world.conversations.map((c) => [c.id, c.channel]));
      return world.messages
        .filter((m) => m.role === "user" && m.at >= since)
        .map((m) => ({
          messageId: m.id,
          text: m.body,
          at: m.at,
          channel: channel.get(m.conversationId) ?? "in_app",
        }));
    },
  };
}

/** What-if snapshot: an isolated deep copy, so simulated runs can never touch the source state. */
export function snapshot(
  world: EventWorld,
  opts: { searchKb?: ReadServices["searchKb"] } = {},
): ReadServices {
  return worldServices(structuredClone(world), opts);
}
