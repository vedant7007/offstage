import { z } from "zod";
import { Id, IsoDate, IsoDateTime, PageQuery, page } from "./common";
import { AgentConfigSummary, AgentRun, AgentStep } from "./agents";
import {
  EventBrief,
  Announcement,
  Briefing,
  Certificate,
  Checkin,
  Escalation,
  Event,
  FinanceSummary,
  FunnelSnapshot,
  HelpdeskAnswer,
  Incident,
  LedgerEntry,
  MarketingPost,
  MetricsSnapshot,
  Milestone,
  PublicSpeaker,
  Quote,
  Registration,
  RegistrationSummary,
  Room,
  Session,
  Shift,
  ShiftAssignment,
  SponsorProspect,
  Task,
  Ticket,
  Track,
  WhatIfResult,
} from "./domain";
import {
  FoodPref,
  IncidentCategory,
  Language,
  LedgerType,
  Severity,
  SponsorStage,
  TaskStatus,
} from "./enums";
import { DomainEvent } from "./events";
import { AgentName, Channel, Domain, EventType, Role } from "./identity";
import { ActionKind, ActionProposal, ProposalStatus, RiskTier } from "./proposals";

/**
 * Request and response schemas for every REST endpoint (blueprint Section 10).
 *
 * Scoping: console routes carry `:eventId` in the path and the server resolves the caller's
 * membership for that event (403 if none). Attendee (`/api/me`) and crew routes use the active
 * event stored on the session, so they take no event id. Nothing trusts ids in the body for scope.
 */

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

export const ApiErrorCode = z.enum([
  "bad_request",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "stale",
  "expired",
  "rate_limited",
  "turnstile_failed",
  "otp_invalid",
  "capacity_full",
  "internal",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCode>;

export const ApiError = z.object({
  error: z.object({
    code: ApiErrorCode,
    message: z.string().describe("Safe to show to the user"),
    issues: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .optional()
      .describe("Validation issues"),
    retryAfterSeconds: z.int().positive().optional(),
  }),
});
export type ApiError = z.infer<typeof ApiError>;

export const Ok = z.object({ ok: z.literal(true) });

// ---------------------------------------------------------------------------
// Console: overview and stream
// ---------------------------------------------------------------------------

export const OverviewResponse = z.object({
  event: Event,
  metrics: MetricsSnapshot,
  agents: z.array(AgentConfigSummary),
  globalAgentsEnabled: z.boolean(),
  recent: z.array(DomainEvent).max(50).describe("Latest domain events, newest first"),
});
export type OverviewResponse = z.infer<typeof OverviewResponse>;

/** One SSE message on GET /api/events/:eventId/stream. Sent as `event: <type>` with JSON `data`. */
export const StreamMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("domain_event"), event: DomainEvent }),
  z.object({
    type: z.literal("proposal"),
    proposal: z.object({
      id: Id,
      kind: ActionKind,
      status: ProposalStatus,
      riskTier: RiskTier,
      summary: z.string(),
      domain: Domain,
    }),
  }),
  z.object({ type: z.literal("metrics"), metrics: MetricsSnapshot }),
  z.object({ type: z.literal("agent_run"), run: AgentRun }),
  z.object({
    type: z.literal("agent_step"),
    runId: Id,
    agent: AgentName,
    kind: z.string().max(40).describe("Step kind: llm, tool, propose, guard, fallback"),
  }),
  z.object({ type: z.literal("outbox"), at: IsoDateTime.describe("Outbox rows changed status") }),
  z.object({ type: z.literal("heartbeat"), at: IsoDateTime }),
]);
export type StreamMessage = z.infer<typeof StreamMessage>;

// ---------------------------------------------------------------------------
// Console: proposals
// ---------------------------------------------------------------------------

export const ListProposalsQuery = PageQuery.extend({
  status: z.union([ProposalStatus, z.array(ProposalStatus)]).optional(),
  tier: RiskTier.optional(),
  domain: Domain.optional(),
  agent: AgentName.optional(),
  kind: ActionKind.optional(),
  parentId: Id.optional().describe("Children of a bundle"),
  mine: z.coerce.boolean().optional().describe("Only proposals the caller can approve"),
});
export type ListProposalsQuery = z.infer<typeof ListProposalsQuery>;

export const ListProposalsResponse = page(ActionProposal);
export type ListProposalsResponse = z.infer<typeof ListProposalsResponse>;

export const ProposalResponse = z.object({
  proposal: ActionProposal,
  children: z.array(ActionProposal).describe("Filled for plan.bundle, empty otherwise"),
  canApprove: z.boolean().describe("Whether the caller may approve this now"),
  canUndo: z.boolean(),
});
export type ProposalResponse = z.infer<typeof ProposalResponse>;

