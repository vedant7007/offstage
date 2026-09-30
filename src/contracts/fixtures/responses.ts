import { maskEmail } from "@/lib/format";
import type {
  AgentRunResponse,
  CertificateVerifyResponse,
  ChatResult,
  CheckinResult,
  CrewSearchResponse,
  CrewShiftsResponse,
  DemoPersona,
  FinanceResponse,
  IncidentsResponse,
  ListProposalsResponse,
  MarketingResponse,
  MeResponse,
  MilestonesResponse,
  MyRegistrationResponse,
  MyScheduleResponse,
  MyTicketResponse,
  OverviewResponse,
  ProposalResponse,
  PublicEventResponse,
  PublicStatusResponse,
  SponsorsResponse,
  VerifyKeyResponse,
} from "../api";
import type { Certificate, OdList, Feedback, RegistrationSummary } from "../domain";
import type { SponsorStage } from "../enums";
import { addMinutesIso, ist, stableId } from "./rng";
import { financeSummary, metricsSnapshot, type EventWorld } from "./world";

/** A 1x1 transparent PNG. Real QR images come from /api/me/ticket. */
const PLACEHOLDER_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

export function overview(w: EventWorld): OverviewResponse {
  return {
    event: w.event,
    metrics: metricsSnapshot(w),
    agents: w.agents,
    globalAgentsEnabled: true,
    recent: w.domainEvents.slice(0, 50),
  };
}

export function listProposals(w: EventWorld, status?: "pending"): ListProposalsResponse {
  return { items: w.proposals.filter((p) => !status || p.status === status), nextCursor: null };
}

export function proposalDetail(w: EventWorld, proposalId: string): ProposalResponse {
  const proposal = w.proposals.find((p) => p.id === proposalId) ?? w.proposals[0]!;
  return {
    proposal,
    children: w.proposals.filter((p) => p.parentId === proposal.id),
    canApprove: proposal.status === "pending",
    canUndo: !!proposal.undoUntil && proposal.undoUntil > w.now,
  };
}

export function agentRun(w: EventWorld, runId?: string): AgentRunResponse {
  const run = w.agentRuns.find((r) => r.id === runId) ?? w.agentRuns[0]!;
  return { run, steps: w.agentSteps.filter((s) => s.runId === run.id) };
}

export function me(w: EventWorld, persona: DemoPersona = "attendee"): MeResponse {
  const p = w.personas[persona] ?? w.personas.attendee!;
  const memberships = w.memberships
    .filter((m) => m.userId === p.userId)
    .map((m) => ({
      eventId: m.eventId,
      eventSlug: w.event.slug,
      eventName: w.event.name,
      eventType: w.event.type,
      role: m.role,
      domains: m.domains,
    }));
  return {
    user: { id: p.userId, name: p.name, email: p.email },
    memberships,
    activeEventId: w.event.id,
    demoMode: true,
    telegramLinkCode: `HN-${p.userId.slice(0, 6).toUpperCase()}`,
  };
}

function registrationOf(w: EventWorld, userId: string) {
  return w.registrations.find((r) => r.userId === userId) ?? null;
}

export function myRegistration(w: EventWorld): MyRegistrationResponse {
  return { registration: registrationOf(w, w.personas.attendee!.userId) };
}

export function myTicket(w: EventWorld): MyTicketResponse {
  const reg = registrationOf(w, w.personas.attendee!.userId)!;
  const ticket = w.tickets.find((t) => t.registrationId === reg.id)!;
  return { ticket, qrPngDataUrl: PLACEHOLDER_PNG, checkedInAt: reg.checkedInAt };
}

export function mySchedule(w: EventWorld): MyScheduleResponse {
  const reg = registrationOf(w, w.personas.attendee!.userId);
  return {
    sessions: w.sessions.map((s) => ({ ...s, mine: !!reg?.sessionChoices.includes(s.id) })),
    rooms: w.rooms,
  };
}

