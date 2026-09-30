import { describe, expect, it } from "vitest";
import { Role, type Actor, type Domain } from "@/contracts";
import { PERMISSIONS, can, type Permission } from "@/server/authz/permissions";

const EVENT = "ev-1";
const user = (role: Role, domains?: Domain[], userId = `u-${role}`): Actor => ({
  kind: "user",
  userId,
  orgId: "org-1",
  eventId: EVENT,
  role,
  domains,
});

/**
 * The spec: which roles hold each permission with a neutral scope (same event, no owner,
 * no domain). Leads here have no domains; domain rules are tested separately below.
 */
const ALLOWED: Record<Permission, Role[]> = {
  "me.read": [...Role.options],
  "event.read": ["owner", "organizer", "lead", "faculty_approver", "viewer"],
  "proposal.read": ["owner", "organizer", "lead", "faculty_approver", "viewer"],
  "agents.read": ["owner", "organizer", "lead", "faculty_approver", "viewer"],
  "registration.list": ["owner", "organizer", "lead", "faculty_approver", "viewer"],
  "milestones.read": ["owner", "organizer", "lead", "faculty_approver", "viewer"],
  "incidents.read": ["owner", "organizer", "lead", "faculty_approver", "viewer"],
  "finance.read": ["owner", "organizer", "viewer"],
  "sponsors.read": ["owner", "organizer", "viewer"],
  "marketing.read": ["owner", "organizer", "viewer"],
  "proposal.create": ["owner", "organizer", "lead"],
  "proposal.approve": ["owner", "organizer"],
  "proposal.reject": ["owner", "organizer"],
  "proposal.edit": ["owner", "organizer"],
  "proposal.undo": ["owner", "organizer"],
  "agents.command": ["owner", "organizer", "lead"],
  "agents.kill_switch": ["owner", "organizer"],
  "event.manage": ["owner", "organizer"],
  "data.export_all": ["owner"],
  "registration.read": ["owner", "organizer"],
  "registration.search": ["owner", "organizer", "lead", "volunteer"],
  "checkin.scan": ["owner", "organizer", "lead", "volunteer"],
  "crew.self": ["owner", "organizer", "volunteer"],
  "incident.report": ["owner", "organizer", "lead", "volunteer"],
  "helpdesk.chat": ["owner", "organizer", "lead", "volunteer", "attendee", "speaker"],
  "data.request": ["volunteer", "attendee", "speaker"],
};

describe("permission matrix: every role against every permission", () => {
  it("covers every permission", () => {
    expect(Object.keys(ALLOWED).sort()).toEqual([...PERMISSIONS].sort());
  });

  for (const permission of PERMISSIONS) {
    for (const role of Role.options) {
      const expected = ALLOWED[permission].includes(role);
      it(`${role} ${expected ? "can" : "cannot"} ${permission}`, () => {
        expect(can(user(role), permission, { eventId: EVENT })).toBe(expected);
      });
    }
  }
});

describe("scope rules", () => {
  it("nobody acts on another event, whatever their role", () => {
    for (const role of Role.options) {
      for (const permission of PERMISSIONS) {
        expect(can(user(role), permission, { eventId: "other-event" }), `${role} ${permission}`).toBe(false);
      }
    }
  });

  it("an attendee reads only their own registration", () => {
    const sneha = user("attendee", undefined, "sneha");
    expect(can(sneha, "registration.read", { eventId: EVENT, ownerUserId: "sneha" })).toBe(true);
    expect(can(sneha, "registration.read", { eventId: EVENT, ownerUserId: "someone-else" })).toBe(false);
    expect(can(sneha, "registration.read", { eventId: EVENT, ownerUserId: null })).toBe(false);
  });

  it("a volunteer or viewer cannot read another person's full registration", () => {
    for (const role of ["volunteer", "viewer", "speaker", "sponsor", "faculty_approver"] as Role[]) {
      expect(can(user(role), "registration.read", { eventId: EVENT, ownerUserId: "sneha" }), role).toBe(
        false,
      );
    }
  });

  it("the registrations lead reads any registration", () => {
    expect(
      can(user("lead", ["registrations"]), "registration.read", { eventId: EVENT, ownerUserId: "sneha" }),
    ).toBe(true);
    expect(
      can(user("lead", ["schedule"]), "registration.read", { eventId: EVENT, ownerUserId: "sneha" }),
    ).toBe(false);
  });

  it("leads approve, edit and undo only in their own domains", () => {
    const programLead = user("lead", ["schedule", "speakers"]);
    for (const p of ["proposal.approve", "proposal.reject", "proposal.edit", "proposal.undo"] as const) {
      expect(can(programLead, p, { eventId: EVENT, domain: "schedule", riskTier: "T2" }), p).toBe(true);
      expect(can(programLead, p, { eventId: EVENT, domain: "finance", riskTier: "T2" }), p).toBe(false);
    }
  });

  it("faculty approvers sign off T3 only", () => {
    const rao = user("faculty_approver");
    expect(can(rao, "proposal.approve", { eventId: EVENT, domain: "comms", riskTier: "T3" })).toBe(true);
    expect(can(rao, "proposal.approve", { eventId: EVENT, domain: "comms", riskTier: "T2" })).toBe(false);
    expect(can(rao, "proposal.edit", { eventId: EVENT, domain: "comms", riskTier: "T3" })).toBe(false);
  });

  it("leads see money views only through a related domain", () => {
    expect(can(user("lead", ["finance"]), "finance.read", { eventId: EVENT })).toBe(true);
    expect(can(user("lead", ["comms"]), "finance.read", { eventId: EVENT })).toBe(false);
    expect(can(user("lead", ["comms"]), "marketing.read", { eventId: EVENT })).toBe(true);
  });

  it("viewers are read-only everywhere", () => {
    const judge = user("viewer");
    const writes = PERMISSIONS.filter((p) => !p.endsWith(".read") && p !== "registration.list");
    for (const p of writes)
      expect(can(judge, p, { eventId: EVENT, domain: "schedule", riskTier: "T3" }), p).toBe(false);
  });
});

describe("agents and the system", () => {
  const agent: Actor = { kind: "agent", agent: "scheduler", runId: "r1", eventId: EVENT };

  it("agents read and propose, never approve or act on people", () => {
    expect(can(agent, "proposal.create", { eventId: EVENT })).toBe(true);
    expect(can(agent, "event.read", { eventId: EVENT })).toBe(true);
    for (const p of [
      "proposal.approve",
      "proposal.edit",
      "agents.kill_switch",
      "registration.read",
      "checkin.scan",
      "data.export_all",
    ] as const) {
      expect(can(agent, p, { eventId: EVENT, riskTier: "T0" }), p).toBe(false);
    }
  });

  it("agents stay inside their event", () => {
    expect(can(agent, "event.read", { eventId: "other" })).toBe(false);
  });

  it("the system actor can act, but not across events when bound to one", () => {
    expect(can({ kind: "system" }, "proposal.approve", { eventId: EVENT })).toBe(true);
    expect(can({ kind: "system", eventId: EVENT }, "event.manage", { eventId: "other" })).toBe(false);
  });
});