export const ApproveProposalRequest = z.object({
  diffHash: z.string().min(1).max(128).describe("proposal.diffHash as shown to the approver"),
});
export type ApproveProposalRequest = z.infer<typeof ApproveProposalRequest>;

export const RejectProposalRequest = z.object({ reason: z.string().trim().min(1).max(600) });
export type RejectProposalRequest = z.infer<typeof RejectProposalRequest>;

export const EditProposalRequest = z.object({
  payload: z.unknown().describe("New payload; validated against ActionPayloads[kind]. Clears approvals."),
  summary: z.string().min(1).max(120).optional(),
});
export type EditProposalRequest = z.infer<typeof EditProposalRequest>;

export const ProposalActionResponse = z.object({ proposal: ActionProposal });
export type ProposalActionResponse = z.infer<typeof ProposalActionResponse>;

// ---------------------------------------------------------------------------
// Console: agents, command, kill switch, briefing, what-if
// ---------------------------------------------------------------------------

export const ListAgentRunsQuery = PageQuery.extend({
  agent: AgentName.optional(),
  proposalId: Id.optional(),
  since: IsoDateTime.optional(),
});
export type ListAgentRunsQuery = z.infer<typeof ListAgentRunsQuery>;

export const ListAgentRunsResponse = page(AgentRun);
export type ListAgentRunsResponse = z.infer<typeof ListAgentRunsResponse>;

export const AgentRunResponse = z.object({ run: AgentRun, steps: z.array(AgentStep) });
export type AgentRunResponse = z.infer<typeof AgentRunResponse>;

export const CommandRequest = z.object({
  eventId: Id,
  text: z.string().trim().min(1).max(2000),
  conversationId: Id.optional().describe("Continue a clarifying exchange"),
});
export type CommandRequest = z.infer<typeof CommandRequest>;

export const CommandResponse = z.discriminatedUnion("status", [
  z.object({
    status: z.literal("questions"),
    conversationId: Id,
    questions: z
      .array(z.object({ id: z.string(), text: z.string().max(300), choices: z.array(z.string()).optional() }))
      .min(1),
  }),
  z.object({
    status: z.literal("planned"),
    planId: Id,
    proposalIds: z.array(Id),
    agentsWoken: z.array(AgentName),
  }),
  z.object({ status: z.literal("refused"), reason: z.string().max(600) }),
]);
export type CommandResponse = z.infer<typeof CommandResponse>;

/**
 * POST /api/agents/intake. The Commander's interview: describe the event, answer what it asks, get a plan.
 * Without `eventId` it creates a draft event owned by the caller; every turn returns the event id.
 */
export const IntakeRequest = z.object({
  eventId: Id.optional(),
  conversationId: Id.optional().describe("Continue an interview"),
  text: z.string().trim().min(1).max(4000),
});
export type IntakeRequest = z.infer<typeof IntakeRequest>;
export const IntakeResponse = z.intersection(
  CommandResponse,
  z.object({ eventId: Id, brief: EventBrief.partial() }),
);
export type IntakeResponse = z.infer<typeof IntakeResponse>;

/** GET /api/events/:eventId/persona-feed. What three people see on their phones, for the console dock. */
export const PersonaFeedItem = z.object({
  id: Id,
  at: IsoDateTime,
  channel: z.enum(["in_app", "email", "sms", "whatsapp", "telegram", "task"]),
  title: z.string().max(200).optional(),
  body: z.string().max(4000),
  status: z
    .string()
    .max(40)
    .describe("queued, delivered, delivered_mock, failed or read for messages; the task status for tasks"),
});
export const PersonaFeedResponse = z.object({
  personas: z.array(
    z.object({
      key: z.enum(["attendee", "volunteer", "speaker"]),
      name: z.string().max(160),
      role: z.string().max(80),
      phone: z.string().max(24).optional().describe("Masked: country code and last 4 digits only"),
      items: z.array(PersonaFeedItem).max(30),
    }),
  ),
});
export type PersonaFeedResponse = z.infer<typeof PersonaFeedResponse>;

export const KillSwitchRequest = z.discriminatedUnion("scope", [
  z.object({ scope: z.literal("global"), enabled: z.boolean(), reason: z.string().max(300).optional() }),
  z.object({
    scope: z.literal("agent"),
    agent: AgentName,
    enabled: z.boolean(),
    reason: z.string().max(300).optional(),
  }),
]);
export type KillSwitchRequest = z.infer<typeof KillSwitchRequest>;

export const KillSwitchResponse = z.object({
  globalAgentsEnabled: z.boolean(),
  agents: z.array(AgentConfigSummary),
});
export type KillSwitchResponse = z.infer<typeof KillSwitchResponse>;

export const BriefingQuery = z.object({ eventId: Id, date: IsoDate.optional(), domain: Domain.optional() });
export type BriefingQuery = z.infer<typeof BriefingQuery>;

