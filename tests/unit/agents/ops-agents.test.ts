import { describe, expect, it } from "vitest";
import type { Checklist, Incident, Milestone, RegistrationSummary, Session } from "@/contracts";
import { ActionPayloads } from "@/contracts";
import { fixtures, type EventWorld } from "@/contracts/fixtures";
import { worldServices } from "@/agents/runtime/services";
import type { AgentConfig, AgentProposal, RunContext } from "@/agents/runtime/types";
import type { ReadServices } from "@/agents/runtime/services";
import { duplicates, toPromote } from "@/agents/registrar/logic";
import { milestoneRisks } from "@/agents/planner/logic";
import { dueFollowUps } from "@/agents/sponsorship/config";
import { latestGap, underRepresented } from "@/agents/marketing/logic";
import { pendingRequirements } from "@/agents/speaker-liaison/logic";
import { foodCounts, moveItems, sameCounts, withItems } from "@/agents/logistics/logic";
import { lessonIncidents, minutesToResolve, reportFacts } from "@/agents/chronicler/logic";
import { registrar } from "@/agents/registrar/config";
import { planner } from "@/agents/planner/config";
import { sponsorship } from "@/agents/sponsorship/config";
import { marketing } from "@/agents/marketing/config";
import { speakerLiaison } from "@/agents/speaker-liaison/config";
import { logistics } from "@/agents/logistics/config";
import { chronicler } from "@/agents/chronicler/config";

const reg = (id: string, o: Partial<RegistrationSummary> = {}): RegistrationSummary => ({
  id,
  name: "Sneha Reddy",
  college: "Deccan Institute",
  department: "CSE",
  year: 3,
  section: "A",
  emailMasked: "s***@x.in",
  status: "confirmed",
  ...o,
});

/** Runs an agent's rules-only path over a world and checks every payload against its contract. */
async function run(
  config: AgentConfig<ReadServices>,
  world: EventWorld,
  trigger: RunContext<ReadServices>["trigger"] = { type: "schedule", ref: "tick" },
  payload: unknown = {},
): Promise<AgentProposal[]> {
  const ctx = {
    eventId: world.event.id,
    actor: { kind: "agent", agent: config.name, runId: "run-1", eventId: world.event.id },
    trigger,
    payload,
    untrusted: false,
    services: worldServices(world),
    simulation: true,
    propose: async () => ({ status: "invalid", issues: [] }),
  } as RunContext<ReadServices>;
  const out = await config.fallback(ctx);
  for (const p of out) {
    expect(config.actions).toContain(p.kind);
    expect(() => ActionPayloads[p.kind].parse(p.payload)).not.toThrow();
    expect(p.dedupeKey).toBeTruthy();
    expect(p.summary.length).toBeLessThanOrEqual(120);
  }
  // Same world, same proposals: re-runs are idempotent.
  expect((await config.fallback(ctx)).map((p) => p.dedupeKey)).toEqual(out.map((p) => p.dedupeKey));
  return out;
}

describe("Registrar", () => {
  it("flags the later of two identical name, college, department and year rows", () => {
    const regs = [
      reg("a"),
      reg("b", { name: "sneha  REDDY." }),
      reg("c", { year: 2 }),
      reg("d", { status: "cancelled" }),
    ];
    expect(duplicates(regs)).toEqual([{ registrationId: "b", duplicateOfId: "a" }]);
    expect(duplicates(regs, "a")).toEqual([]);
  });

  it("promotes only into free seats, in waitlist order", () => {
    const regs = [reg("a"), reg("w1", { status: "waitlisted" }), reg("w2", { status: "waitlisted" })];
    expect(toPromote(regs, 2)).toEqual(["w1"]);
    expect(toPromote(regs, 1)).toEqual([]);
  });

  it("fills seats freed by cancellations in the fixture world", async () => {
    const w = fixtures.eventFull();
    const confirmed = w.registrations.filter((r) => r.status === "confirmed");
    for (const r of confirmed.slice(0, 3)) r.status = "cancelled";
    const out = await run(registrar, w);
    const promote = out.find((p) => p.kind === "registration.promote_waitlist")!;
    const waitlist = w.registrations.filter((r) => r.status === "waitlisted").map((r) => r.id);
    expect(promote.payload).toEqual({ registrationIds: waitlist.slice(0, 3) });
  });

  it("flags server-matched suspects from the registration event", async () => {
    const w = fixtures.eventFull();
    const [a, b] = w.registrations;
    const out = await run(
      registrar,
      w,
      { type: "domain_event", eventType: "registration.created", ref: "de-1" },
      { registrationId: b!.id, duplicateSuspects: [{ registrationId: a!.id, matchType: "email" }] },
    );
    expect(out[0]).toMatchObject({
      kind: "registration.flag_duplicate",
      payload: { registrationId: b!.id, duplicateOfId: a!.id, matchType: "email" },
    });
  });
});

