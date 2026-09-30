/**
 * The permission matrix, in code. Pure: no database, so every role can be tested against
 * every permission. `can(actor, permission, scope)` answers; src/server/authz/index.ts enforces.
 *
 * Scope rule for everyone: an actor bound to an event may only act on that event.
 */
import type { Actor, Domain, RiskTier, Role } from "@/contracts";

export const PERMISSIONS = [
  // console reads
  "event.read",
  "proposal.read",
  "agents.read",
  "registration.list",
  "finance.read",
  "sponsors.read",
  "marketing.read",
  "milestones.read",
  "incidents.read",
  // console actions
  "proposal.create",
  "proposal.approve",
  "proposal.reject",
  "proposal.edit",
  "proposal.undo",
  "agents.command",
  "agents.kill_switch",
  "event.manage",
  "data.export_all",
  // people and records
  "registration.read",
  "registration.search",
  "checkin.scan",
  "crew.self",
  "incident.report",
  "helpdesk.chat",
  "data.request",
  "me.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];

export interface Scope {
  /** Event the resource belongs to. Must equal the actor's event. */
  eventId?: string;
  /** For proposals: the domain it is routed to. */
  domain?: Domain;
  riskTier?: RiskTier;
  /** For a registration: the user who owns it, if any. */
  ownerUserId?: string | null;
}

const STAFF: Role[] = ["owner", "organizer"];
const CONSOLE_READERS: Role[] = ["owner", "organizer", "lead", "faculty_approver", "viewer"];
const CREW: Role[] = ["owner", "organizer", "lead", "volunteer"];

/** Domains whose lead can see money, sponsor and marketing views besides staff. */
const READ_DOMAIN: Partial<Record<Permission, Domain[]>> = {
  "finance.read": ["finance", "sponsorship", "post_event"],
  "sponsors.read": ["sponsorship", "finance", "marketing"],
  "marketing.read": ["marketing", "comms", "registrations"],
};

function isRole(role: Role, roles: Role[]): boolean {
  return roles.includes(role);
}

type UserActor = Extract<Actor, { kind: "user" }>;

function leadHas(actor: UserActor, domain: Domain | undefined): boolean {
  return actor.role === "lead" && !!domain && (actor.domains ?? []).includes(domain);
}

function userCan(actor: UserActor, permission: Permission, scope: Scope): boolean {
  const role = actor.role;
  switch (permission) {
    case "me.read":
      return true;

    case "event.read":
    case "proposal.read":
    case "agents.read":
    case "milestones.read":
    case "incidents.read":
    case "registration.list":
      return isRole(role, CONSOLE_READERS);

    case "finance.read":
    case "sponsors.read":
    case "marketing.read":
      if (isRole(role, [...STAFF, "viewer"])) return true;
      return role === "lead" && (actor.domains ?? []).some((d) => READ_DOMAIN[permission]!.includes(d));

    case "proposal.create":
      return isRole(role, STAFF) || role === "lead";

    case "proposal.approve":
    case "proposal.reject":
      if (isRole(role, STAFF)) return true;
      if (leadHas(actor, scope.domain)) return true;
      // Faculty approvers sign off official and irreversible actions, nothing else.
      return role === "faculty_approver" && scope.riskTier === "T3";

    case "proposal.edit":
    case "proposal.undo":
      return isRole(role, STAFF) || leadHas(actor, scope.domain);

    case "agents.command":
      return isRole(role, STAFF) || role === "lead";
    case "agents.kill_switch":
    case "event.manage":
      return isRole(role, STAFF);
    case "data.export_all":
      return role === "owner";

    case "registration.read":
      // Staff and registration leads see any record; everyone else only their own.
      if (isRole(role, STAFF) || leadHas(actor, "registrations")) return true;
      return !!scope.ownerUserId && scope.ownerUserId === actor.userId;

    case "registration.search":
    case "checkin.scan":
      return isRole(role, CREW);
    case "crew.self":
      return role === "volunteer" || isRole(role, STAFF);
    case "incident.report":
      return isRole(role, CREW);

    case "helpdesk.chat":
      return isRole(role, ["attendee", "volunteer", "speaker", "owner", "organizer", "lead"]);
    case "data.request":
      return isRole(role, ["attendee", "volunteer", "speaker"]);
  }
}

/** Agents read through services and write only by proposing. */
const AGENT_ALLOWED: Permission[] = [
  "event.read",
  "proposal.read",
  "agents.read",
  "registration.list",
  "finance.read",
  "sponsors.read",
  "marketing.read",
  "milestones.read",
  "incidents.read",
  "proposal.create",
];

export function can(actor: Actor, permission: Permission, scope: Scope = {}): boolean {
  if (actor.kind === "system") return !actor.eventId || !scope.eventId || actor.eventId === scope.eventId;
  if (scope.eventId && actor.eventId !== scope.eventId) return false;
  if (actor.kind === "agent") return AGENT_ALLOWED.includes(permission);
  return userCan(actor, permission, scope);
}