export const BriefingResponse = z.object({ briefing: Briefing.nullable() });
export type BriefingResponse = z.infer<typeof BriefingResponse>;

export const GenerateBriefingRequest = z.object({ eventId: Id, domain: Domain.optional() });
export type GenerateBriefingRequest = z.infer<typeof GenerateBriefingRequest>;

export const WhatIfRequest = z.object({ eventId: Id, scenario: z.string().trim().min(3).max(500) });
export type WhatIfRequest = z.infer<typeof WhatIfRequest>;

export const WhatIfResponse = WhatIfResult;
export type WhatIfResponse = z.infer<typeof WhatIfResponse>;

// ---------------------------------------------------------------------------
// Helpdesk chat (attendee, volunteer, speaker)
// ---------------------------------------------------------------------------

export const ChatRequest = z.object({
  conversationId: Id.optional(),
  message: z.string().trim().min(1).max(1000),
  language: Language.optional().describe("Hint only; the answer follows the language of the question"),
});
export type ChatRequest = z.infer<typeof ChatRequest>;

export const ChatResult = z.object({
  conversationId: Id,
  messageId: Id,
  answer: HelpdeskAnswer,
  escalationId: Id.optional().describe("Set when the question was passed to the team"),
  blocked: z.boolean().describe("True when the guard blocked the input; answer holds a calm refusal"),
});
export type ChatResult = z.infer<typeof ChatResult>;

/** Streamed as newline-delimited JSON on POST /api/agents/chat. */
export const ChatStreamChunk = z.discriminatedUnion("type", [
  z.object({ type: z.literal("delta"), text: z.string() }),
  z.object({ type: z.literal("done"), result: ChatResult }),
  z.object({ type: z.literal("error"), code: ApiErrorCode, message: z.string() }),
]);
export type ChatStreamChunk = z.infer<typeof ChatStreamChunk>;

// ---------------------------------------------------------------------------
// Me (any signed-in user)
// ---------------------------------------------------------------------------

export const Membership = z.object({
  eventId: Id,
  eventSlug: z.string(),
  eventName: z.string(),
  eventType: EventType,
  role: Role,
  domains: z.array(Domain),
});
export type Membership = z.infer<typeof Membership>;

export const MeResponse = z.object({
  user: z.object({ id: Id, name: z.string(), email: z.email() }),
  memberships: z.array(Membership),
  activeEventId: Id.nullable(),
  demoMode: z.boolean(),
  clockOffsetMs: z
    .number()
    .optional()
    .describe(
      "Demo clock offset. Browser code shows now as Date.now() + clockOffsetMs (see src/lib/time.ts)",
    ),
  telegramLinkCode: z
    .string()
    .max(20)
    .optional()
    .describe("Send '/start <code>' to the bot to link Telegram"),
});
export type MeResponse = z.infer<typeof MeResponse>;

export const SetActiveEventRequest = z.object({ eventId: Id });

export const MyRegistrationResponse = z.object({ registration: Registration.nullable() });
export type MyRegistrationResponse = z.infer<typeof MyRegistrationResponse>;

export const MyTicketResponse = z.object({
  ticket: Ticket,
  qrPngDataUrl: z.string().startsWith("data:image/png;base64,"),
  checkedInAt: IsoDateTime.optional(),
});
export type MyTicketResponse = z.infer<typeof MyTicketResponse>;

export const MyScheduleResponse = z.object({
  sessions: z.array(
    Session.extend({
      mine: z.boolean(),
      change: z
        .object({
          kind: z.enum(["moved", "room_changed", "cancelled", "delayed"]),
          text: z.string().max(200),
          at: IsoDateTime,
        })
        .optional()
        .describe("Most recent change, for the 'changed' chip"),
    }),
  ),
  rooms: z.array(Room),
});
export type MyScheduleResponse = z.infer<typeof MyScheduleResponse>;

export const DataRequestCreate = z.object({
  type: z.enum(["export", "delete"]),
  note: z.string().max(600).optional(),
});
export type DataRequestCreate = z.infer<typeof DataRequestCreate>;

export const DataRequestResponse = z.object({
  requestId: Id,
  status: z.enum(["received", "approved", "completed", "rejected"]),
});
export type DataRequestResponse = z.infer<typeof DataRequestResponse>;

// ---------------------------------------------------------------------------
// Public (no login)
// ---------------------------------------------------------------------------

