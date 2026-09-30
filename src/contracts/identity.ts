import { z } from "zod";
import { Id } from "./common";

export const Role = z.enum([
  "owner",
  "organizer",
  "lead",
  "faculty_approver",
  "volunteer",
  "attendee",
  "speaker",
  "sponsor",
  "viewer",
]);
export type Role = z.infer<typeof Role>;

export const Domain = z.enum([
  "planning",
  "finance",
  "sponsorship",
  "marketing",
  "registrations",
  "schedule",
  "speakers",
  "crew",
  "logistics",
  "comms",
  "helpdesk",
  "ops",
  "post_event",
]);
export type Domain = z.infer<typeof Domain>;

export const AgentName = z.enum([
  "commander",
  "planner",
  "finance",
  "sponsorship",
  "marketing",
  "registrar",
  "scheduler",
  "speaker_liaison",
  "crew_chief",
  "logistics",
  "herald",
  "helpdesk",
  "radar",
  "chronicler",
]);
export type AgentName = z.infer<typeof AgentName>;

/** The domain each agent works in, per blueprint Section 4. Used to route approvals to the right lead. */
export const AGENT_DOMAIN: Record<AgentName, Domain> = {
  commander: "planning",
  planner: "planning",
  finance: "finance",
  sponsorship: "sponsorship",
  marketing: "marketing",
  registrar: "registrations",
  scheduler: "schedule",
  speaker_liaison: "speakers",
  crew_chief: "crew",
  logistics: "logistics",
  herald: "comms",
  helpdesk: "helpdesk",
  radar: "ops",
  chronicler: "post_event",
};

export const EventType = z.enum([
  "hackathon",
  "tech_fest",
  "workshop",
  "conference",
  "cultural_night",
  "charity_drive",
  "marathon",
  "product_launch",
  "wedding",
  "community_meetup",
  "school_function",
  "other",
]);
export type EventType = z.infer<typeof EventType>;

export const Channel = z.enum(["in_app", "email", "telegram", "whatsapp", "sms"]);
export type Channel = z.infer<typeof Channel>;

export const UserActor = z.object({
  kind: z.literal("user"),
  userId: Id,
  orgId: Id.describe("Org of the membership in use. Every query is scoped by this, never by request text."),
  eventId: Id.describe(
    "Event of the membership in use. Every query is scoped by this, never by request text.",
  ),
  role: Role,
  domains: z.array(Domain).optional().describe("Only for role 'lead': the domains this lead approves"),
});
export type UserActor = z.infer<typeof UserActor>;

export const AgentActor = z.object({
  kind: z.literal("agent"),
  agent: AgentName,
  runId: Id.describe("agent_runs row this action belongs to"),
  eventId: Id.describe("Event the run is scoped to"),
  simulation: z
    .boolean()
    .optional()
    .describe("True inside what-if runs. propose() returns a 'simulated' result and persists nothing."),
});
export type AgentActor = z.infer<typeof AgentActor>;

export const SystemActor = z.object({
  kind: z.literal("system"),
  eventId: Id.optional().describe("Set when the system acts on behalf of one event (cron, worker jobs)"),
  reason: z.string().max(120).optional().describe("Why the system acted, for the audit log"),
});
export type SystemActor = z.infer<typeof SystemActor>;

export const Actor = z.discriminatedUnion("kind", [UserActor, AgentActor, SystemActor]);
export type Actor = z.infer<typeof Actor>;
