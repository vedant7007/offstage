import { z } from "zod";
import { Id, IsoDate, IsoDateTime, MoneyInr, Percent, Title, Version } from "./common";
import {
  AnnouncementCategory,
  CertificateKind,
  ChecklistItemStatus,
  DeliverableStatus,
  FoodPref,
  IncidentCategory,
  IncidentSource,
  IncidentStatus,
  IncomeSource,
  KbDocumentKind,
  LedgerStatus,
  LedgerType,
  MarketingPlatform,
  MarketingPostStatus,
  Meal,
  MilestoneStatus,
  Priority,
  RegistrationStatus,
  RoomKind,
  SessionKind,
  SessionStatus,
  Severity,
  ShiftAssignmentStatus,
  SpeakerStatus,
  SponsorStage,
  SponsorTier,
  TaskStatus,
} from "./enums";
import { AgentName, Channel, Domain, EventType, Role } from "./identity";
import { ActionProposal, AgentTeamEntry, Citation, ProposeResult, Segment } from "./proposals";

// ---------------------------------------------------------------------------
// Event and venue
// ---------------------------------------------------------------------------

export const EventSettings = z.object({
  t3MoneyThresholdInr: MoneyInr.default(10_000).describe("Money records above this are T3"),
  broadcastT3Recipients: z
    .int()
    .positive()
    .default(200)
    .describe("Announcements reaching more people than this are T3"),
  facultyApproverRequired: z
    .boolean()
    .default(false)
    .describe("T3 needs an owner or faculty approver among its approvals"),
  autoApproveT1: z.boolean().default(true),
  quietHours: z
    .object({ startHour: z.int().min(0).max(23), endHour: z.int().min(0).max(23) })
    .default({ startHour: 22, endHour: 7 })
    .describe("IST hours with no non-emergency messages"),
  perPersonHourlyCap: z.int().min(1).max(50).default(4),
  registrationTarget: z.int().nonnegative().optional(),
  odLettersEnabled: z.boolean().default(true),
  certificatesEnabled: z.boolean().default(true),
  proposalTtlMinutes: z.int().min(5).max(1440).default(30),
});
export type EventSettings = z.infer<typeof EventSettings>;

/** What the Commander learns in the intake interview. Every field optional until the interview ends. */
export const EventBrief = z.object({
  name: z.string().max(160).optional(),
  type: EventType.optional(),
  dates: z.array(IsoDate).max(14).optional(),
  venue: z.string().max(300).optional(),
  rooms: z
    .array(z.object({ name: z.string().max(80), capacity: z.int().positive().optional() }))
    .max(50)
    .optional(),
  expectedAttendance: z.int().nonnegative().optional(),
  paid: z.boolean().optional(),
  ticketPriceInr: MoneyInr.optional(),
  budgetInr: MoneyInr.optional(),
  tracks: z.array(z.string().max(80)).max(20).optional(),
  sponsorsExpected: z.boolean().optional(),
  food: z.boolean().optional(),
  speakersCount: z.int().nonnegative().optional(),
  volunteersAvailable: z.int().nonnegative().optional(),
  attendeeChannels: z.array(Channel).optional(),
  approvalsNeeded: z.string().max(400).optional().describe("E.g. 'faculty must approve official notices'"),
  constraints: z.string().max(1000).optional(),
});
export type EventBrief = z.infer<typeof EventBrief>;

export const Venue = z.object({
  name: z.string().max(200),
  address: z.string().max(400),
  city: z.string().max(80),
  mapUrl: z.url().optional(),
});
export type Venue = z.infer<typeof Venue>;

export const Event = z.object({
  id: Id,
  orgId: Id,
  slug: z
    .string()
    .regex(/^[a-z0-9][a-z0-9-]{1,62}$/)
    .describe("URL slug for /e/[slug]"),
  name: Title,
  type: EventType,
  tagline: z.string().max(200).optional(),
  description: z.string().max(5000),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  timezone: z.literal("Asia/Kolkata"),
  venue: Venue,
  capacity: z.int().nonnegative(),
  status: z.enum(["draft", "planning", "live", "closed"]),
  settings: EventSettings,
  brief: EventBrief.optional(),
  version: Version,
  createdAt: IsoDateTime,
});
export type Event = z.infer<typeof Event>;