export const PublicEventResponse = z.object({
  event: Event.pick({
    id: true,
    slug: true,
    name: true,
    type: true,
    tagline: true,
    description: true,
    startsAt: true,
    endsAt: true,
    timezone: true,
    venue: true,
    status: true,
  }),
  rooms: z.array(Room.pick({ id: true, name: true, building: true, kind: true, capacity: true })),
  tracks: z.array(Track),
  sessions: z.array(Session.omit({ version: true })),
  speakers: z.array(PublicSpeaker),
  faq: z.array(z.object({ question: z.string(), answer: z.string(), source: z.string().optional() })),
  announcements: z.array(
    Announcement.pick({
      id: true,
      title: true,
      body: true,
      category: true,
      sentAt: true,
      approvedByRole: true,
      draftedBy: true,
    }),
  ),
  sponsors: z.array(z.object({ name: z.string(), tier: z.string().optional() })),
  capacity: z.object({ total: z.int(), registered: z.int(), waitlistOpen: z.boolean() }),
  generatedAt: IsoDateTime,
});
export type PublicEventResponse = z.infer<typeof PublicEventResponse>;

export const PublicStatusResponse = z.object({
  eventId: Id,
  now: IsoDateTime,
  rooms: z.array(
    z.object({
      roomId: Id,
      roomName: z.string(),
      current: Session.pick({
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        status: true,
        delayMinutes: true,
      }).optional(),
      next: Session.pick({
        id: true,
        title: true,
        startsAt: true,
        endsAt: true,
        status: true,
        delayMinutes: true,
      }).optional(),
    }),
  ),
  announcements: z.array(
    Announcement.pick({
      id: true,
      title: true,
      body: true,
      category: true,
      sentAt: true,
      approvedByRole: true,
      draftedBy: true,
    }),
  ),
});
export type PublicStatusResponse = z.infer<typeof PublicStatusResponse>;

/**
 * One SSE message on GET /api/public/events/:slug/status/stream (issue #33). Sent as
 * `event: status` with a full PublicStatusResponse whenever a session starts, ends, is delayed,
 * cancelled or moved, or a public announcement goes out; `event: heartbeat` every 25 seconds.
 */
export const PublicStatusStreamMessage = z.discriminatedUnion("type", [
  z.object({ type: z.literal("status"), status: PublicStatusResponse }),
  z.object({ type: z.literal("heartbeat"), at: IsoDateTime }),
]);
export type PublicStatusStreamMessage = z.infer<typeof PublicStatusStreamMessage>;

export const OtpRequest = z.object({
  email: z.email().max(254),
  turnstileToken: z.string().max(2048).optional().describe("Required when Turnstile keys are configured"),
});
export type OtpRequest = z.infer<typeof OtpRequest>;

export const OtpRequestResponse = z.object({ sent: z.literal(true), resendAfterSeconds: z.int().positive() });
export type OtpRequestResponse = z.infer<typeof OtpRequestResponse>;

export const OtpVerifyRequest = z.object({ email: z.email().max(254), code: z.string().regex(/^\d{6}$/) });
export type OtpVerifyRequest = z.infer<typeof OtpVerifyRequest>;

export const OtpVerifyResponse = z.object({
  verified: z.literal(true),
  verificationToken: z.string().describe("Short-lived proof the email was verified; send with register"),
});
export type OtpVerifyResponse = z.infer<typeof OtpVerifyResponse>;

export const PublicRegisterRequest = z
  .object({
    verificationToken: z.string().min(1).max(2048),
    turnstileToken: z.string().max(2048).optional(),
    name: z.string().trim().min(2).max(120),
    email: z.email().max(254),
    phone: z
      .string()
      .trim()
      .regex(/^\+?[0-9 -]{10,16}$/)
      .optional(),
    college: z.string().trim().min(2).max(160),
    department: z.string().trim().min(1).max(80),
    year: z.int().min(1).max(6),
    section: z.string().trim().min(1).max(10),
    rollNo: z.string().trim().max(30).optional(),
    sessionChoices: z.array(Id).max(20).default([]),
    foodPref: FoodPref,
    accessibility: z.string().max(400).optional(),
    adultConfirmed: z.boolean(),
    guardianConsent: z.boolean().default(false),
    consentVersion: z.string().min(1).max(20),
    teamName: z.string().max(80).optional(),
  })
  .refine((r) => r.adultConfirmed || r.guardianConsent, {
    message: "Confirm you are 18 or older, or that a guardian has consented",
    path: ["adultConfirmed"],
  });
export type PublicRegisterRequest = z.infer<typeof PublicRegisterRequest>;

export const PublicRegisterResponse = z.object({
  registrationId: Id,
  status: z.enum(["confirmed", "waitlisted"]),
  waitlistPosition: z.int().positive().optional(),
  ticket: MyTicketResponse.optional().describe("Present when confirmed"),
  duplicateSuspected: z.boolean().describe("A similar registration exists; staff will review"),
});
export type PublicRegisterResponse = z.infer<typeof PublicRegisterResponse>;

export const DemoInboxQuery = z.object({ email: z.email().max(254) });
export type DemoInboxQuery = z.infer<typeof DemoInboxQuery>;

