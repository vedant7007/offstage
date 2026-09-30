import { z } from "zod";
import { Id, IsoDate, IsoDateTime, MoneyInr, Title } from "./common";
import {
  AnnouncementCategory,
  CertificateKind,
  ChecklistItemStatus,
  DeliverableStatus,
  IncidentCategory,
  IncidentSource,
  IncidentStatus,
  IncomeSource,
  KbDocumentKind,
  LedgerStatus,
  MarketingPlatform,
  Meal,
  MilestoneStatus,
  Priority,
  RegistrationStatus,
  SegmentType,
  SessionKind,
  Severity,
  SpeakerStatus,
  SponsorTier,
} from "./enums";
import { Actor, AgentName, Channel, Domain, EventType, Role } from "./identity";

// ---------------------------------------------------------------------------
// Tiers and status
// ---------------------------------------------------------------------------

export const RiskTier = z
  .enum(["T0", "T1", "T2", "T3"])
  .describe(
    "T0 internal record, auto. T1 one person, reversible, auto with 10 min undo. T2 many people, public or money, one approval. T3 irreversible, official, bulk or large money, two approvals.",
  );
export type RiskTier = z.infer<typeof RiskTier>;

export const ProposalStatus = z.enum([
  "draft",
  "pending",
  "approved",
  "rejected",
  "executing",
  "executed",
  "failed",
  "stale",
  "expired",
  "undone",
  "simulated",
]);
export type ProposalStatus = z.infer<typeof ProposalStatus>;

/** Every action kind, in blueprint order. */
export const ACTION_KINDS = [
  "plan.create",
  "plan.bundle",
  "plan.milestone.create",
  "plan.milestone.update",
  "plan.agent_team.set",
  "finance.budget.set",
  "finance.expense.record",
  "finance.income.record",
  "finance.quote.compare",
  "sponsor.prospect.add",
  "sponsor.outreach.draft",
  "sponsor.followup.schedule",
  "sponsor.deliverable.update",
  "marketing.post.draft",
  "marketing.calendar.set",
  "marketing.push.suggest",
  "registration.promote_waitlist",
  "registration.set_status",
  "registration.flag_duplicate",
  "registration.merge",
  "registration.capacity.set",
  "schedule.create_session",
  "schedule.move_session",
  "schedule.cancel_session",
  "schedule.change_room",
  "schedule.shift_downstream",
  "speaker.confirm",
  "speaker.requirement.record",
  "speaker.reminder.schedule",
  "crew.create_shift",
  "crew.assign_shift",
  "crew.unassign_shift",
  "crew.create_task",
  "crew.briefing.draft",
  "logistics.checklist.update",
  "logistics.inventory.update",
  "logistics.food_count.set",
  "comms.send_announcement",
  "comms.send_direct",
  "comms.reminder.schedule",
  "helpdesk.escalate",
  "helpdesk.reply",
  "kb.publish_update",
  "incident.create",
  "incident.update",
  "certificates.issue_batch",
  "od.generate_list",
  "report.generate",
  "playbook.add_lesson",
] as const;
export const ActionKind = z.enum(ACTION_KINDS);
export type ActionKind = z.infer<typeof ActionKind>;

// ---------------------------------------------------------------------------
// Pieces shared by several payloads
// ---------------------------------------------------------------------------

export const Citation = z.object({
  ref: z
    .string()
    .min(1)
    .max(200)
    .describe(
      "Source reference: 'kb:<docId>#<section>' for documents, 'live:<fact>' for live state, 'row:<table>/<id>'",
    ),
  label: z.string().min(1).max(160).describe("Human label shown on the citation chip"),
});
export type Citation = z.infer<typeof Citation>;

export const MilestoneDraft = z.object({
  title: Title,
  domain: Domain,
  dueOn: IsoDate,
  ownerRole: Role.describe("Role responsible, usually 'lead' with the matching domain"),
  dependsOn: z
    .array(Id)
    .default([])
    .describe("Milestone ids (or draft titles inside plan.create) this waits on"),
  critical: z.boolean().default(false).describe("Critical milestones raise an incident when overdue"),
  notes: z.string().max(1000).optional(),
});
export type MilestoneDraft = z.infer<typeof MilestoneDraft>;