export const Room = z.object({
  id: Id,
  eventId: Id,
  name: z.string().max(80),
  building: z.string().max(80).optional(),
  kind: RoomKind,
  capacity: z.int().nonnegative(),
  features: z.array(z.string().max(40)).describe("E.g. projector, ac, wheelchair_access"),
  version: Version,
});
export type Room = z.infer<typeof Room>;

export const Track = z.object({
  id: Id,
  eventId: Id,
  name: z.string().max(80),
  description: z.string().max(400).optional(),
});
export type Track = z.infer<typeof Track>;

export const Session = z.object({
  id: Id,
  eventId: Id,
  trackId: Id.optional(),
  roomId: Id,
  title: Title,
  description: z.string().max(4000).optional(),
  kind: SessionKind,
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  capacity: z.int().nonnegative().describe("Seats available; defaults to the room capacity"),
  registeredCount: z.int().nonnegative(),
  speakerIds: z.array(Id),
  status: SessionStatus,
  delayMinutes: z.int().min(0).default(0),
  version: Version,
});
export type Session = z.infer<typeof Session>;

export const Speaker = z.object({
  id: Id,
  eventId: Id,
  name: z.string().max(120),
  title: z.string().max(120).optional(),
  organization: z.string().max(120).optional(),
  bio: z.string().max(2000).optional(),
  email: z.email().optional().describe("Staff only. Never in public responses."),
  phone: z.string().max(20).optional().describe("Staff only. E.164."),
  status: SpeakerStatus,
  sessionIds: z.array(Id),
  requirementsSubmitted: z.boolean(),
  version: Version,
});
export type Speaker = z.infer<typeof Speaker>;

/** Speaker fields safe for the public event page. */
export const PublicSpeaker = Speaker.pick({
  id: true,
  name: true,
  title: true,
  organization: true,
  bio: true,
  sessionIds: true,
});
export type PublicSpeaker = z.infer<typeof PublicSpeaker>;

// ---------------------------------------------------------------------------
// Registrations, tickets, check-in
// ---------------------------------------------------------------------------

export const Registration = z.object({
  id: Id,
  eventId: Id,
  userId: Id.optional(),
  name: z.string().min(1).max(120),
  email: z
    .email()
    .describe("Decrypted. Only in responses to the owner of the record or staff with registration.read"),
  phone: z.string().max(20).optional().describe("E.164, decrypted, same visibility rule as email"),
  college: z.string().max(160),
  department: z.string().max(80),
  year: z.int().min(1).max(6),
  section: z.string().max(10),
  rollNo: z.string().max(30).optional(),
  status: RegistrationStatus,
  waitlistPosition: z.int().positive().optional(),
  sessionChoices: z.array(Id),
  teamId: Id.optional(),
  foodPref: FoodPref,
  accessibility: z.string().max(400).optional(),
  adultConfirmed: z.boolean(),
  guardianConsent: z.boolean(),
  consentVersion: z.string().max(20),
  duplicateOfId: Id.optional().describe("Set when flagged as a likely duplicate"),
  checkedInAt: IsoDateTime.optional(),
  createdAt: IsoDateTime,
  version: Version,
});
export type Registration = z.infer<typeof Registration>;

/** Masked row for staff lists and scanner search. */
export const RegistrationSummary = z.object({
  id: Id,
  name: z.string(),
  college: z.string(),
  department: z.string(),
  year: z.int(),
  section: z.string(),
  emailMasked: z.string(),
  phoneMasked: z.string().optional(),
  status: RegistrationStatus,
  checkedInAt: IsoDateTime.optional(),
});
export type RegistrationSummary = z.infer<typeof RegistrationSummary>;

export const Team = z.object({
  id: Id,
  eventId: Id,
  name: z.string().max(80),
  memberIds: z.array(Id).max(10),
});
export type Team = z.infer<typeof Team>;