/** DEMO_MODE only: whether the OTP screen may link to this person's latest OTP email in the demo inbox. */
export const DemoInboxResponse = z.object({
  available: z.boolean(),
  url: z.string().optional().describe("Page with the latest OTP email; present when available"),
});
export type DemoInboxResponse = z.infer<typeof DemoInboxResponse>;

export const VerifyKeyResponse = z.object({
  eventId: Id,
  algorithm: z.literal("Ed25519"),
  publicKey: z.string().describe("Base64 DER (SPKI) public key for offline ticket verification"),
  keyId: z.string(),
});
export type VerifyKeyResponse = z.infer<typeof VerifyKeyResponse>;

export const RevocationListResponse = z.object({
  eventId: Id,
  revokedTicketIds: z.array(Id),
  updatedAt: IsoDateTime,
});
export type RevocationListResponse = z.infer<typeof RevocationListResponse>;

export const CertificateVerifyResponse = z.object({
  valid: z.boolean().describe("False when unknown or revoked"),
  certificate: Certificate.pick({
    id: true,
    kind: true,
    recipientName: true,
    title: true,
    issuedAt: true,
    issuedBy: true,
    revoked: true,
    revokedAt: true,
    hours: true,
  })
    .extend({ eventName: z.string(), eventDates: z.object({ startsAt: IsoDateTime, endsAt: IsoDateTime }) })
    .nullable(),
});
export type CertificateVerifyResponse = z.infer<typeof CertificateVerifyResponse>;

export const SpeakerFormRequest = z.object({
  av: z.array(z.string().max(80)).max(20).default([]),
  travel: z.string().max(600).optional(),
  stay: z.string().max(600).optional(),
  materials: z.string().max(600).optional(),
  bioConfirmed: z.boolean(),
  bio: z.string().max(2000).optional(),
});
export type SpeakerFormRequest = z.infer<typeof SpeakerFormRequest>;

export const VolunteerSignupRequest = z.object({
  verificationToken: z.string().min(1).max(2048),
  name: z.string().trim().min(2).max(120),
  phone: z
    .string()
    .trim()
    .regex(/^\+?[0-9 -]{10,16}$/),
  skills: z.array(z.string().max(40)).min(1).max(20),
  availability: z
    .array(
      z.object({
        date: IsoDate,
        from: z.string().regex(/^\d{2}:\d{2}$/),
        to: z.string().regex(/^\d{2}:\d{2}$/),
      }),
    )
    .max(20),
  maxHours: z.number().positive().max(24),
  consentVersion: z.string().min(1).max(20),
});
export type VolunteerSignupRequest = z.infer<typeof VolunteerSignupRequest>;

// ---------------------------------------------------------------------------
// Crew (volunteers)
// ---------------------------------------------------------------------------

export const CrewShiftsResponse = z.object({
  shifts: z.array(
    z.object({
      shift: Shift,
      assignment: ShiftAssignment,
      roomName: z.string().optional(),
      briefingMarkdown: z.string().optional(),
    }),
  ),
  hoursServed: z.number().nonnegative(),
  maxHours: z.number().positive(),
});
export type CrewShiftsResponse = z.infer<typeof CrewShiftsResponse>;

export const CheckinRequest = z.object({
  ticketPayload: z.string().min(1).max(2048).describe("base64url payload part of the ticket token"),
  signature: z.string().min(1).max(256).describe("base64url Ed25519 signature part of the ticket token"),
  deviceTime: IsoDateTime,
  clientId: z.string().min(1).max(80).describe("Unique per scan on the device; repeats are idempotent"),
  sessionId: Id.optional(),
});
export type CheckinRequest = z.infer<typeof CheckinRequest>;

export const CheckinResult = z.object({
  clientId: z.string(),
  status: z.enum(["checked_in", "duplicate", "invalid", "revoked", "expired", "wrong_event"]),
  registration: z.object({ id: Id, name: z.string(), college: z.string() }).optional(),
  checkin: Checkin.optional(),
  original: z
    .object({ at: IsoDateTime, scannerName: z.string() })
    .optional()
    .describe("For duplicates: 'already checked in at 10:42 by Ravi'"),
});
export type CheckinResult = z.infer<typeof CheckinResult>;

export const CheckinSyncRequest = z.object({ scans: z.array(CheckinRequest).min(1).max(500) });
export type CheckinSyncRequest = z.infer<typeof CheckinSyncRequest>;

export const CheckinSyncResponse = z.object({ results: z.array(CheckinResult) });
export type CheckinSyncResponse = z.infer<typeof CheckinSyncResponse>;

export const CrewSearchQuery = z.object({ q: z.string().trim().min(2).max(80) });
export type CrewSearchQuery = z.infer<typeof CrewSearchQuery>;

export const CrewSearchResponse = z.object({ items: z.array(RegistrationSummary).max(20) });
export type CrewSearchResponse = z.infer<typeof CrewSearchResponse>;