export const AgentTeamEntry = z.object({
  agent: AgentName,
  enabled: z.boolean(),
  humanLeadRole: Role,
  humanLeadUserId: Id.optional().describe(
    "Specific person when known; otherwise any user with humanLeadRole",
  ),
  mandate: z.string().min(1).max(200).describe("One line: what this agent owns for this event"),
});
export type AgentTeamEntry = z.infer<typeof AgentTeamEntry>;

export const BudgetCategoryDraft = z.object({
  categoryId: Id.optional().describe("Existing category to update; omit to create"),
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]{1,39}$/)
    .describe("Stable key such as 'catering', 'venue', 'marketing'"),
  name: Title,
  capInr: MoneyInr,
});
export type BudgetCategoryDraft = z.infer<typeof BudgetCategoryDraft>;

export const RiskItem = z.object({
  title: Title,
  likelihood: z.enum(["low", "medium", "high"]),
  impact: z.enum(["low", "medium", "high"]),
  mitigation: z.string().max(600),
  domain: Domain.optional(),
});
export type RiskItem = z.infer<typeof RiskItem>;

export const Segment = z
  .object({
    type: SegmentType,
    ref: z
      .string()
      .max(200)
      .optional()
      .describe(
        "sessionId for 'session', role name for 'crew_role', a saved filter id for 'custom'. Omit for 'all'.",
      ),
  })
  .refine(
    (s) =>
      s.type === "all" ||
      s.type === "volunteers" ||
      s.type === "speakers" ||
      s.type === "sponsors" ||
      !!s.ref,
    {
      message: "segment.ref is required for session, crew_role and custom segments",
      path: ["ref"],
    },
  );
export type Segment = z.infer<typeof Segment>;

/** Message text per channel. Every channel listed in `channels` must have a body. */
export const BodyByChannel = z.partialRecord(Channel, z.string().min(1).max(4000));
export type BodyByChannel = z.infer<typeof BodyByChannel>;

function bodiesCoverChannels(v: { channels: Channel[]; bodyByChannel: BodyByChannel }) {
  return v.channels.every((c) => typeof v.bodyByChannel[c] === "string");
}

export const DirectRecipient = z.object({
  type: z.enum(["user", "registration", "volunteer", "speaker", "sponsor_contact"]),
  id: Id,
});
export type DirectRecipient = z.infer<typeof DirectRecipient>;

// ---------------------------------------------------------------------------
// Payloads, one per ActionKind. Fields not known yet are optional.
// ---------------------------------------------------------------------------

const PlanCreate = z.object({
  title: Title,
  summary: z.string().max(2000).optional(),
  milestones: z.array(MilestoneDraft).max(200),
  budget: z.object({ totalInr: MoneyInr, categories: z.array(BudgetCategoryDraft).max(30) }),
  risks: z.array(RiskItem).max(50).default([]),
  agentTeam: z.array(AgentTeamEntry).max(14).default([]),
});

/** A child inside a plan.bundle. Nested bundles are not allowed. */
export const BundleChild = z.object({
  kind: ActionKind.exclude(["plan.bundle"]),
  payload: z.unknown().describe("Validated against ActionPayloads[kind] by propose()"),
  summary: z.string().min(1).max(120),
  rationale: z.string().max(600).default(""),
  proposedBy: AgentName.optional().describe("Agent that drafted this child, for the timeline"),
});
export type BundleChild = z.infer<typeof BundleChild>;

export const Ripple = z
  .object({
    sessions: z.array(z.object({ id: Id, title: z.string(), change: z.string().max(200) })),
    rooms: z.array(z.object({ id: Id, name: z.string() })),
    attendees: z.object({
      count: z.int().nonnegative(),
      sample: z
        .array(
          z.object({ registrationId: Id, displayName: z.string().describe("Short name, e.g. 'Sneha R.'") }),
        )
        .max(10),
    }),
    volunteers: z.array(z.object({ id: Id, displayName: z.string(), change: z.string().max(200) })),
    announcements: z.array(
      z.object({ segment: Segment, channels: z.array(Channel), recipients: z.int().nonnegative() }),
    ),
    kbAnswers: z.array(z.object({ docId: Id, title: z.string(), change: z.string().max(200) })),
  })
  .describe("Everything a change touches, for the console Ripple view");