describe("Planner", () => {
  const m = (id: string, dueOn: string, status: Milestone["status"], critical = false) =>
    ({ id, title: id, dueOn, status, critical, domain: "planning", ownerRole: "lead" }) as Milestone;

  it("finds overdue and at-risk milestones by IST date", () => {
    const r = milestoneRisks(
      [
        m("late", "2026-10-22", "in_progress"),
        m("soon", "2026-10-26", "not_started"),
        m("later", "2026-10-30", "not_started"),
        m("stuck", "2026-11-10", "blocked"),
        m("done", "2026-10-01", "done"),
      ],
      "2026-10-24",
    );
    expect(r.map((x) => [x.milestone.id, x.state, x.days])).toEqual([
      ["late", "overdue", 2],
      ["soon", "at_risk", 2],
      ["stuck", "at_risk", 17],
    ]);
  });

  it("raises an incident only for critical overdue milestones", async () => {
    const out = await run(planner, fixtures.eventFull());
    const incidents = out.filter((p) => p.kind === "incident.create");
    expect(incidents).toHaveLength(1);
    expect(incidents[0]!.summary).toContain("Send final food count to caterer");
    expect(out.filter((p) => p.kind === "plan.milestone.update").length).toBeGreaterThanOrEqual(2);
  });
});

describe("Sponsorship", () => {
  it("drafts follow-ups only for open prospects that are due", async () => {
    const w = fixtures.eventFull();
    const due = dueFollowUps(w.sponsorProspects, w.now).map((p) => p.name);
    expect(due).toEqual(["Tessel Robotics", "Orbit Payments"]);
    const out = await run(sponsorship, w);
    expect(out).toHaveLength(2);
    const body = (out[0]!.payload as { body: string }).body;
    expect(body).toMatch(/^Hi |^Hello /);
    expect(body).not.toContain(String.fromCharCode(0x2014));
  });
});

describe("Marketing", () => {
  it("measures the latest gap and finds thin groups", () => {
    expect(latestGap([])).toBeNull();
    expect(
      latestGap([
        { date: "2026-10-02", registrations: 60, target: 100 },
        { date: "2026-10-01", registrations: 10, target: 10 },
      ])!.behind,
    ).toBeCloseTo(0.4);
    const regs = [
      ...Array.from({ length: 6 }, (_, i) => reg(`a${i}`, { college: "Big" })),
      reg("b", { college: "Small" }),
      reg("c", { college: "Small", status: "cancelled" }),
      reg("d", { college: "Mid" }),
      reg("e", { college: "Mid" }),
    ];
    expect(underRepresented(regs, "college").map((g) => [g.name, g.count])).toEqual([
      ["Small", 1],
      ["Mid", 2],
    ]);
  });

  it("suggests a push and a post when 20% or more behind", async () => {
    const w = fixtures.eventFull();
    w.now = "2026-10-23T06:00:00.000Z";
    const out = await run(marketing, w);
    expect(out.map((p) => p.kind)).toEqual(["marketing.push.suggest", "marketing.post.draft"]);
    expect(out[0]!.payload).toMatchObject({ target: 500, actual: 320 });
    const last = w.funnel.at(-1)!;
    last.registrations = last.target;
    expect(await run(marketing, w)).toEqual([]);
  });
});

describe("Speaker Liaison", () => {
  const s = (id: string, startsAt: string, status: Session["status"] = "scheduled") =>
    ({ id, startsAt, status }) as Session;
  const sp = (id: string, sessionIds: string[], o = {}) => ({
    id,
    name: id,
    status: "confirmed",
    sessionIds,
    requirementsSubmitted: false,
    ...o,
  });

  it("reminds confirmed speakers without requirements, only for sessions within 48 hours", () => {
    const now = "2026-10-24T00:00:00.000Z";
    const sessions = [
      s("soon", "2026-10-24T03:00:00.000Z"),
      s("far", "2026-10-27T03:00:00.000Z"),
      s("gone", "2026-10-24T03:00:00.000Z", "cancelled"),
      s("tomorrow", "2026-10-25T06:00:00.000Z"),
    ];
    const r = pendingRequirements(
      [
        sp("a", ["soon", "far", "gone"]),
        sp("b", ["tomorrow"]),
        sp("c", ["soon"], { requirementsSubmitted: true }),
        sp("d", ["soon"], { status: "tentative" }),
      ],
      sessions,
      now,
    );
    expect(r.map((x) => [x.speaker.id, x.session.id, x.offsetsMinutes])).toEqual([
      ["a", "soon", [120, 30]],
      ["b", "tomorrow", [1440, 120, 30]],
    ]);
  });

  it("schedules reminders for the fixture speakers who have not sent requirements", async () => {
    const out = await run(speakerLiaison, fixtures.eventFull());
    expect(out.map((p) => p.summary)).toEqual(
      expect.arrayContaining([expect.stringContaining("Rahul Verma"), expect.stringContaining("Imran Khan")]),
    );
  });
});