export function publicEvent(w: EventWorld): PublicEventResponse {
  const e = w.event;
  const confirmed = w.registrations.filter((r) => r.status === "confirmed").length;
  return {
    event: {
      id: e.id,
      slug: e.slug,
      name: e.name,
      type: e.type,
      tagline: e.tagline,
      description: e.description,
      startsAt: e.startsAt,
      endsAt: e.endsAt,
      timezone: e.timezone,
      venue: e.venue,
      status: e.status,
    },
    rooms: w.rooms.map(({ id, name, building, kind, capacity }) => ({ id, name, building, kind, capacity })),
    tracks: w.tracks,
    sessions: w.sessions.map(({ version: _v, ...s }) => s),
    speakers: w.speakers.map(({ id, name, title, organization, bio, sessionIds }) => ({
      id,
      name,
      title,
      organization,
      bio,
      sessionIds,
    })),
    faq: [
      {
        question: "When does check-in open?",
        answer: "Check-in opens at 08:30 IST on both days at the registration desk at the main gate.",
        source: "kb:kb-faq#when-does-check-in-open",
      },
      {
        question: "Where is lunch?",
        answer: "Lunch is served from 12:30 to 14:00 at the Food Court in Block D.",
        source: "kb:kb-menu#day-1-saturday-24-october",
      },
      {
        question: "Do I get an OD letter?",
        answer:
          "Deccan Institute students get On Duty attendance through their department; the OD list goes to HODs by 28 October.",
        source: "kb:kb-faq#do-i-get-an-od-letter",
      },
    ],
    announcements: w.announcements
      .filter((a) => a.public && a.status === "sent")
      .map(({ id, title, body, category, sentAt }) => ({ id, title, body, category, sentAt })),
    sponsors: w.sponsorProspects
      .filter((s) => s.stage === "confirmed")
      .map((s) => ({ name: s.name, tier: s.tier })),
    capacity: { total: e.capacity, registered: confirmed, waitlistOpen: confirmed >= e.capacity },
    generatedAt: w.now,
  };
}

export function publicStatus(w: EventWorld): PublicStatusResponse {
  const now = w.now;
  const pick = (s: (typeof w.sessions)[number]) => ({
    id: s.id,
    title: s.title,
    startsAt: s.startsAt,
    endsAt: s.endsAt,
    status: s.status,
    delayMinutes: s.delayMinutes,
  });
  return {
    eventId: w.event.id,
    now,
    rooms: w.rooms.map((r) => {
      const inRoom = w.sessions
        .filter((s) => s.roomId === r.id && s.status !== "cancelled")
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const current = inRoom.find((s) => s.startsAt <= now && now < s.endsAt);
      const next = inRoom.find((s) => s.startsAt > now);
      return { roomId: r.id, roomName: r.name, current: current && pick(current), next: next && pick(next) };
    }),
    announcements: w.announcements
      .filter((a) => a.public && a.status === "sent")
      .map(({ id, title, body, category, sentAt }) => ({ id, title, body, category, sentAt })),
  };
}

export function verifyKey(w: EventWorld): VerifyKeyResponse {
  // Fixture key only; the real one comes from TICKET_SIGNING_PUBLIC_KEY.
  return {
    eventId: w.event.id,
    algorithm: "Ed25519",
    publicKey: "MCowBQYDK2VwAyEAZml4dHVyZS1rZXktbm90LXJlYWwtZG8tbm90LXVzZQ==",
    keyId: "fixture",
  };
}

export function crewShifts(w: EventWorld): CrewShiftsResponse {
  const vol = w.volunteers.find((v) => v.userId === w.personas.volunteer!.userId)!;
  return {
    shifts: w.shiftAssignments
      .filter((a) => a.volunteerId === vol.id)
      .map((assignment) => {
        const shift = w.shifts.find((s) => s.id === assignment.shiftId)!;
        return {
          shift,
          assignment,
          roomName: w.rooms.find((r) => r.id === shift.roomId)?.name,
          briefingMarkdown: `## ${shift.role}\n\n- Arrive 10 minutes early.\n- Wear your volunteer T-shirt.\n- Ask the helpdesk if anything is unclear.`,
        };
      }),
    hoursServed: vol.hoursServed,
    maxHours: vol.maxHours,
  };
}