export type Ripple = z.infer<typeof Ripple>;

export const ScheduleOption = z.object({
  id: z.string().max(40),
  label: z.string().max(120),
  metrics: z
    .record(z.string(), z.number())
    .describe("Solver metrics such as movedSessions, capacityShortfall"),
  chosen: z.boolean(),
});
export type ScheduleOption = z.infer<typeof ScheduleOption>;

const PlanBundle = z.object({
  title: Title,
  children: z.array(BundleChild).min(1).max(50),
  ripple: Ripple.optional(),
  options: z
    .array(ScheduleOption)
    .max(3)
    .optional()
    .describe("Solver options considered; the chosen one is expanded into children"),
});

const PlanMilestoneUpdate = z.object({
  milestoneId: Id,
  title: Title.optional(),
  status: MilestoneStatus.optional(),
  dueOn: IsoDate.optional(),
  ownerRole: Role.optional(),
  notes: z.string().max(1000).optional(),
});

const PlanAgentTeamSet = z.object({ agents: z.array(AgentTeamEntry).min(1).max(14) });

const FinanceBudgetSet = z.object({
  totalInr: MoneyInr,
  categories: z.array(BudgetCategoryDraft).min(1).max(30),
});

const FinanceExpenseRecord = z.object({
  categoryId: Id,
  amountInr: MoneyInr.positive(),
  vendor: z.string().max(160).optional(),
  note: z.string().min(1).max(600),
  evidenceRef: z.string().max(300).optional().describe("Path or id of an uploaded bill or quote"),
  status: LedgerStatus.extract(["committed", "paid"]).default("committed"),
  occurredOn: IsoDate.optional(),
});

const FinanceIncomeRecord = z.object({
  source: IncomeSource,
  amountInr: MoneyInr.positive(),
  sponsorId: Id.optional(),
  note: z.string().min(1).max(600),
  evidenceRef: z.string().max(300).optional(),
  status: LedgerStatus.extract(["due", "received"]).default("due"),
  occurredOn: IsoDate.optional(),
});

const FinanceQuoteCompare = z.object({
  title: Title,
  categoryId: Id.optional(),
  quotes: z
    .array(
      z.object({
        vendor: z.string().min(1).max(160),
        amountInr: MoneyInr,
        items: z.string().max(1000).optional(),
        notes: z.string().max(600).optional(),
        validUntil: IsoDate.optional(),
      }),
    )
    .min(2)
    .max(10),
  recommendation: z.object({ vendor: z.string().max(160), reason: z.string().max(600) }).optional(),
});

const SponsorProspectAdd = z.object({
  prospects: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        tier: SponsorTier.optional(),
        fitReason: z.string().min(1).max(400),
        contactName: z.string().max(120).optional(),
        contactEmail: z.email().optional(),
        askInr: MoneyInr.optional(),
      }),
    )
    .min(1)
    .max(50),
});

const SponsorOutreachDraft = z.object({
  prospectId: Id,
  subject: z.string().min(1).max(200),
  body: z.string().min(1).max(6000),
  reviewerUserId: Id.optional().describe(
    "Lead who reviews the draft. The draft is never sent to the sponsor by this action.",
  ),
});

const SponsorFollowupSchedule = z.object({ prospectId: Id, dueAt: IsoDateTime, note: z.string().max(400) });

const SponsorDeliverableUpdate = z.object({
  prospectId: Id,
  deliverableId: Id.optional().describe("Omit to create a new deliverable"),
  title: Title,
  status: DeliverableStatus,
  evidenceRef: z.string().max(300).optional(),
});

