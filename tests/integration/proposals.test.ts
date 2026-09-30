import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AgentActor, UserActor } from "@/contracts";
import { fixtures, HACKNOVA_NOW } from "@/contracts/fixtures";

type Mods = {
  client: typeof import("@/db/client");
  schema: typeof import("@/db/schema");
  seed: typeof import("@/db/seed");
  actions: typeof import("@/server/actions");
  time: typeof import("@/lib/time");
};
let m: Mods;
let owner: Sql;
const w = fixtures.eventFull();
const E = w.event.id;

const lab204 = w.rooms.find((r) => r.name === "Lab 204")!;
const auditorium = w.rooms.find((r) => r.name === "Main Auditorium")!;
const workshop = w.sessions.find((s) => s.roomId === lab204.id && s.registeredCount === 95)!;
const keynote2 = w.sessions.find((s) => s.title === "Keynote: Open source careers")!;

function userActor(persona: "owner" | "program_lead" | "comms_lead" | "faculty" | "viewer"): UserActor {
  const p = w.personas[persona]!;
  const mem = w.memberships.find((x) => x.userId === p.userId && x.eventId === E)!;
  return {
    kind: "user",
    userId: p.userId,
    orgId: w.org.id,
    eventId: E,
    role: mem.role,
    domains: mem.role === "lead" ? mem.domains : undefined,
  };
}
const agent = (a: AgentActor["agent"] = "scheduler", simulation = false): AgentActor => ({
  kind: "agent",
  agent: a,
  runId: "run-test",
  eventId: E,
  simulation,
});

let n = 0;
const key = () => `test-${Date.now()}-${n++}`;