export function registrationSummary(w: EventWorld, registrationId: string): RegistrationSummary {
  const r = w.registrations.find((x) => x.id === registrationId)!;
  return {
    id: r.id,
    name: r.name,
    college: r.college,
    department: r.department,
    year: r.year,
    section: r.section,
    emailMasked: maskEmail(r.email),
    status: r.status,
    checkedInAt: r.checkedInAt,
  };
}

export function crewSearch(w: EventWorld, q: string): CrewSearchResponse {
  const needle = q.toLowerCase();
  return {
    items: w.registrations
      .filter((r) => r.name.toLowerCase().includes(needle))
      .slice(0, 20)
      .map((r) => registrationSummary(w, r.id)),
  };
}

/** Check-in results for the three cases the scanner shows: fresh, duplicate, invalid. */
export function checkinResults(w: EventWorld): {
  checkedIn: CheckinResult;
  duplicate: CheckinResult;
  invalid: CheckinResult;
} {
  const fresh = w.registrations.find((r) => r.status === "confirmed" && !r.checkedInAt)!;
  const dupCheckin = w.checkins.find((c) => c.duplicate)!;
  const original = w.checkins.find((c) => c.id === dupCheckin.originalCheckinId)!;
  const dupReg = w.registrations.find((r) => r.id === dupCheckin.registrationId)!;
  const ticket = w.tickets.find((t) => t.registrationId === fresh.id)!;
  return {
    checkedIn: {
      clientId: "scan-fresh",
      status: "checked_in",
      registration: { id: fresh.id, name: fresh.name, college: fresh.college },
      checkin: {
        id: stableId("fixture:checkin", fresh.id),
        eventId: w.event.id,
        ticketId: ticket.id,
        registrationId: fresh.id,
        scannerUserId: w.personas.volunteer!.userId,
        scannerName: w.personas.volunteer!.name,
        clientId: "scan-fresh",
        deviceTime: w.now,
        serverTime: w.now,
        duplicate: false,
      },
    },
    duplicate: {
      clientId: dupCheckin.clientId,
      status: "duplicate",
      registration: { id: dupReg.id, name: dupReg.name, college: dupReg.college },
      checkin: dupCheckin,
      original: { at: original.serverTime, scannerName: original.scannerName ?? "a volunteer" },
    },
    invalid: { clientId: "scan-bad", status: "invalid" },
  };
}

export function finance(w: EventWorld): FinanceResponse {
  const entries = w.ledgerEntries;
  return {
    summary: financeSummary(w.budgetCategories, entries),
    entries,
    quotes: w.quotes,
    settlement: {
      unpaidVendors: entries.filter((e) => e.type === "expense" && e.status === "committed"),
      incomeDue: entries.filter((e) => e.type === "income" && e.status === "due"),
      refundsDue: entries.filter((e) => e.type === "refund" && e.status === "due"),
    },
    nextCursor: null,
  };
}

export function sponsors(w: EventWorld): SponsorsResponse {
  const byStage: Partial<Record<SponsorStage, number>> = {};
  for (const s of w.sponsorProspects) byStage[s.stage] = (byStage[s.stage] ?? 0) + 1;
  return {
    prospects: w.sponsorProspects,
    byStage,
    followUpsDue: w.sponsorProspects
      .filter((s) => s.nextFollowUpAt && s.nextFollowUpAt <= w.now)
      .map((s) => s.id),
  };
}

export function marketing(w: EventWorld): MarketingResponse {
  return { posts: w.marketingPosts, funnel: w.funnel, target: w.event.settings.registrationTarget ?? 0 };
}

export function milestones(w: EventWorld): MilestonesResponse {
  const today = w.now.slice(0, 10);
  const in48h = addMinutesIso(w.now, 48 * 60).slice(0, 10);
  return {
    milestones: w.milestones,
    overdueIds: w.milestones
      .filter((m) => m.dueOn < today && m.status !== "done" && m.status !== "skipped")
      .map((m) => m.id),
    atRiskIds: w.milestones
      .filter((m) => m.dueOn >= today && m.dueOn <= in48h && m.status === "not_started")
      .map((m) => m.id),
  };
}