export const CrewIncidentRequest = z.object({
  category: IncidentCategory,
  severity: Severity,
  roomId: Id.optional(),
  description: z.string().trim().min(1).max(2000),
  photoRef: z.string().max(300).optional().describe("Upload id from the upload endpoint"),
  voiceNoteRef: z.string().max(300).optional(),
});
export type CrewIncidentRequest = z.infer<typeof CrewIncidentRequest>;

export const CrewIncidentResponse = z.object({
  incident: Incident,
  emergencyContacts: z.array(z.object({ label: z.string(), phone: z.string() })),
});
export type CrewIncidentResponse = z.infer<typeof CrewIncidentResponse>;

export const CrewTasksResponse = z.object({ tasks: z.array(Task) });
export type CrewTasksResponse = z.infer<typeof CrewTasksResponse>;

export const CrewTaskUpdateRequest = z.object({ status: TaskStatus, note: z.string().max(600).optional() });
export type CrewTaskUpdateRequest = z.infer<typeof CrewTaskUpdateRequest>;

// ---------------------------------------------------------------------------
// Console domain views
// ---------------------------------------------------------------------------

export const RegistrationResponse = z.object({ registration: Registration });
export type RegistrationResponse = z.infer<typeof RegistrationResponse>;

export const ListRegistrationsQuery = PageQuery.extend({
  q: z.string().max(80).optional(),
  status: z.enum(["pending", "confirmed", "waitlisted", "cancelled", "rejected"]).optional(),
  sessionId: Id.optional(),
});
export const ListRegistrationsResponse = page(RegistrationSummary);
export type ListRegistrationsResponse = z.infer<typeof ListRegistrationsResponse>;

export const FinanceQuery = PageQuery.extend({ type: LedgerType.optional(), categoryId: Id.optional() });
export const FinanceResponse = z.object({
  summary: FinanceSummary,
  entries: z.array(LedgerEntry),
  quotes: z.array(Quote),
  settlement: z.object({
    unpaidVendors: z.array(LedgerEntry).describe("Expenses committed but not paid"),
    incomeDue: z.array(LedgerEntry),
    refundsDue: z.array(LedgerEntry),
  }),
  nextCursor: z.string().nullable(),
});
export type FinanceResponse = z.infer<typeof FinanceResponse>;

export const SponsorsResponse = z.object({
  prospects: z.array(SponsorProspect),
  byStage: z.partialRecord(SponsorStage, z.int().nonnegative()),
  followUpsDue: z.array(Id),
});
export type SponsorsResponse = z.infer<typeof SponsorsResponse>;

export const MarketingResponse = z.object({
  posts: z.array(MarketingPost),
  funnel: z.array(FunnelSnapshot),
  target: z.int().nonnegative(),
});
export type MarketingResponse = z.infer<typeof MarketingResponse>;

export const MilestonesResponse = z.object({
  milestones: z.array(Milestone),
  overdueIds: z.array(Id),
  atRiskIds: z.array(Id).describe("Due within 48 hours and not started"),
});
export type MilestonesResponse = z.infer<typeof MilestonesResponse>;

export const IncidentsResponse = z.object({ incidents: z.array(Incident), escalations: z.array(Escalation) });
export type IncidentsResponse = z.infer<typeof IncidentsResponse>;

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

export const DemoPersona = z.enum([
  "owner",
  "program_lead",
  "comms_lead",
  "faculty",
  "volunteer",
  "attendee",
  "sponsor",
  "viewer",
]);
export type DemoPersona = z.infer<typeof DemoPersona>;

export const SwitchPersonaRequest = z.object({
  persona: DemoPersona,
  eventSlug: z.string().max(64).optional(),
});
export type SwitchPersonaRequest = z.infer<typeof SwitchPersonaRequest>;

/** Scripted demo disruptions (blueprint Section 11). POST /api/demo/trigger, DEMO_MODE only. */
export const DemoScenario = z.enum([
  "speaker_cancel",
  "lunch_confusion",
  "volunteer_noshow",
  "queue_spike",
  "budget_breach",
  "projector_voice_note",
]);
export type DemoScenario = z.infer<typeof DemoScenario>;
export const DemoTriggerRequest = z.object({ scenario: DemoScenario });
export const DemoTriggerResponse = z.object({ message: z.string() });

// ---------------------------------------------------------------------------
// Endpoint registry, shared by src/lib/api-client.ts and the route handlers
// ---------------------------------------------------------------------------

type Endpoint = {
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  auth: "public" | "user";
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType;
  stream?: "sse" | "ndjson";
};

/** GET /api/events/:eventId/delivery. Outbox rows per channel: real sends, mock deliveries and the rest. */
export const DeliveryStatsResponse = z.object({
  channels: z.array(
    z.object({
      channel: Channel,
      real: z.number().int(),
      mock: z.number().int(),
      pending: z.number().int(),
      failed: z.number().int(),
      skipped: z.number().int(),
      /** Failed rows by provider error code, such as { "63015": 4 }. */
      failureCodes: z.record(z.string(), z.number().int()).default({}),
    }),
  ),
});
export type DeliveryStatsResponse = z.infer<typeof DeliveryStatsResponse>;