async function wipeAndSeed() {
  const tables = await owner<
    { table_name: string }[]
  >`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
  await owner.unsafe(
    `truncate table ${tables.map((t) => `"${t.table_name}"`).join(", ")} restart identity cascade`,
  );
  await m.seed.seed(m.client.ownerDb(owner));
}

const eventsOfType = async (type: string) =>
  (await owner<{ n: number }[]>`select count(*)::int as n from domain_events where type = ${type}`)[0]!.n;

beforeAll(async () => {
  m = {
    client: await import("@/db/client"),
    schema: await import("@/db/schema"),
    seed: await import("@/db/seed"),
    actions: await import("@/server/actions"),
    time: await import("@/lib/time"),
  };
  owner = m.client.ownerSql();
  await migrate(m.client.ownerDb(owner), { migrationsFolder: "./src/db/migrations" });
  await wipeAndSeed();
  // Event time: 10:30 IST on day 1.
  m.time.setClockOffsetMs(new Date(HACKNOVA_NOW).getTime() - Date.now());
});

afterAll(async () => {
  m.time.setClockOffsetMs(0);
  await owner?.end({ timeout: 5 });
  await m?.client.sql.end({ timeout: 5 });
});

describe("propose", () => {
  it("rejects a payload that does not match its kind", async () => {
    const r = await m.actions.propose(agent(), {
      kind: "schedule.move_session",
      payload: { sessionId: workshop.id },
      summary: "x",
      rationale: "",
      idempotencyKey: key(),
    });
    expect(r.status).toBe("invalid");
  });

  it("rejects a session from another event", async () => {
    const other = fixtures.charityDrive().sessions[0]!;
    const r = await m.actions.propose(agent(), {
      kind: "schedule.cancel_session",
      payload: { sessionId: other.id, reason: "x" },
      summary: "x",
      rationale: "",
      idempotencyKey: key(),
    });
    expect(r.status).toBe("invalid");
  });

  it("computes impact itself and ignores an agent that understates it", async () => {
    const r = await m.actions.propose(agent(), {
      kind: "schedule.change_room",
      payload: { sessionId: workshop.id, newRoomId: auditorium.id },
      summary: "Move the workshop",
      rationale: "Overbooked",
      impact: { people: 0, attendees: 0, volunteers: 0, sessions: 0, channels: [], reversible: true },
      idempotencyKey: key(),
    });
    expect(r.status).toBe("created");
    if (r.status !== "created") return;
    expect(r.proposal.impact.attendees).toBe(95);
    expect(r.proposal.riskTier).toBe("T2");
    expect(r.proposal.status).toBe("pending");
    expect(r.proposal.domain).toBe("schedule");
  });

  it("returns the same proposal for the same idempotency key", async () => {
    const k = key();
    const input = {
      kind: "incident.create",
      payload: { title: "Mic dead", category: "av", severity: "low", source: "radar", description: "" },
      summary: "Mic",
      rationale: "",
      idempotencyKey: k,
    };
    const a = await m.actions.propose(agent("radar"), input);
    const b = await m.actions.propose(agent("radar"), input);
    expect(b.status).toBe("duplicate");
    if (a.status === "created" && b.status === "duplicate") expect(b.proposal.id).toBe(a.proposal.id);
  });

  it("never persists a what-if proposal", async () => {
    const before = (await owner<{ n: number }[]>`select count(*)::int as n from proposals`)[0]!.n;
    const r = await m.actions.propose(agent("scheduler", true), {
      kind: "schedule.cancel_session",
      payload: { sessionId: keynote2.id, reason: "what if" },
      summary: "Simulated",
      rationale: "",
      idempotencyKey: key(),
    });
    expect(r.status).toBe("simulated");
    if (r.status === "simulated") expect(r.riskTier).toBe("T3");
    expect((await owner<{ n: number }[]>`select count(*)::int as n from proposals`)[0]!.n).toBe(before);
  });

  it("executes T0 at once", async () => {
    const r = await m.actions.propose(agent("radar"), {
      kind: "incident.create",
      payload: {
        title: "Queue building",
        category: "queue",
        severity: "medium",
        source: "radar",
        description: "38 per 5 minutes",
      },
      summary: "Queue",
      rationale: "",
      idempotencyKey: key(),
    });
    expect(r.status === "created" && r.proposal.status).toBe("executed");
  });
});

describe("approve and execute: the Checkpoint 4 integration test", () => {
  it("agent proposes a move, the program lead approves, the session moves and session.updated is published", async () => {
    const newStart = "2026-10-24T09:30:00.000Z";
    const newEnd = "2026-10-24T11:00:00.000Z";
    const r = await m.actions.propose(agent(), {
      kind: "schedule.move_session",
      payload: { sessionId: workshop.id, newStartsAt: newStart, newEndsAt: newEnd, newRoomId: auditorium.id },
      summary: "Move the fine-tuning workshop to the auditorium after lunch",
      rationale: "Lab 204 has 60 seats for 95 people",
      idempotencyKey: key(),
    });
    expect(r.status).toBe("created");
    if (r.status !== "created") return;
    const updatedBefore = await eventsOfType("session.updated");
    const done = await m.actions.approve(userActor("program_lead"), r.proposal.id, r.proposal.diffHash);
    expect(done.status).toBe("executed");
    const [s] = await owner<
      { starts_at: Date; room_id: string; capacity: number; version: number }[]
    >`select starts_at, room_id, capacity, version from sessions where id = ${workshop.id}`;
    expect(new Date(s!.starts_at).toISOString()).toBe(newStart);
    expect(s!.room_id).toBe(auditorium.id);
    expect(s!.capacity).toBe(400);
    expect(await eventsOfType("session.updated")).toBe(updatedBefore + 1);
    const audit = await owner`select 1 from audit_log where proposal_id = ${r.proposal.id}`;
    expect(audit.length).toBeGreaterThan(0);
  });
});

describe("approval rules", () => {
  beforeEach(async () => {
    await wipeAndSeed();
  });

  async function pendingMove() {
    const r = await m.actions.propose(agent(), {
      kind: "schedule.change_room",
      payload: { sessionId: workshop.id, newRoomId: auditorium.id },
      summary: "Room change",
      rationale: "",
      idempotencyKey: key(),
    });
    if (r.status !== "created") throw new Error("expected created");
    return r.proposal;
  }

  it("a lead of another domain cannot approve", async () => {
    const p = await pendingMove();
    await expect(m.actions.approve(userActor("comms_lead"), p.id, p.diffHash)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("viewers cannot approve anything", async () => {
    const p = await pendingMove();
    await expect(m.actions.approve(userActor("viewer"), p.id, p.diffHash)).rejects.toMatchObject({
      status: 403,
    });
  });

  it("an approval must match the diff the approver saw", async () => {
    const p = await pendingMove();
    await expect(m.actions.approve(userActor("program_lead"), p.id, "not-the-hash")).rejects.toMatchObject({
      code: "stale",
    });
  });

  it("an expired proposal cannot be approved", async () => {
    const p = await pendingMove();
    await owner`update proposals set expires_at = now() - interval '1 minute' where id = ${p.id}`;
    await expect(m.actions.approve(userActor("program_lead"), p.id, p.diffHash)).rejects.toMatchObject({
      code: "expired",
    });
    expect(await m.actions.reject(userActor("owner"), p.id, "x").catch((e: unknown) => e)).toMatchObject({
      status: 409,
    });
  });

  it("marks a proposal stale when its row changed before execution", async () => {
    const p = await pendingMove();
    await owner`update sessions set version = version + 1 where id = ${workshop.id}`;
    const done = await m.actions.approve(userActor("program_lead"), p.id, p.diffHash);
    expect(done.status).toBe("stale");
    expect(await eventsOfType("proposal.stale")).toBe(1);
    const [s] = await owner<{ room_id: string }[]>`select room_id from sessions where id = ${workshop.id}`;
    expect(s!.room_id).toBe(lab204.id);
  });

  it("T3 needs two approvals, not the proposer, and faculty when the event says so", async () => {
    const body = "Official notice: submissions close at 10:00 IST on 25 October.";
    const r = await m.actions.propose(userActor("owner"), {
      kind: "comms.send_announcement",
      payload: {
        title: "Deadline",
        segment: { type: "all" },
        channels: ["in_app"],
        bodyByChannel: { in_app: body },
        category: "official",
      },
      summary: "Official deadline notice",
      rationale: "",
      idempotencyKey: key(),
    });
    if (r.status !== "created") throw new Error(JSON.stringify(r));
    const p = r.proposal;
    expect(p).toMatchObject({ riskTier: "T3", requiredApprovals: 2, facultyApprovalRequired: true });

    await expect(m.actions.approve(userActor("owner"), p.id, p.diffHash)).rejects.toMatchObject({
      status: 403,
    });
    const first = await m.actions.approve(userActor("comms_lead"), p.id, p.diffHash);
    expect(first.status).toBe("pending");
    expect(first.approvals).toHaveLength(1);
    await expect(m.actions.approve(userActor("comms_lead"), p.id, p.diffHash)).rejects.toMatchObject({
      status: 409,
    });

    const done = await m.actions.approve(userActor("faculty"), p.id, p.diffHash);
    expect(done.status).toBe("executed");
    const [ann] = await owner<
      { approved_by_role: string; recipient_count: number }[]
    >`select approved_by_role, recipient_count from announcements where proposal_id = ${p.id}`;
    expect(ann).toEqual({ approved_by_role: "faculty_approver", recipient_count: 320 });
  });

  it("without faculty among the approvals, the last approval is refused", async () => {
    const r = await m.actions.propose(agent("herald"), {
      kind: "comms.send_announcement",
      payload: {
        title: "Notice",
        segment: { type: "session", ref: workshop.id },
        channels: ["in_app"],
        bodyByChannel: { in_app: "Official room change" },
        category: "official",
      },
      summary: "Official room change",
      rationale: "",
      idempotencyKey: key(),
    });
    if (r.status !== "created") throw new Error("expected created");
    await m.actions.approve(userActor("comms_lead"), r.proposal.id, r.proposal.diffHash);
    const programLead = { ...userActor("program_lead"), domains: ["comms" as const] };
    await expect(m.actions.approve(programLead, r.proposal.id, r.proposal.diffHash)).rejects.toMatchObject({
      status: 403,
    });
  });
});

describe("undo", () => {
  beforeEach(async () => {
    await wipeAndSeed();
  });

  it("T1 runs at once with a 10 minute undo, and undo restores the row", async () => {
    const shift = w.shifts.find((s) => s.role === "Food Court lunch")!;
    const free = w.volunteers.find(
      (v) =>
        v.skills.includes("food") &&
        !w.shiftAssignments.some((a) => a.volunteerId === v.id && a.shiftId === shift.id),
    )!;
    const r = await m.actions.propose(agent("crew_chief"), {
      kind: "crew.assign_shift",
      payload: { shiftId: shift.id, volunteerId: free.id },
      summary: "Add a lunch helper",
      rationale: "",
      idempotencyKey: key(),
    });
    if (r.status !== "created") throw new Error("expected created");
    expect(r.proposal.status).toBe("executed");
    expect(r.proposal.undoUntil).toBeDefined();
    const count = async () =>
      (
        await owner`select 1 from shift_assignments where shift_id = ${shift.id} and volunteer_id = ${free.id}`
      ).length;
    expect(await count()).toBe(1);

    const u = await m.actions.undo(userActor("owner"), r.proposal.id);
    expect(u.status).toBe("undone");
    expect(await count()).toBe(0);
    expect(await eventsOfType("proposal.undone")).toBe(1);
  });

  it("refuses after the window closes", async () => {
    const shift = w.shifts.find((s) => s.role === "Food Court lunch")!;
    const free = w.volunteers.find(
      (v) =>
        v.skills.includes("food") &&
        !w.shiftAssignments.some((a) => a.volunteerId === v.id && a.shiftId === shift.id),
    )!;
    const r = await m.actions.propose(agent("crew_chief"), {
      kind: "crew.assign_shift",
      payload: { shiftId: shift.id, volunteerId: free.id },
      summary: "Add a lunch helper",
      rationale: "",
      idempotencyKey: key(),
    });
    if (r.status !== "created") throw new Error("expected created");
    await owner`update proposals set undo_until = now() - interval '1 second' where id = ${r.proposal.id}`;
    await expect(m.actions.undo(userActor("owner"), r.proposal.id)).rejects.toMatchObject({ status: 409 });
  });
});

describe("bundles", () => {
  beforeEach(async () => {
    await wipeAndSeed();
  });

  it("run every child or none", async () => {
    const r = await m.actions.propose(agent("commander"), {
      kind: "plan.bundle",
      payload: {
        title: "Keynote cancellation",
        children: [
          {
            kind: "schedule.change_room",
            payload: { sessionId: workshop.id, newRoomId: auditorium.id },
            summary: "Workshop to the auditorium",
            proposedBy: "scheduler",
          },
          {
            kind: "incident.create",
            payload: {
              title: "Keynote cancelled",
              category: "other",
              severity: "medium",
              source: "organizer",
              description: "",
            },
            summary: "Log it",
            proposedBy: "radar",
          },
        ],
      },
      summary: "Replan after the keynote cancellation",
      rationale: "",
      idempotencyKey: key(),
    });
    if (r.status !== "created") throw new Error(JSON.stringify(r));
    expect(r.proposal.riskTier).toBe("T2");
    // Make the second child fail at execution: remove the room it does not need, and break the first child instead.
    await owner`update sessions set version = version + 5 where id = ${workshop.id}`;
    const stale = await m.actions.approve(userActor("owner"), r.proposal.id, r.proposal.diffHash);
    expect(stale.status).toBe("stale");
    expect((await owner`select 1 from incidents where title = 'Keynote cancelled'`).length).toBe(0);
  });

  it("execute children in one go when all hold", async () => {
    const r = await m.actions.propose(agent("commander"), {
      kind: "plan.bundle",
      payload: {
        title: "Fix Lab 204",
        children: [
          {
            kind: "schedule.change_room",
            payload: { sessionId: workshop.id, newRoomId: auditorium.id },
            summary: "Workshop to the auditorium",
            proposedBy: "scheduler",
          },
          {
            kind: "crew.create_task",
            payload: { title: "Signage to the auditorium", skill: "crowd" },
            summary: "Signage",
            proposedBy: "crew_chief",
          },
        ],
      },
      summary: "Lab 204 fix",
      rationale: "",
      idempotencyKey: key(),
    });
    if (r.status !== "created") throw new Error(JSON.stringify(r));
    const done = await m.actions.approve(userActor("owner"), r.proposal.id, r.proposal.diffHash);
    expect(done.status).toBe("executed");
    const children = await owner<
      { status: string }[]
    >`select status from proposals where parent_id = ${r.proposal.id}`;
    expect(children.map((c) => c.status)).toEqual(["executed", "executed"]);
    expect((await owner`select 1 from tasks where title = 'Signage to the auditorium'`).length).toBe(1);
  });
});

describe("announcements: caps, dedupe and quiet hours", () => {
  beforeEach(async () => {
    await wipeAndSeed();
    m.time.setClockOffsetMs(new Date(HACKNOVA_NOW).getTime() - Date.now());
  });

  async function announce(body: string, category: "info" | "emergency" = "info") {
    const r = await m.actions.propose(userActor("owner"), {
      kind: "comms.send_announcement",
      payload: {
        title: "Update",
        segment: { type: "session", ref: workshop.id },
        channels: ["in_app", "email"],
        bodyByChannel: { in_app: body, email: body },
        category,
      },
      summary: "Update to the workshop",
      rationale: "",
      idempotencyKey: key(),
    });
    if (r.status !== "created") throw new Error(JSON.stringify(r));
    const first = await m.actions.approve(userActor("comms_lead"), r.proposal.id, r.proposal.diffHash);
    // Emergencies are T3: a second approval, from faculty on this event.
    return first.status === "pending"
      ? m.actions.approve(userActor("faculty"), r.proposal.id, r.proposal.diffHash)
      : first;
  }

  it("writes one outbox row per recipient per push channel, and in-app notifications", async () => {
    const p = await announce("Room change: the workshop is in the Main Auditorium.");
    expect(p.status).toBe("executed");
    const [o] = await owner<
      { n: number }[]
    >`select count(*)::int as n from outbox where proposal_id = ${p.id} and status = 'pending' and channel = 'email'`;
    expect(o!.n).toBe(95);
  });

  it("skips the same message to the same person within 24 hours", async () => {
    await announce("Same text twice");
    const second = await announce("Same text twice");
    const rows = await owner<{ status: string; error: string; n: number }[]>`
      select status, error, count(*)::int as n from outbox where proposal_id = ${second.id} and channel = 'email' group by status, error`;
    expect(rows).toEqual([{ status: "skipped", error: "duplicate_24h", n: 95 }]);
  });

  it("holds back messages over the hourly cap, except emergencies", async () => {
    for (let i = 0; i < 4; i++) await announce(`Update number ${i}`);
    const fifth = await announce("Update number 5");
    const [capped] = await owner<
      { n: number }[]
    >`select count(*)::int as n from outbox where proposal_id = ${fifth.id} and error = 'hourly_cap'`;
    expect(capped!.n).toBe(95);
    const urgent = await announce("Evacuate Block B now", "emergency");
    const [sent] = await owner<
      { n: number }[]
    >`select count(*)::int as n from outbox where proposal_id = ${urgent.id} and status = 'pending'`;
    expect(sent!.n).toBe(95);
  });

  it("defers messages sent in quiet hours to 07:00 IST", async () => {
    // 23:00 IST on day 1.
    m.time.setClockOffsetMs(new Date("2026-10-24T17:30:00.000Z").getTime() - Date.now());
    const p = await announce("Late night update");
    const [row] = await owner<
      { scheduled_for: Date }[]
    >`select scheduled_for from outbox where proposal_id = ${p.id} and channel = 'email' limit 1`;
    expect(new Date(row!.scheduled_for).toISOString()).toBe("2026-10-25T01:30:00.000Z");
    const urgent = await announce("Fire drill in Block A", "emergency");
    const [now] = await owner<
      { scheduled_for: Date }[]
    >`select scheduled_for from outbox where proposal_id = ${urgent.id} and channel = 'email' limit 1`;
    expect(new Date(now!.scheduled_for).getTime()).toBeLessThan(
      new Date("2026-10-25T00:00:00.000Z").getTime(),
    );
  });
});