export function incidents(w: EventWorld): IncidentsResponse {
  return { incidents: w.incidents, escalations: w.escalations };
}

export function chatAnswered(w: EventWorld): ChatResult {
  const q = w.messages.find((m) => m.role === "assistant" && m.citations.length > 0)!;
  return {
    conversationId: q.conversationId,
    messageId: q.id,
    answer: {
      answer: q.body,
      citations: q.citations,
      confidence: 0.92,
      needsEscalation: false,
      language: "en",
    },
    blocked: false,
  };
}

export function chatEscalated(w: EventWorld): ChatResult {
  const esc = w.escalations[0]!;
  const m = w.messages.find((x) => x.escalationId === esc.id)!;
  return {
    conversationId: esc.conversationId,
    messageId: m.id,
    answer: {
      answer: m.body,
      citations: [],
      confidence: 0.3,
      needsEscalation: true,
      escalationSummary: esc.summary,
      language: "en",
    },
    escalationId: esc.id,
    blocked: false,
  };
}

export function chatBlocked(): ChatResult {
  return {
    conversationId: stableId("fixture:conversation", "blocked"),
    messageId: stableId("fixture:message", "blocked"),
    answer: {
      answer: "I can only help with questions about the event. Could you ask that another way?",
      citations: [],
      confidence: 1,
      needsEscalation: false,
      language: "en",
    },
    blocked: true,
  };
}

// ---------------------------------------------------------------- post-event
export function certificate(w: EventWorld, revoked = false): Certificate {
  const reg = registrationOf(w, w.personas.attendee!.userId)!;
  const certId = stableId("fixture:certificate", `${reg.id}:${revoked}`);
  return {
    id: certId,
    eventId: w.event.id,
    kind: "attendee",
    recipientName: reg.name,
    title: "Certificate of Participation",
    registrationId: reg.id,
    issuedAt: ist("2026-10-28", "10:00"),
    issuedBy: w.org.name,
    revoked,
    revokedAt: revoked ? ist("2026-10-29", "11:00") : undefined,
    verifyUrl: `http://localhost:3000/verify/${certId}`,
  };
}

export function certificateVerify(w: EventWorld, revoked = false): CertificateVerifyResponse {
  const c = certificate(w, revoked);
  return {
    valid: !revoked,
    certificate: {
      id: c.id,
      kind: c.kind,
      recipientName: c.recipientName,
      title: c.title,
      issuedAt: c.issuedAt,
      issuedBy: c.issuedBy,
      revoked: c.revoked,
      revokedAt: c.revokedAt,
      hours: c.hours,
      eventName: w.event.name,
      eventDates: { startsAt: w.event.startsAt, endsAt: w.event.endsAt },
    },
  };
}

export function odList(w: EventWorld): OdList {
  const cse3b = w.registrations.filter(
    (r) => r.checkedInAt && r.department === "CSE" && r.year === 3 && r.section === "B" && r.rollNo,
  );
  return {
    id: stableId("fixture:od", "cse-3-b"),
    eventId: w.event.id,
    department: "CSE",
    year: 3,
    section: "B",
    date: w.event.startsAt.slice(0, 10) === "2026-10-24" ? "2026-10-24" : w.event.startsAt.slice(0, 10),
    timeWindow: { from: ist("2026-10-24", "09:00"), to: ist("2026-10-24", "18:00") },
    entries: cse3b.map((r) => ({ name: r.name, rollNo: r.rollNo!, year: r.year, section: r.section })),
    status: "draft",
    generatedAt: ist("2026-10-26", "10:00"),
  };
}

export function feedback(w: EventWorld): Feedback {
  const reg = registrationOf(w, w.personas.attendee!.userId)!;
  return {
    id: stableId("fixture:feedback", reg.id),
    eventId: w.event.id,
    registrationId: reg.id,
    rating: 4,
    answers: { best: "The fine-tuning workshop", improve: "Lab 204 was too crowded", again: "Yes" },
    comment: "Loved the hackathon energy.",
    createdAt: ist("2026-10-26", "20:00"),
  };
}
