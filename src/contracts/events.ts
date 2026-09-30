import { z } from "zod";
import { Id, IsoDateTime } from "./common";
import { IncidentCategory, Severity } from "./enums";
import { Actor, Channel } from "./identity";

/** Every domain event type. Emitted by executors and services through the event bus. */
export const DOMAIN_EVENT_TYPES = [
  "registration.created",
  "registration.updated",
  "registration.status_changed",
  "registration.waitlisted",
  "registration.promoted",
  "registration.duplicate_flagged",
  "registration.merged",
  "registration.checked_in",
  "session.created",
  "session.updated",
  "session.cancelled",
  "session.room_changed",
  "session.running_late",
  "speaker.confirmed",
  "speaker.requirements_submitted",
  "shift.created",
  "shift.assigned",
  "shift.unassigned",
  "shift.checked_in",
  "shift.missed",
  "task.created",
  "task.updated",
  "helpdesk.message",
  "helpdesk.answered",
  "helpdesk.escalated",
  "helpdesk.replied",
  "voice_note.received",
  "incident.created",
  "incident.updated",
  "incident.resolved",
  "proposal.created",
  "proposal.approved",
  "proposal.rejected",
  "proposal.edited",
  "proposal.executed",
  "proposal.failed",
  "proposal.stale",
  "proposal.expired",
  "proposal.undone",
  "kb.document_added",
  "kb.updated",
  "announcement.scheduled",
  "announcement.sent",
  "announcement.failed",
  "agent.run_started",
  "agent.run_finished",
  "agent.run_failed",
  "agent.enabled_changed",
  "agent.kill_switch",
  "finance.budget_set",
  "finance.expense_recorded",
  "finance.income_recorded",
  "finance.threshold_crossed",
  "sponsor.prospect_added",
  "sponsor.stage_changed",
  "sponsor.followup_due",
  "sponsor.reply_received",
  "marketing.post_drafted",
  "milestone.created",
  "milestone.updated",
  "milestone.overdue",
  "logistics.checklist_updated",
  "system.tick",
  "system.demo_reset",
  "system.budget_paused",
  "system.emergency_alert",
] as const;

export const DomainEventType = z.enum(DOMAIN_EVENT_TYPES);
export type DomainEventType = z.infer<typeof DomainEventType>;

export const DomainEvent = z.object({
  id: Id,
  eventId: Id.describe("The Sutradhar event (hackathon, fest...) this happened in, not the domain event id"),
  type: DomainEventType,
  entity: z.string().min(1).max(60).describe("Table of the row that changed, e.g. 'sessions'"),
  entityId: Id,
  actor: Actor,
  payload: z
    .record(z.string(), z.unknown())
    .describe("Type-specific data. See DomainEventPayloads for typed ones."),
  at: IsoDateTime,
});
export type DomainEvent = z.infer<typeof DomainEvent>;

/**
 * Typed payloads for the events agents react to. Other events carry a free-form payload
 * (usually `{ before, after }` for updates). Payloads never contain raw email or phone.
 */
export const DomainEventPayloads = {
  "registration.created": z.object({
    registrationId: Id,
    status: z.enum(["confirmed", "waitlisted", "pending"]),
    sessionIds: z.array(Id),
    duplicateSuspects: z.array(
      z.object({
        registrationId: Id,
        matchType: z.enum(["email", "phone", "fuzzy_name_college"]),
        score: z.number().optional(),
      }),
    ),
  }),
  "registration.checked_in": z.object({
    registrationId: Id,
    ticketId: Id,
    checkinId: Id,
    sessionId: Id.optional(),
    scannerUserId: Id,
    deviceTime: IsoDateTime,
    offline: z.boolean().describe("True when it arrived through the offline sync endpoint"),
  }),
  "session.updated": z.object({
    sessionId: Id,
    before: z.object({ startsAt: IsoDateTime, endsAt: IsoDateTime, roomId: Id }),
    after: z.object({ startsAt: IsoDateTime, endsAt: IsoDateTime, roomId: Id }),
    proposalId: Id.optional(),
  }),
  "session.cancelled": z.object({
    sessionId: Id,
    reason: z.string(),
    speakerIds: z.array(Id),
    registeredCount: z.int().nonnegative(),
    proposalId: Id.optional(),
  }),
  "session.running_late": z.object({ sessionId: Id, minutes: z.int().positive(), reportedBy: Id.optional() }),
  "shift.missed": z.object({
    shiftId: Id,
    assignmentId: Id,
    volunteerId: Id,
    startsAt: IsoDateTime,
    minutesLate: z.int().nonnegative(),
  }),
  "helpdesk.message": z.object({
    conversationId: Id,
    messageId: Id,
    channel: Channel,
    askerRole: z.enum(["attendee", "volunteer", "speaker", "public"]),
    askerUserId: Id.optional(),
    text: z.string().max(4000).describe("Untrusted. Wrap as data before any model call."),
    language: z.enum(["en", "hi", "hinglish"]).optional(),
  }),
  "voice_note.received": z.object({
    uploadPath: z.string().describe("Path under uploads/ of the stored audio file"),
    mimeType: z.string(),
    durationSeconds: z.number().nonnegative().optional(),
    fromUserId: Id.optional(),
    fromVolunteerId: Id.optional(),
    channel: Channel,
    transcript: z.string().optional().describe("Present when already transcribed (demo trigger)"),
  }),
  "incident.created": z.object({
    incidentId: Id,
    category: IncidentCategory,
    severity: Severity,
    emergency: z.boolean(),
  }),
  "kb.updated": z.object({ documentId: Id, version: z.int().min(1) }),
  "proposal.created": z.object({
    proposalId: Id,
    kind: z.string(),
    riskTier: z.string(),
    status: z.string(),
  }),
  "proposal.executed": z.object({ proposalId: Id, kind: z.string() }),
  "finance.threshold_crossed": z.object({
    categoryId: Id,
    threshold: z.enum(["80", "100"]),
    spentRatio: z.number(),
  }),
  "system.emergency_alert": z.object({ incidentId: Id.optional(), summary: z.string().max(600) }),
} satisfies Partial<Record<DomainEventType, z.ZodType>>;

export type DomainEventPayloads = typeof DomainEventPayloads;
export type TypedEventType = keyof DomainEventPayloads;
export type DomainEventPayload<T extends TypedEventType> = z.infer<DomainEventPayloads[T]>;

/** Parse an event's payload when the type has a typed schema; returns null for untyped events. */
export function parseEventPayload<T extends TypedEventType>(
  type: T,
  payload: unknown,
): DomainEventPayload<T> | null {
  const schema = DomainEventPayloads[type];
  const parsed = schema.safeParse(payload);
  return parsed.success ? (parsed.data as DomainEventPayload<T>) : null;
}