describe("Logistics", () => {
  it("counts plates by food preference and compares counts", () => {
    const c = foodCounts(["veg", "non_veg", "veg", "jain", "none", "vegan"]);
    expect(c).toEqual({ veg: 2, nonVeg: 1, vegan: 1, jain: 1, other: 1 });
    expect(sameCounts(c, { ...c })).toBe(true);
    expect(sameCounts(c, { ...c, veg: 3 })).toBe(false);
  });

  it("keeps existing checklist items and skips a move already handled", () => {
    const list = {
      id: "cl",
      items: [{ id: "i1", label: "Mic tested", status: "done" }],
    } as Checklist;
    const items = moveItems(
      { title: "Talk", registeredCount: 90 } as Session,
      { name: "Lab 101", capacity: 80 },
      "2:00 PM",
    );
    const merged = withItems(list, items.newRoom)!;
    expect(merged[0]).toEqual({ itemId: "i1", label: "Mic tested", status: "done" });
    expect(merged).toHaveLength(3);
    expect(merged[2]!.notes).toContain("90 registered");
    expect(
      withItems(
        { ...list, items: merged.map((i, n) => ({ ...i, id: `x${n}` })) } as Checklist,
        items.newRoom,
      ),
    ).toBeNull();
  });

  it("updates both rooms' checklists when a session moves", async () => {
    const w = fixtures.eventFull();
    const s = w.sessions.find((x) => x.status === "scheduled")!;
    const to = w.rooms.find((r) => r.id !== s.roomId)!;
    const out = await run(
      logistics,
      w,
      { type: "domain_event", eventType: "session.updated", ref: "de-2" },
      {
        sessionId: s.id,
        before: { startsAt: s.startsAt, endsAt: s.endsAt, roomId: s.roomId },
        after: { startsAt: s.startsAt, endsAt: s.endsAt, roomId: to.id },
      },
    );
    expect(out.map((p) => (p.payload as { scope: { ref: string } }).scope.ref)).toEqual([to.id, s.roomId]);
    const same = { startsAt: s.startsAt, endsAt: s.endsAt, roomId: s.roomId };
    expect(
      await run(
        logistics,
        w,
        { type: "domain_event", eventType: "session.updated", ref: "de-3" },
        {
          sessionId: s.id,
          before: same,
          after: same,
        },
      ),
    ).toEqual([]);
  });
});

describe("Chronicler", () => {
  it("counts the report numbers in code", () => {
    const w = fixtures.eventFull();
    const f = reportFacts({
      registrations: [reg("a"), reg("b"), reg("c", { status: "waitlisted" })],
      checkins: [
        { registrationId: "a", duplicate: false },
        { registrationId: "a", duplicate: true },
      ] as never,
      sessions: w.sessions,
      incidents: w.incidents,
      helpdeskQuestions: 7,
      volunteers: [
        { active: true, hoursServed: 2.5 },
        { active: false, hoursServed: 9 },
      ] as never,
      ledger: [
        { type: "income", status: "received", amountInr: 50_000 },
        { type: "income", status: "due", amountInr: 9_000 },
        { type: "expense", status: "paid", amountInr: 12_000 },
        { type: "expense", status: "committed", amountInr: 3_000 },
      ] as never,
    });
    expect(f).toMatchObject({
      confirmed: 2,
      attended: 1,
      volunteers: 1,
      volunteerHours: 2.5,
      moneyInInr: 50_000,
      moneyOutInr: 15_000,
      incidents: 2,
      incidentsResolved: 1,
    });
  });

  it("turns resolved non-emergency incidents into lessons", () => {
    const i = (id: string, o: Partial<Incident>) =>
      ({ id, status: "resolved", emergency: false, createdAt: "2026-10-24T03:00:00.000Z", ...o }) as Incident;
    const list = [
      i("open", { status: "open" }),
      i("fire", { emergency: true }),
      i("wifi", { resolvedAt: "2026-10-24T03:35:00.000Z" }),
    ];
    expect(lessonIncidents(list).map((x) => x.id)).toEqual(["wifi"]);
    expect(minutesToResolve(list[2]!)).toBe(35);
  });

  it("waits for the event to end on the schedule, answers a command any time", async () => {
    const w = fixtures.eventFull();
    expect(await run(chronicler, w)).toEqual([]);
    const out = await run(chronicler, w, { type: "command", ref: "cmd-1" });
    expect(out.map((p) => p.kind)).toEqual(["report.generate", "playbook.add_lesson"]);
    expect(out[0]!.rationale).toContain("checked in");
  });
});
