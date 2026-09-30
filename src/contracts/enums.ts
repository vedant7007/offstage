import { z } from "zod";

/**
 * Small enums shared by domain entities and action payloads. Kept apart so
 * proposals.ts and domain.ts can both import them without a cycle.
 */

export const RegistrationStatus = z.enum(["pending", "confirmed", "waitlisted", "cancelled", "rejected"]);
export type RegistrationStatus = z.infer<typeof RegistrationStatus>;

export const FoodPref = z.enum(["veg", "non_veg", "vegan", "jain", "none"]);
export type FoodPref = z.infer<typeof FoodPref>;

export const Meal = z.enum(["breakfast", "lunch", "snacks", "dinner"]);
export type Meal = z.infer<typeof Meal>;

export const SessionKind = z.enum([
  "keynote",
  "talk",
  "workshop",
  "panel",
  "hackathon",
  "judging",
  "ceremony",
  "break",
  "meal",
  "other",
]);
export type SessionKind = z.infer<typeof SessionKind>;

export const SessionStatus = z.enum(["scheduled", "running", "delayed", "cancelled", "done"]);
export type SessionStatus = z.infer<typeof SessionStatus>;

export const RoomKind = z.enum([
  "auditorium",
  "lab",
  "hall",
  "classroom",
  "outdoor",
  "food_court",
  "desk",
  "other",
]);
export type RoomKind = z.infer<typeof RoomKind>;

export const SpeakerStatus = z.enum(["invited", "tentative", "confirmed", "declined"]);
export type SpeakerStatus = z.infer<typeof SpeakerStatus>;

export const ShiftAssignmentStatus = z.enum(["assigned", "checked_in", "missed", "released", "done"]);
export type ShiftAssignmentStatus = z.infer<typeof ShiftAssignmentStatus>;

export const TaskStatus = z.enum(["open", "in_progress", "done", "cancelled"]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const Priority = z.enum(["low", "normal", "high", "urgent"]);
export type Priority = z.infer<typeof Priority>;

export const IncidentCategory = z.enum([
  "av",
  "food",
  "facilities",
  "crowd",
  "queue",
  "confusion",
  "it",
  "safety",
  "medical",
  "fire",
  "harassment",
  "system",
  "other",
]);
export type IncidentCategory = z.infer<typeof IncidentCategory>;

/** Agents never act on these: loud alert to all leads, humans only (blueprint Section 4). */
export const EMERGENCY_CATEGORIES = [
  "safety",
  "medical",
  "fire",
  "harassment",
] as const satisfies readonly IncidentCategory[];
export function isEmergencyCategory(c: IncidentCategory): boolean {
  return (EMERGENCY_CATEGORIES as readonly string[]).includes(c);
}

export const Severity = z.enum(["low", "medium", "high", "critical"]);
export type Severity = z.infer<typeof Severity>;

export const IncidentStatus = z.enum(["open", "acknowledged", "in_progress", "resolved"]);
export type IncidentStatus = z.infer<typeof IncidentStatus>;

export const IncidentSource = z.enum([
  "radar",
  "voice_note",
  "crew_report",
  "helpdesk",
  "organizer",
  "system",
]);
export type IncidentSource = z.infer<typeof IncidentSource>;

export const AnnouncementCategory = z
  .enum(["info", "change", "official", "emergency"])
  .describe(
    "'official' can require faculty approval (T3); 'emergency' may bypass quiet hours only when a human flagged it",
  );
export type AnnouncementCategory = z.infer<typeof AnnouncementCategory>;

export const SegmentType = z.enum([
  "all",
  "session",
  "volunteers",
  "crew_role",
  "speakers",
  "sponsors",
  "custom",
]);
export type SegmentType = z.infer<typeof SegmentType>;

export const MilestoneStatus = z.enum(["not_started", "in_progress", "done", "blocked", "skipped"]);
export type MilestoneStatus = z.infer<typeof MilestoneStatus>;

export const LedgerType = z.enum(["expense", "income", "refund"]);
export type LedgerType = z.infer<typeof LedgerType>;

export const LedgerStatus = z
  .enum(["committed", "paid", "due", "received"])
  .describe("committed: agreed, not yet paid. paid: money out. due: owed to us. received: money in.");
export type LedgerStatus = z.infer<typeof LedgerStatus>;

export const IncomeSource = z.enum(["sponsor", "registration_fee", "grant", "donation", "college", "other"]);
export type IncomeSource = z.infer<typeof IncomeSource>;

export const SponsorStage = z.enum([
  "prospect",
  "contacted",
  "replied",
  "negotiating",
  "confirmed",
  "declined",
]);
export type SponsorStage = z.infer<typeof SponsorStage>;

export const SponsorTier = z.enum(["title", "gold", "silver", "partner", "in_kind"]);
export type SponsorTier = z.infer<typeof SponsorTier>;

export const DeliverableStatus = z.enum(["pending", "in_progress", "done"]);
export type DeliverableStatus = z.infer<typeof DeliverableStatus>;

export const MarketingPlatform = z.enum(["instagram", "linkedin", "whatsapp", "x", "email", "poster"]);
export type MarketingPlatform = z.infer<typeof MarketingPlatform>;

export const MarketingPostStatus = z.enum(["draft", "approved", "posted"]);
export type MarketingPostStatus = z.infer<typeof MarketingPostStatus>;

export const ChecklistItemStatus = z.enum(["todo", "in_progress", "done", "blocked"]);
export type ChecklistItemStatus = z.infer<typeof ChecklistItemStatus>;

export const CertificateKind = z.enum(["attendee", "winner", "volunteer", "speaker"]);
export type CertificateKind = z.infer<typeof CertificateKind>;

export const KbDocumentKind = z.enum(["rulebook", "faq", "venue", "menu", "schedule", "policy", "other"]);
export type KbDocumentKind = z.infer<typeof KbDocumentKind>;

export const Language = z.enum(["en", "hi", "hinglish"]);
export type Language = z.infer<typeof Language>;