export const Ticket = z.object({
  id: Id,
  eventId: Id,
  registrationId: Id,
  token: z
    .string()
    .describe("Compact signed token 'payload.signature' in base64url; this is what the QR encodes"),
  issuedAt: IsoDateTime,
  expiresAt: IsoDateTime,
  revoked: z.boolean(),
});
export type Ticket = z.infer<typeof Ticket>;

/** The signed part of a ticket. Verified with the event's Ed25519 public key. */
export const TicketClaims = z.object({
  ticketId: Id,
  registrationId: Id,
  eventId: Id,
  exp: z.int().describe("Expiry, unix seconds"),
});
export type TicketClaims = z.infer<typeof TicketClaims>;

export const Checkin = z.object({
  id: Id,
  eventId: Id,
  ticketId: Id,
  registrationId: Id,
  sessionId: Id.optional(),
  scannerUserId: Id,
  scannerName: z.string().max(120).optional(),
  clientId: z.string().max(80).describe("Scanner-generated id, makes offline sync idempotent"),
  deviceTime: IsoDateTime,
  serverTime: IsoDateTime,
  duplicate: z.boolean(),
  originalCheckinId: Id.optional(),
});
export type Checkin = z.infer<typeof Checkin>;

// ---------------------------------------------------------------------------
// Crew
// ---------------------------------------------------------------------------

export const Volunteer = z.object({
  id: Id,
  eventId: Id,
  userId: Id.optional(),
  name: z.string().max(120),
  phoneMasked: z.string().optional(),
  skills: z.array(z.string().max(40)),
  maxHours: z.number().positive(),
  hoursServed: z.number().nonnegative(),
  telegramLinked: z.boolean(),
  active: z.boolean(),
  version: Version,
});
export type Volunteer = z.infer<typeof Volunteer>;

/** When a volunteer said they can work. A volunteer with no windows is treated as always available. */
export const Availability = z.object({
  id: Id,
  eventId: Id,
  volunteerId: Id,
  start: IsoDateTime,
  end: IsoDateTime,
});
export type Availability = z.infer<typeof Availability>;