const MarketingPostDraft = z.object({
  platform: MarketingPlatform,
  body: z.string().min(1).max(4000),
  hashtags: z.array(z.string().max(60)).max(20).default([]),
  scheduledFor: IsoDateTime.optional(),
  posterBrief: z
    .string()
    .max(1000)
    .optional()
    .describe("Only for platform 'poster': what the design should show"),
});

const MarketingCalendarSet = z.object({
  entries: z
    .array(
      z.object({
        date: IsoDate,
        platform: MarketingPlatform,
        theme: z.string().max(200),
        postId: Id.optional(),
      }),
    )
    .min(1)
    .max(200),
});

const MarketingPushSuggest = z.object({
  target: z.int().nonnegative(),
  actual: z.int().nonnegative(),
  suggestions: z
    .array(
      z.object({
        action: z.string().max(200),
        segment: z.string().max(200).describe("Who to reach, e.g. '2nd year ECE at CBIT'"),
        reason: z.string().max(400),
      }),
    )
    .min(1)
    .max(10),
});

const RegistrationPromoteWaitlist = z.object({
  registrationIds: z.array(Id).min(1).max(500).describe("In promotion order"),
  sessionId: Id.optional().describe("Promote into this session; omit for event-level capacity"),
});

const RegistrationSetStatus = z.object({
  registrationId: Id,
  status: RegistrationStatus,
  reason: z.string().min(1).max(400),
});

const RegistrationFlagDuplicate = z.object({
  registrationId: Id,
  duplicateOfId: Id,
  matchType: z.enum(["email", "phone", "fuzzy_name_college"]),
  score: z.number().min(0).max(1).optional().describe("Jaro-Winkler similarity for fuzzy matches"),
});

const RegistrationMerge = z.object({
  keepId: Id,
  mergeIds: z.array(Id).min(1).max(10),
  reason: z.string().min(1).max(400),
});

const RegistrationCapacitySet = z.object({
  sessionId: Id.optional().describe("Omit to set the event-wide capacity"),
  capacity: z.int().min(0).max(100_000),
});

const ScheduleCreateSession = z.object({
  title: Title,
  kind: SessionKind.default("talk"),
  trackId: Id.optional(),
  roomId: Id,
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  speakerIds: z.array(Id).max(10).default([]),
  capacity: z.int().positive().optional().describe("Defaults to the room capacity"),
  description: z.string().max(2000).optional(),
});

const ScheduleMoveSession = z.object({
  sessionId: Id,
  newStartsAt: IsoDateTime,
  newEndsAt: IsoDateTime,
  newRoomId: Id.optional(),
});

const ScheduleCancelSession = z.object({
  sessionId: Id,
  reason: z.string().min(1).max(400),
  notifyAttendees: z.boolean().default(true),
});

const ScheduleChangeRoom = z.object({ sessionId: Id, newRoomId: Id, reason: z.string().max(400).optional() });

const ScheduleShiftDownstream = z.object({
  fromTime: IsoDateTime.describe("Sessions starting at or after this instant move"),
  minutes: z
    .int()
    .min(-240)
    .max(240)
    .refine((m) => m !== 0, "minutes must not be 0"),
  roomId: Id.optional(),
  trackId: Id.optional(),
  sessionIds: z.array(Id).max(100).optional().describe("Explicit list; overrides room and track filters"),
});

const SpeakerConfirm = z.object({ speakerId: Id, sessionId: Id.optional(), status: SpeakerStatus });

const SpeakerRequirementRecord = z.object({
  speakerId: Id,
  av: z.array(z.string().max(80)).max(20).default([]),
  travel: z.string().max(600).optional(),
  stay: z.string().max(600).optional(),
  materials: z.string().max(600).optional(),
  notes: z.string().max(1000).optional(),
});

const SpeakerReminderSchedule = z.object({
  speakerId: Id,
  sessionId: Id,
  offsetsMinutes: z
    .array(z.int().min(5).max(20_160))
    .min(1)
    .max(5)
    .describe("Minutes before session start, e.g. [1440, 30]"),
  channels: z.array(Channel).min(1),
});