export const ENDPOINTS = {
  health: {
    method: "GET",
    path: "/api/health",
    auth: "public",
    response: z.object({ ok: z.boolean() }).loose(),
  },

  overview: {
    method: "GET",
    path: "/api/events/:eventId/overview",
    auth: "user",
    response: OverviewResponse,
  },
  stream: {
    method: "GET",
    path: "/api/events/:eventId/stream",
    auth: "user",
    response: StreamMessage,
    stream: "sse",
  },
  listProposals: {
    method: "GET",
    path: "/api/events/:eventId/proposals",
    auth: "user",
    query: ListProposalsQuery,
    response: ListProposalsResponse,
  },
  getProposal: {
    method: "GET",
    path: "/api/events/:eventId/proposals/:proposalId",
    auth: "user",
    response: ProposalResponse,
  },
  approveProposal: {
    method: "POST",
    path: "/api/events/:eventId/proposals/:proposalId/approve",
    auth: "user",
    body: ApproveProposalRequest,
    response: ProposalActionResponse,
  },
  rejectProposal: {
    method: "POST",
    path: "/api/events/:eventId/proposals/:proposalId/reject",
    auth: "user",
    body: RejectProposalRequest,
    response: ProposalActionResponse,
  },
  editProposal: {
    method: "PATCH",
    path: "/api/events/:eventId/proposals/:proposalId",
    auth: "user",
    body: EditProposalRequest,
    response: ProposalActionResponse,
  },
  undoProposal: {
    method: "POST",
    path: "/api/events/:eventId/proposals/:proposalId/undo",
    auth: "user",
    response: ProposalActionResponse,
  },
  listAgentRuns: {
    method: "GET",
    path: "/api/events/:eventId/agent-runs",
    auth: "user",
    query: ListAgentRunsQuery,
    response: ListAgentRunsResponse,
  },
  getAgentRun: {
    method: "GET",
    path: "/api/events/:eventId/agent-runs/:runId",
    auth: "user",
    response: AgentRunResponse,
  },
  personaFeed: {
    method: "GET",
    path: "/api/events/:eventId/persona-feed",
    auth: "user",
    response: PersonaFeedResponse,
  },
  deliveryStats: {
    method: "GET",
    path: "/api/events/:eventId/delivery",
    auth: "user",
    response: DeliveryStatsResponse,
  },
  killSwitch: {
    method: "POST",
    path: "/api/events/:eventId/kill-switch",
    auth: "user",
    body: KillSwitchRequest,
    response: KillSwitchResponse,
  },
  listRegistrations: {
    method: "GET",
    path: "/api/events/:eventId/registrations",
    auth: "user",
    query: ListRegistrationsQuery,
    response: ListRegistrationsResponse,
  },
  getRegistration: {
    method: "GET",
    path: "/api/events/:eventId/registrations/:registrationId",
    auth: "user",
    response: RegistrationResponse,
  },
  finance: {
    method: "GET",
    path: "/api/events/:eventId/finance",
    auth: "user",
    query: FinanceQuery,
    response: FinanceResponse,
  },
  sponsors: {
    method: "GET",
    path: "/api/events/:eventId/sponsors",
    auth: "user",
    response: SponsorsResponse,
  },
  marketing: {
    method: "GET",
    path: "/api/events/:eventId/marketing",
    auth: "user",
    response: MarketingResponse,
  },
  milestones: {
    method: "GET",
    path: "/api/events/:eventId/milestones",
    auth: "user",
    response: MilestonesResponse,
  },
  incidents: {
    method: "GET",
    path: "/api/events/:eventId/incidents",
    auth: "user",
    response: IncidentsResponse,
  },

  command: {
    method: "POST",
    path: "/api/agents/command",
    auth: "user",
    body: CommandRequest,
    response: CommandResponse,
  },
  intake: {
    method: "POST",
    path: "/api/agents/intake",
    auth: "user",
    body: IntakeRequest,
    response: IntakeResponse,
  },
  getBriefing: {
    method: "GET",
    path: "/api/agents/briefing",
    auth: "user",
    query: BriefingQuery,
    response: BriefingResponse,
  },
  generateBriefing: {
    method: "POST",
    path: "/api/agents/briefing",
    auth: "user",
    body: GenerateBriefingRequest,
    response: BriefingResponse,
  },
  whatIf: {
    method: "POST",
    path: "/api/agents/whatif",
    auth: "user",
    body: WhatIfRequest,
    response: WhatIfResponse,
  },
  chat: {
    method: "POST",
    path: "/api/agents/chat",
    auth: "user",
    body: ChatRequest,
    response: ChatStreamChunk,
    stream: "ndjson",
  },

  me: { method: "GET", path: "/api/me", auth: "user", response: MeResponse },
  setActiveEvent: {
    method: "POST",
    path: "/api/me/active-event",
    auth: "user",
    body: SetActiveEventRequest,
    response: MeResponse,
  },
  myRegistration: {
    method: "GET",
    path: "/api/me/registration",
    auth: "user",
    response: MyRegistrationResponse,
  },
  myTicket: { method: "GET", path: "/api/me/ticket", auth: "user", response: MyTicketResponse },
  mySchedule: { method: "GET", path: "/api/me/schedule", auth: "user", response: MyScheduleResponse },
  dataRequest: {
    method: "POST",
    path: "/api/me/data-request",
    auth: "user",
    body: DataRequestCreate,
    response: DataRequestResponse,
  },

  publicEvent: {
    method: "GET",
    path: "/api/public/events/:slug",
    auth: "public",
    response: PublicEventResponse,
  },
  publicStatus: {
    method: "GET",
    path: "/api/public/events/:slug/status",
    auth: "public",
    response: PublicStatusResponse,
  },
  publicStatusStream: {
    method: "GET",
    path: "/api/public/events/:slug/status/stream",
    auth: "public",
    response: PublicStatusStreamMessage,
    stream: "sse",
  },
  otpRequest: {
    method: "POST",
    path: "/api/public/events/:slug/otp/request",
    auth: "public",
    body: OtpRequest,
    response: OtpRequestResponse,
  },
  otpVerify: {
    method: "POST",
    path: "/api/public/events/:slug/otp/verify",
    auth: "public",
    body: OtpVerifyRequest,
    response: OtpVerifyResponse,
  },
  register: {
    method: "POST",
    path: "/api/public/events/:slug/register",
    auth: "public",
    body: PublicRegisterRequest,
    response: PublicRegisterResponse,
  },
  demoInbox: {
    method: "GET",
    path: "/api/public/events/:slug/demo-inbox",
    auth: "public",
    query: DemoInboxQuery,
    response: DemoInboxResponse,
  },
  verifyKey: {
    method: "GET",
    path: "/api/public/events/:slug/verify-key",
    auth: "public",
    response: VerifyKeyResponse,
  },
  revocations: {
    method: "GET",
    path: "/api/public/events/:slug/revocations",
    auth: "public",
    response: RevocationListResponse,
  },
  speakerForm: {
    method: "POST",
    path: "/api/public/events/:slug/speaker/:token",
    auth: "public",
    body: SpeakerFormRequest,
    response: Ok,
  },
  volunteerSignup: {
    method: "POST",
    path: "/api/public/events/:slug/volunteer",
    auth: "public",
    body: VolunteerSignupRequest,
    response: Ok,
  },
  verifyCertificate: {
    method: "GET",
    path: "/api/verify/:certId",
    auth: "public",
    response: CertificateVerifyResponse,
  },

  crewShifts: { method: "GET", path: "/api/crew/shifts", auth: "user", response: CrewShiftsResponse },
  crewShiftCheckin: {
    method: "POST",
    path: "/api/crew/shifts/:assignmentId/checkin",
    auth: "user",
    response: Ok,
  },
  crewCheckin: {
    method: "POST",
    path: "/api/crew/checkins",
    auth: "user",
    body: CheckinRequest,
    response: CheckinResult,
  },
  crewCheckinSync: {
    method: "POST",
    path: "/api/crew/checkins/sync",
    auth: "user",
    body: CheckinSyncRequest,
    response: CheckinSyncResponse,
  },
  crewSearch: {
    method: "GET",
    path: "/api/crew/registrations/search",
    auth: "user",
    query: CrewSearchQuery,
    response: CrewSearchResponse,
  },
  crewIncident: {
    method: "POST",
    path: "/api/crew/incidents",
    auth: "user",
    body: CrewIncidentRequest,
    response: CrewIncidentResponse,
  },
  crewTasks: { method: "GET", path: "/api/crew/tasks", auth: "user", response: CrewTasksResponse },
  crewTaskUpdate: {
    method: "PATCH",
    path: "/api/crew/tasks/:taskId",
    auth: "user",
    body: CrewTaskUpdateRequest,
    response: z.object({ task: Task }),
  },

  demoTrigger: {
    method: "POST",
    path: "/api/demo/trigger",
    auth: "user",
    body: DemoTriggerRequest,
    response: DemoTriggerResponse,
  },
  switchPersona: {
    method: "POST",
    path: "/api/demo/switch-persona",
    auth: "public",
    body: SwitchPersonaRequest,
    response: MeResponse,
  },
} as const satisfies Record<string, Endpoint>;

export type EndpointName = keyof typeof ENDPOINTS;