export const Shift = z.object({
  id: Id,
  eventId: Id,
  role: z.string().max(80),
  roomId: Id.optional(),
  sessionId: Id.optional(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  requiredCount: z.int().min(1),
  skills: z.array(z.string().max(40)),
  version: Version,
});
export type Shift = z.infer<typeof Shift>;

export const ShiftAssignment = z.object({
  id: Id,
  shiftId: Id,
  volunteerId: Id,
  status: ShiftAssignmentStatus,
  checkedInAt: IsoDateTime.optional(),
  version: Version,
});
export type ShiftAssignment = z.infer<typeof ShiftAssignment>;

export const Task = z.object({
  id: Id,
  eventId: Id,
  title: Title,
  description: z.string().max(2000).optional(),
  assigneeVolunteerId: Id.optional(),
  roomId: Id.optional(),
  incidentId: Id.optional(),
  status: TaskStatus,
  priority: Priority,
  dueAt: IsoDateTime.optional(),
  createdAt: IsoDateTime,
  version: Version,
});
export type Task = z.infer<typeof Task>;

export const Incident = z.object({
  id: Id,
  eventId: Id,
  title: Title,
  category: IncidentCategory,
  severity: Severity,
  status: IncidentStatus,
  source: IncidentSource,
  description: z.string().max(4000),
  roomId: Id.optional(),
  emergency: z
    .boolean()
    .describe("True for safety, medical, fire and harassment. Agents never act on these."),
  reportedByUserId: Id.optional(),
  createdAt: IsoDateTime,
  resolvedAt: IsoDateTime.optional(),
  version: Version,
});
export type Incident = z.infer<typeof Incident>;

// ---------------------------------------------------------------------------
// Knowledge, helpdesk, announcements
// ---------------------------------------------------------------------------

export const KbDocument = z.object({
  id: Id,
  eventId: Id,
  title: Title,
  kind: KbDocumentKind,
  mimeType: z.string().max(100),
  version: z.int().min(1),
  status: z.enum(["processing", "ready", "failed"]),
  public: z.boolean().describe("Public documents feed the public FAQ"),
  chunkCount: z.int().nonnegative(),
  updatedAt: IsoDateTime,
});
export type KbDocument = z.infer<typeof KbDocument>;

/** A retrieved chunk, as returned by src/ai/rag retrieve(). */
export const KbChunkRef = z.object({
  chunkId: Id,
  docId: Id,
  docTitle: z.string(),
  section: z.string().describe("Heading path the chunk sits under; '' when none"),
  snippet: z.string().max(2000),
  score: z.number(),
  docVersion: z.int().min(1).optional(),
});
export type KbChunkRef = z.infer<typeof KbChunkRef>;

/** Structured helpdesk answer. Empty citations or low confidence means escalate. */
export const HelpdeskAnswer = z.object({
  answer: z.string().max(2000),
  citations: z.array(Citation).max(10),
  confidence: z.number().min(0).max(1),
  needsEscalation: z.boolean(),
  escalationSummary: z.string().max(600).optional(),
  language: z.enum(["en", "hi", "hinglish"]).optional(),
});
export type HelpdeskAnswer = z.infer<typeof HelpdeskAnswer>;

export const Conversation = z.object({
  id: Id,
  eventId: Id,
  channel: Channel,
  userId: Id.optional(),
  askerRole: z.enum(["attendee", "volunteer", "speaker", "public"]),
  status: z.enum(["open", "escalated", "closed"]),
  createdAt: IsoDateTime,
});
export type Conversation = z.infer<typeof Conversation>;

export const Message = z.object({
  id: Id,
  conversationId: Id,
  role: z.enum(["user", "assistant", "staff"]),
  body: z.string().max(4000),
  citations: z.array(Citation),
  guard: z.enum(["allow", "flag", "block"]).optional(),
  escalationId: Id.optional(),
  at: IsoDateTime,
});
export type Message = z.infer<typeof Message>;

export const Escalation = z.object({
  id: Id,
  eventId: Id,
  conversationId: Id,
  summary: z.string().max(600),
  suggestedReply: z.string().max(2000).optional(),
  priority: Priority,
  status: z.enum(["open", "answered", "closed"]),
  createdAt: IsoDateTime,
});
export type Escalation = z.infer<typeof Escalation>;

export const Announcement = z.object({
  id: Id,
  eventId: Id,
  title: Title,
  body: z.string().max(4000).describe("Default text (the in_app body)"),
  bodyByChannel: z.partialRecord(Channel, z.string()),
  segment: Segment,
  channels: z.array(Channel),
  category: AnnouncementCategory,
  public: z.boolean(),
  status: z.enum(["scheduled", "sending", "sent", "failed", "cancelled"]),
  scheduledFor: IsoDateTime.optional(),
  sentAt: IsoDateTime.optional(),
  recipientCount: z.int().nonnegative(),
  approvedByRole: Role.optional().describe("Shown as 'Drafted by Sutradhar, approved by <role>'"),
  draftedBy: AgentName.optional(),
  proposalId: Id.optional(),
});
export type Announcement = z.infer<typeof Announcement>;

// ---------------------------------------------------------------------------
// Planning, finance, sponsors, marketing, logistics
// ---------------------------------------------------------------------------

export const Milestone = z.object({
  id: Id,
  eventId: Id,
  title: Title,
  domain: Domain,
  dueOn: IsoDate,
  status: MilestoneStatus,
  ownerRole: Role,
  dependsOn: z.array(Id),
  critical: z.boolean(),
  completedAt: IsoDateTime.optional(),
  version: Version,
});
export type Milestone = z.infer<typeof Milestone>;

export const BudgetCategory = z.object({
  id: Id,
  eventId: Id,
  key: z.string().max(40),
  name: z.string().max(80),
  capInr: MoneyInr,
  version: Version,
});
export type BudgetCategory = z.infer<typeof BudgetCategory>;

/** One row of finance.summary(). */
export const BudgetCategoryStatus = BudgetCategory.pick({
  id: true,
  key: true,
  name: true,
  capInr: true,
}).extend({
  spentInr: MoneyInr,
  committedInr: MoneyInr,
  remainingInr: z.number().describe("capInr - spent - committed; negative when over budget"),
  usedRatio: Percent.describe("(spent + committed) / cap"),
  flag: z.enum(["ok", "warn_80", "over_100"]),
});
export type BudgetCategoryStatus = z.infer<typeof BudgetCategoryStatus>;

export const FinanceSummary = z.object({
  totalCapInr: MoneyInr,
  spentInr: MoneyInr,
  committedInr: MoneyInr,
  incomeReceivedInr: MoneyInr,
  incomeDueInr: MoneyInr,
  remainingInr: z.number(),
  categories: z.array(BudgetCategoryStatus),
});
export type FinanceSummary = z.infer<typeof FinanceSummary>;

export const LedgerEntry = z.object({
  id: Id,
  eventId: Id,
  type: LedgerType,
  categoryId: Id.optional(),
  amountInr: MoneyInr,
  status: LedgerStatus,
  vendor: z.string().max(160).optional(),
  source: IncomeSource.optional(),
  sponsorId: Id.optional(),
  note: z.string().max(600),
  evidenceRef: z.string().max(300).optional(),
  occurredOn: IsoDate,
  proposalId: Id.optional(),
  createdAt: IsoDateTime,
});
export type LedgerEntry = z.infer<typeof LedgerEntry>;

export const Quote = z.object({
  id: Id,
  eventId: Id,
  title: Title,
  categoryId: Id.optional(),
  rows: z.array(
    z.object({
      vendor: z.string(),
      amountInr: MoneyInr,
      items: z.string().optional(),
      notes: z.string().optional(),
    }),
  ),
  recommendedVendor: z.string().optional(),
  createdAt: IsoDateTime,
});
export type Quote = z.infer<typeof Quote>;

export const SponsorDeliverable = z.object({
  id: Id,
  title: Title,
  status: DeliverableStatus,
  dueOn: IsoDate.optional(),
});
export type SponsorDeliverable = z.infer<typeof SponsorDeliverable>;

export const SponsorProspect = z.object({
  id: Id,
  eventId: Id,
  name: z.string().max(160),
  stage: SponsorStage,
  tier: SponsorTier.optional(),
  fitReason: z.string().max(400),
  contactName: z.string().max(120).optional(),
  askInr: MoneyInr.optional(),
  committedInr: MoneyInr.optional(),
  lastTouchAt: IsoDateTime.optional(),
  nextFollowUpAt: IsoDateTime.optional(),
  deliverables: z.array(SponsorDeliverable),
  version: Version,
});
export type SponsorProspect = z.infer<typeof SponsorProspect>;

export const MarketingPost = z.object({
  id: Id,
  eventId: Id,
  platform: MarketingPlatform,
  body: z.string().max(4000),
  hashtags: z.array(z.string()),
  status: MarketingPostStatus,
  scheduledFor: IsoDateTime.optional(),
  postedAt: IsoDateTime.optional(),
});
export type MarketingPost = z.infer<typeof MarketingPost>;

export const FunnelSnapshot = z.object({
  date: IsoDate,
  registrations: z.int().nonnegative().describe("Cumulative confirmed plus waitlisted at end of day"),
  target: z.int().nonnegative().describe("Cumulative target for that day"),
});
export type FunnelSnapshot = z.infer<typeof FunnelSnapshot>;

export const ChecklistItem = z.object({
  id: Id,
  label: z.string().max(200),
  status: ChecklistItemStatus,
  notes: z.string().max(400).optional(),
});
export type ChecklistItem = z.infer<typeof ChecklistItem>;

export const Checklist = z.object({
  id: Id,
  eventId: Id,
  title: Title,
  scope: z.object({ type: z.enum(["room", "vendor", "event"]), ref: z.string().optional() }),
  items: z.array(ChecklistItem),
  version: Version,
});
export type Checklist = z.infer<typeof Checklist>;

export const InventoryItem = z.object({
  id: Id,
  eventId: Id,
  name: z.string().max(120),
  count: z.int().min(0),
  unit: z.string().max(20).optional(),
});
export type InventoryItem = z.infer<typeof InventoryItem>;

export const FoodCount = z.object({
  date: IsoDate,
  meal: Meal,
  veg: z.int().min(0),
  nonVeg: z.int().min(0),
  vegan: z.int().min(0),
  jain: z.int().min(0),
  other: z.int().min(0),
});
export type FoodCount = z.infer<typeof FoodCount>;

// ---------------------------------------------------------------------------
// Post-event
// ---------------------------------------------------------------------------

export const Certificate = z.object({
  id: Id,
  eventId: Id,
  kind: CertificateKind,
  recipientName: z.string().max(120),
  title: z.string().max(160).describe("E.g. 'Certificate of Participation'"),
  registrationId: Id.optional(),
  volunteerId: Id.optional(),
  hours: z.number().nonnegative().optional().describe("Volunteer hours, for volunteer certificates"),
  issuedAt: IsoDateTime,
  issuedBy: z.string().max(160).describe("Organisation or signatory shown on the certificate"),
  revoked: z.boolean(),
  revokedAt: IsoDateTime.optional(),
  verifyUrl: z.url(),
});
export type Certificate = z.infer<typeof Certificate>;

export const OdList = z.object({
  id: Id,
  eventId: Id,
  department: z.string().max(80),
  year: z.int().min(1).max(6),
  section: z.string().max(10).optional(),
  date: IsoDate,
  timeWindow: z.object({ from: IsoDateTime, to: IsoDateTime }),
  entries: z.array(z.object({ name: z.string(), rollNo: z.string(), year: z.int(), section: z.string() })),
  status: z.enum(["draft", "approved", "issued"]),
  fileRef: z.string().optional().describe("Path of the generated letter PDF"),
  generatedAt: IsoDateTime,
});
export type OdList = z.infer<typeof OdList>;

export const Feedback = z.object({
  id: Id,
  eventId: Id,
  registrationId: Id.optional(),
  rating: z.int().min(1).max(5),
  answers: z.record(z.string(), z.string().max(1000)),
  comment: z.string().max(2000).optional(),
  createdAt: IsoDateTime,
});
export type Feedback = z.infer<typeof Feedback>;

export const PlaybookLesson = z.object({
  id: Id,
  eventType: EventType,
  title: Title,
  lesson: z.string().max(2000),
  tags: z.array(z.string()),
  sourceEventId: Id.optional(),
  createdAt: IsoDateTime,
});
export type PlaybookLesson = z.infer<typeof PlaybookLesson>;

// ---------------------------------------------------------------------------
// Commander outputs
// ---------------------------------------------------------------------------

export const Fact = z.object({
  id: z.string().max(80).describe("Fact id the narrative cites, e.g. 'budget.catering.used'"),
  label: z.string().max(200),
  value: z.union([z.string(), z.number(), z.boolean()]),
  source: z.string().max(200).describe("Where the number came from: service name or 'table/id'"),
});
export type Fact = z.infer<typeof Fact>;

export const Briefing = z.object({
  id: Id,
  eventId: Id,
  date: IsoDate,
  scope: z.object({ domain: Domain.optional(), leadUserId: Id.optional(), full: z.boolean() }),
  sections: z.array(
    z.object({
      key: z.enum([
        "yesterday",
        "today",
        "at_risk",
        "decisions",
        "money",
        "registrations",
        "incidents",
        "agents",
      ]),
      title: z.string().max(80),
      narrative: z.string().max(2000),
      factIds: z
        .array(z.string())
        .describe("Every number in the narrative must come from one of these facts"),
    }),
  ),
  facts: z.array(Fact),
  generatedBy: z.enum(["model", "rules"]),
  generatedAt: IsoDateTime,
});
export type Briefing = z.infer<typeof Briefing>;

export const WhatIfPerturbation = z.discriminatedUnion("type", [
  z.object({ type: z.literal("attendance_multiplier"), value: z.number().positive().max(5) }),
  z.object({ type: z.literal("weather"), value: z.enum(["rain", "heat", "storm"]) }),
  z.object({ type: z.literal("speaker_cancel"), speakerId: Id }),
  z.object({ type: z.literal("budget_delta"), amountInr: z.number() }),
  z.object({ type: z.literal("room_loss"), roomId: Id }),
  z.object({ type: z.literal("date_shift"), days: z.int().min(-60).max(60) }),
]);
export type WhatIfPerturbation = z.infer<typeof WhatIfPerturbation>;

export const WhatIfResult = z.object({
  id: Id,
  eventId: Id,
  simulation: z.literal(true).describe("Always true: nothing in real state changed"),
  scenario: z.string().max(500),
  assumptions: z.array(z.object({ label: z.string().max(200), value: z.string().max(200) })),
  perturbations: z.array(WhatIfPerturbation),
  impacts: z.array(
    z.object({
      domain: Domain,
      summary: z.string().max(600),
      metrics: z.array(
        z.object({ label: z.string(), before: z.number(), after: z.number(), unit: z.string().optional() }),
      ),
    }),
  ),
  recommendations: z.array(ProposeResult).describe("Results with status 'simulated'; nothing was persisted"),
  confidence: z.number().min(0).max(1),
  createdAt: IsoDateTime,
});
export type WhatIfResult = z.infer<typeof WhatIfResult>;

export const PlanView = z
  .object({
    proposal: ActionProposal,
    agentTeam: z.array(AgentTeamEntry),
  })
  .describe("A plan.create proposal with its org chart, for the console plan preview");
export type PlanView = z.infer<typeof PlanView>;

// ---------------------------------------------------------------------------
// Metrics (metrics.snapshot)
// ---------------------------------------------------------------------------

export const MetricsSnapshot = z.object({
  at: IsoDateTime,
  registrations: z.object({
    confirmed: z.int().nonnegative(),
    waitlisted: z.int().nonnegative(),
    cancelled: z.int().nonnegative(),
    target: z.int().nonnegative().optional(),
  }),
  checkins: z.object({
    count: z.int().nonnegative(),
    rate: Percent.describe("checked in / confirmed"),
    lastTenMinutes: z.int().nonnegative(),
  }),
  incidentsOpen: z.int().nonnegative(),
  emergenciesOpen: z.int().nonnegative(),
  pendingApprovals: z.int().nonnegative(),
  pendingByDomain: z.partialRecord(Domain, z.int().nonnegative()),
  helpdesk: z.object({
    lastTenMinutes: z.int().nonnegative(),
    clusters: z.array(z.object({ key: z.string(), count: z.int().positive(), sample: z.string().max(200) })),
    escalationsOpen: z.int().nonnegative(),
  }),
  budget: z.array(BudgetCategoryStatus),
  funnel: z.object({ actual: z.int().nonnegative(), target: z.int().nonnegative() }),
  modelSpendUsdToday: z.number().nonnegative(),
});
export type MetricsSnapshot = z.infer<typeof MetricsSnapshot>;

// ---------------------------------------------------------------------------
// Orgs, users, memberships
// ---------------------------------------------------------------------------

export const Org = z.object({ id: Id, name: z.string().max(160), slug: z.string().max(64) });
export type Org = z.infer<typeof Org>;

export const User = z.object({
  id: Id,
  name: z.string().max(120),
  email: z.email(),
  createdAt: IsoDateTime,
});
export type User = z.infer<typeof User>;

export const EventMembership = z.object({
  id: Id,
  orgId: Id,
  eventId: Id,
  userId: Id,
  role: Role,
  domains: z.array(Domain).describe("Only meaningful for role 'lead'"),
});
export type EventMembership = z.infer<typeof EventMembership>;