const CrewCreateShift = z.object({
  role: z.string().min(1).max(80),
  roomId: Id.optional(),
  sessionId: Id.optional(),
  startsAt: IsoDateTime,
  endsAt: IsoDateTime,
  requiredCount: z.int().min(1).max(100),
  skills: z.array(z.string().max(60)).max(10).default([]),
});

const CrewAssignShift = z.object({
  shiftId: Id,
  volunteerId: Id,
  replacesVolunteerId: Id.optional().describe("Set when this covers a no-show"),
});

const CrewUnassignShift = z.object({ shiftId: Id, volunteerId: Id, reason: z.string().min(1).max(400) });

const CrewCreateTask = z.object({
  title: Title,
  description: z.string().max(2000).optional(),
  assigneeVolunteerId: Id.optional(),
  skill: z.string().max(60).optional().describe("Assign to whoever has this skill when no assignee is given"),
  roomId: Id.optional(),
  incidentId: Id.optional(),
  dueAt: IsoDateTime.optional(),
  priority: Priority.default("normal"),
});

const CrewBriefingDraft = z.object({
  role: z.string().min(1).max(80),
  title: Title,
  bodyMarkdown: z.string().min(1).max(10_000),
});

const LogisticsChecklistUpdate = z.object({
  checklistId: Id.optional().describe("Omit to create a checklist"),
  scope: z.object({ type: z.enum(["room", "vendor", "event"]), ref: z.string().max(160).optional() }),
  title: Title.optional(),
  items: z
    .array(
      z.object({
        itemId: Id.optional(),
        label: z.string().min(1).max(200),
        status: ChecklistItemStatus,
        notes: z.string().max(400).optional(),
      }),
    )
    .min(1)
    .max(100),
});

const LogisticsInventoryUpdate = z
  .object({
    itemId: Id.optional(),
    name: z.string().min(1).max(120),
    unit: z.string().max(20).optional(),
    count: z.int().min(0).optional().describe("Absolute count"),
    delta: z.int().optional().describe("Relative change; ignored when count is set"),
    note: z.string().max(400).optional(),
  })
  .refine((v) => v.count !== undefined || v.delta !== undefined, "count or delta is required");

const LogisticsFoodCountSet = z.object({
  date: IsoDate,
  meal: Meal,
  counts: z.object({
    veg: z.int().min(0),
    nonVeg: z.int().min(0),
    vegan: z.int().min(0),
    jain: z.int().min(0),
    other: z.int().min(0),
  }),
  basis: z
    .string()
    .max(400)
    .describe("How the counts were computed, e.g. 'confirmed registrations x 0.9 turnout'"),
});

const CommsSendAnnouncement = z
  .object({
    title: Title,
    segment: Segment,
    channels: z.array(Channel).min(1),
    bodyByChannel: BodyByChannel,
    category: AnnouncementCategory,
    public: z.boolean().default(false).describe("Also show on the public event and status pages"),
    scheduledFor: IsoDateTime.optional().describe("Omit to send right after approval"),
  })
  .refine(bodiesCoverChannels, {
    message: "bodyByChannel needs a body for every channel",
    path: ["bodyByChannel"],
  });

const CommsSendDirect = z
  .object({
    recipient: DirectRecipient,
    channels: z.array(Channel).min(1),
    subject: z.string().max(200).optional(),
    bodyByChannel: BodyByChannel,
    category: AnnouncementCategory.default("info"),
  })
  .refine(bodiesCoverChannels, {
    message: "bodyByChannel needs a body for every channel",
    path: ["bodyByChannel"],
  });

export const ReminderRule = z.object({
  trigger: z
    .enum(["event_start", "session_start", "shift_start", "speaker_on"])
    .describe(
      "event_start: T-7d, T-1d, morning-of style reminders. The others fire per session, shift or speaker slot.",
    ),
  offsetMinutes: z.int().min(5).max(20_160).describe("Minutes before the trigger time"),
  channels: z.array(Channel).min(1),
  templateKey: z.string().max(80).describe("Key into the template copy, e.g. 'reminder.session_15m'"),
  segment: Segment.optional(),
});
export type ReminderRule = z.infer<typeof ReminderRule>;

