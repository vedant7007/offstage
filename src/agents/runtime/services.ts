// The read surface agent tools use, bound to one event by whoever builds it (from the actor, never from input).
// Production: Abhinav's DB services implement it. Tests and what-if: worldServices() over an EventWorld.
// Only masked or public shapes cross this line, so no raw email or phone can reach a prompt.

import type {
  Announcement,
  Event,
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
  /** With `sinceIso`, only announcements sent at or after it. */
  announcements(sinceIso?: string): Promise<Announcement[]>;
  kbDocuments(): Promise<KbDocument[]>;
  lessons(): Promise<PlaybookLesson[]>;
}

/** Read services over an in-memory world. Pass a clone (see snapshot) when the caller may mutate it. */
export function worldServices(world: EventWorld): ReadServices {
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
    announcements: async (since) =>
      world.announcements.filter((a) => !since || (a.sentAt !== undefined && a.sentAt >= since)),
    kbDocuments: async () => world.kbDocuments,
    lessons: async () => world.playbookLessons.filter((l) => l.eventType === world.event.type),
  };
}

/** What-if snapshot: an isolated deep copy, so simulated runs can never touch the source state. */
export function snapshot(world: EventWorld): ReadServices {
  return worldServices(structuredClone(world));
}