const CommsReminderSchedule = z.object({ rules: z.array(ReminderRule).min(1).max(20) });

const HelpdeskEscalate = z.object({
  conversationId: Id,
  messageId: Id.optional(),
  summary: z.string().min(1).max(600),
  suggestedReply: z.string().max(2000).optional(),
  category: IncidentCategory.optional(),
  priority: Priority.default("normal"),
});

const HelpdeskReply = z.object({
  conversationId: Id,
  escalationId: Id.optional(),
  body: z.string().min(1).max(2000),
  citations: z.array(Citation).max(10).default([]),
});

const KbPublishUpdate = z.object({
  documentId: Id.optional().describe("Omit to create a new document"),
  title: Title,
  kind: KbDocumentKind.default("other"),
  bodyMarkdown: z.string().min(1).max(50_000),
  reason: z.string().min(1).max(400),
  public: z.boolean().default(false),
});

const IncidentCreate = z.object({
  title: Title,
  category: IncidentCategory,
  severity: Severity,
  source: IncidentSource,
  description: z.string().max(4000),
  roomId: Id.optional(),
  evidenceRefs: z.array(z.string().max(300)).max(10).default([]),
});

const IncidentUpdate = z.object({
  incidentId: Id,
  status: IncidentStatus.optional(),
  severity: Severity.optional(),
  assigneeUserId: Id.optional(),
  note: z.string().max(2000).optional(),
});

const CertificatesIssueBatch = z.object({
  kind: CertificateKind,
  criteria: z
    .enum(["checked_in", "explicit"])
    .default("checked_in")
    .describe("'explicit' uses the id lists below"),
  registrationIds: z.array(Id).max(5000).optional(),
  volunteerIds: z.array(Id).max(500).optional(),
  title: z.string().max(160).optional().describe("Certificate heading, e.g. 'Winner, Best Hack'"),
});

const OdGenerateList = z.object({
  date: IsoDate.optional().describe("Day to cover; defaults to every event day"),
  groupBy: z
    .array(z.enum(["department", "year", "section"]))
    .min(1)
    .default(["department", "year", "section"]),
  sessionIds: z.array(Id).max(100).optional().describe("Only attendance at these sessions counts"),
  facultyName: z.string().max(120).optional(),
});

const ReportGenerate = z.object({
  kind: z.enum(["final", "sponsor", "feedback", "settlement"]),
  sponsorId: Id.optional().describe("Required for kind 'sponsor'"),
});

const PlaybookAddLesson = z.object({
  eventType: EventType,
  title: Title,
  lesson: z.string().min(1).max(2000),
  evidenceRefs: z.array(z.string().max(300)).max(10).default([]),
  tags: z.array(z.string().max(40)).max(10).default([]),
});

/** Payload schema for every ActionKind. propose() validates payloads with this map. */
export const ActionPayloads = {
  "plan.create": PlanCreate,
  "plan.bundle": PlanBundle,
  "plan.milestone.create": MilestoneDraft,
  "plan.milestone.update": PlanMilestoneUpdate,
  "plan.agent_team.set": PlanAgentTeamSet,
  "finance.budget.set": FinanceBudgetSet,
  "finance.expense.record": FinanceExpenseRecord,
  "finance.income.record": FinanceIncomeRecord,
  "finance.quote.compare": FinanceQuoteCompare,
  "sponsor.prospect.add": SponsorProspectAdd,
  "sponsor.outreach.draft": SponsorOutreachDraft,
  "sponsor.followup.schedule": SponsorFollowupSchedule,
  "sponsor.deliverable.update": SponsorDeliverableUpdate,
  "marketing.post.draft": MarketingPostDraft,
  "marketing.calendar.set": MarketingCalendarSet,
  "marketing.push.suggest": MarketingPushSuggest,
  "registration.promote_waitlist": RegistrationPromoteWaitlist,
  "registration.set_status": RegistrationSetStatus,
  "registration.flag_duplicate": RegistrationFlagDuplicate,
  "registration.merge": RegistrationMerge,
  "registration.capacity.set": RegistrationCapacitySet,
  "schedule.create_session": ScheduleCreateSession,
  "schedule.move_session": ScheduleMoveSession,
  "schedule.cancel_session": ScheduleCancelSession,
  "schedule.change_room": ScheduleChangeRoom,
  "schedule.shift_downstream": ScheduleShiftDownstream,
  "speaker.confirm": SpeakerConfirm,
  "speaker.requirement.record": SpeakerRequirementRecord,
  "speaker.reminder.schedule": SpeakerReminderSchedule,
  "crew.create_shift": CrewCreateShift,
  "crew.assign_shift": CrewAssignShift,
  "crew.unassign_shift": CrewUnassignShift,
  "crew.create_task": CrewCreateTask,
  "crew.briefing.draft": CrewBriefingDraft,
  "logistics.checklist.update": LogisticsChecklistUpdate,
  "logistics.inventory.update": LogisticsInventoryUpdate,
  "logistics.food_count.set": LogisticsFoodCountSet,
  "comms.send_announcement": CommsSendAnnouncement,
  "comms.send_direct": CommsSendDirect,
  "comms.reminder.schedule": CommsReminderSchedule,
  "helpdesk.escalate": HelpdeskEscalate,
  "helpdesk.reply": HelpdeskReply,
  "kb.publish_update": KbPublishUpdate,
  "incident.create": IncidentCreate,
  "incident.update": IncidentUpdate,
  "certificates.issue_batch": CertificatesIssueBatch,
  "od.generate_list": OdGenerateList,
  "report.generate": ReportGenerate,
  "playbook.add_lesson": PlaybookAddLesson,
} as const satisfies Record<ActionKind, z.ZodType>;

export type ActionPayloads = typeof ActionPayloads;
/** Parsed payload type for a kind, e.g. `ActionPayload<"schedule.move_session">`. */
export type ActionPayload<K extends ActionKind> = z.infer<ActionPayloads[K]>;
/** Payload type before defaults are applied (what an agent may send). */
export type ActionPayloadInput<K extends ActionKind> = z.input<ActionPayloads[K]>;

type SpecOf<K extends ActionKind> = z.ZodObject<{ kind: z.ZodLiteral<K>; payload: ActionPayloads[K] }>;
type SpecTuple<T extends readonly ActionKind[]> = { -readonly [I in keyof T]: SpecOf<T[I]> };

function specOf<K extends ActionKind>(kind: K): SpecOf<K> {
  return z.object({ kind: z.literal(kind), payload: ActionPayloads[kind] }) as SpecOf<K>;
}

/** `{kind, payload}` with the payload checked against its kind. Narrow on `kind` to get the typed payload. */
export const ActionSpec = z.discriminatedUnion(
  "kind",
  ACTION_KINDS.map(specOf) as unknown as SpecTuple<typeof ACTION_KINDS>,
);
export type ActionSpec = z.infer<typeof ActionSpec>;

// ---------------------------------------------------------------------------
// The proposal envelope
// ---------------------------------------------------------------------------

export const Evidence = z.object({
  type: z.enum(["kb", "row", "event", "metric"]),
  ref: z.string().min(1).max(200).describe("kb chunk ref, 'table/id', domain event id, or metric key"),
  label: z.string().min(1).max(160),
});
export type Evidence = z.infer<typeof Evidence>;

export const Impact = z.object({
  people: z.int().nonnegative().describe("Distinct humans affected, all roles"),
  attendees: z.int().nonnegative(),
  volunteers: z.int().nonnegative(),
  sessions: z.int().nonnegative(),
  moneyInr: MoneyInr.optional(),
  channels: z.array(Channel).describe("Channels that will carry a message if this executes"),
  reversible: z.boolean(),
});
export type Impact = z.infer<typeof Impact>;

export const DiffEntry = z.object({
  entity: z.string().min(1).max(60).describe("Table name, e.g. 'sessions'"),
  id: Id.nullable().describe("null when the row does not exist yet"),
  before: z.record(z.string(), z.unknown()).nullable().describe("null for creates"),
  after: z.record(z.string(), z.unknown()).nullable().describe("null for deletes"),
});
export type DiffEntry = z.infer<typeof DiffEntry>;

export const Precondition = z.object({
  entity: z.string().min(1).max(60),
  id: Id,
  version: z
    .int()
    .min(1)
    .describe("Row version seen when the proposal was made; execution fails as stale if it moved"),
});
export type Precondition = z.infer<typeof Precondition>;

export const Approval = z.object({
  userId: Id,
  role: Role,
  at: IsoDateTime,
  diffHash: z.string().min(1).max(128).describe("Hash of the diff the approver saw"),
});
export type Approval = z.infer<typeof Approval>;

export const ProposalMeta = z.object({
  id: Id,
  eventId: Id,
  proposedBy: Actor,
  planId: Id.optional().describe("plan.create proposal this belongs to"),
  parentId: Id.optional().describe("plan.bundle proposal this is a child of"),
  domain: Domain.describe("Routes the proposal to the lead of this domain"),
  summary: z.string().min(1).max(120),
  rationale: z.string().max(600),
  evidence: z.array(Evidence).max(20),
  impact: Impact,
  diff: z.array(DiffEntry),
  diffHash: z
    .string()
    .min(1)
    .max(128)
    .describe("Send this back with approve so we know the approver saw the current diff"),
  riskTier: RiskTier,
  tierReasons: z
    .array(z.string().max(200))
    .describe("Why policy chose this tier, shown on the approval card"),
  requiredApprovals: z.int().min(0).max(3),
  approvals: z.array(Approval),
  facultyApprovalRequired: z
    .boolean()
    .describe("T3 on an event where a faculty approver or owner must be one of the approvers"),
  status: ProposalStatus,
  idempotencyKey: z.string().min(1).max(200),
  preconditions: z.array(Precondition),
  expiresAt: IsoDateTime,
  createdAt: IsoDateTime,
  executedAt: IsoDateTime.optional(),
  undoUntil: IsoDateTime.optional(),
  error: z.string().max(2000).optional(),
});
export type ProposalMeta = z.infer<typeof ProposalMeta>;

/** A stored proposal: metadata plus a kind-checked payload. */
export const ActionProposal = z.intersection(ProposalMeta, ActionSpec);
export type ActionProposal = z.infer<typeof ActionProposal>;

/** What an agent (or the console) hands to actions.propose(). Server fills id, tier, status, hashes and times. */
export const ProposeInputMeta = z.object({
  summary: z.string().min(1).max(120),
  rationale: z.string().max(600),
  evidence: z.array(Evidence).max(20).default([]),
  impact: Impact.optional().describe("Computed by the executor's describe() when omitted"),
  diff: z.array(DiffEntry).optional().describe("Computed by the executor's describe() when omitted"),
  preconditions: z
    .array(Precondition)
    .optional()
    .describe("Computed by the executor's describe() when omitted"),
  idempotencyKey: z.string().min(1).max(200).describe("Same key, same proposal: retries never duplicate"),
  planId: Id.optional(),
  parentId: Id.optional(),
});
export const ProposeInput = z.intersection(ProposeInputMeta, ActionSpec);
export type ProposeInput = z.infer<typeof ProposeInput>;
export type ProposeInputRaw = z.input<typeof ProposeInput>;

export const ProposeResult = z.discriminatedUnion("status", [
  z.object({ status: z.literal("created"), proposal: ActionProposal }),
  z.object({
    status: z.literal("duplicate"),
    proposal: ActionProposal.describe("Existing proposal with the same idempotencyKey"),
  }),
  z.object({
    status: z.literal("simulated"),
    kind: ActionKind,
    summary: z.string(),
    riskTier: RiskTier,
    impact: Impact,
    diff: z.array(DiffEntry),
  }),
  z.object({
    status: z.literal("invalid"),
    issues: z
      .array(z.object({ path: z.string(), message: z.string() }))
      .describe("zod issues, path joined with dots"),
  }),
]);
export type ProposeResult = z.infer<typeof ProposeResult>;
