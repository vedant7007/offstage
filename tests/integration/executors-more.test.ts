import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ActionKind, AgentActor, UserActor } from "@/contracts";
import { fixtures, HACKNOVA_NOW } from "@/contracts/fixtures";

type Mods = {
  client: typeof import("@/db/client");
  seed: typeof import("@/db/seed");
  actions: typeof import("@/server/actions");
  time: typeof import("@/lib/time");
};
let m: Mods;
let owner: Sql;
const w = fixtures.eventFull();
const E = w.event.id;

const ownerActor = (): UserActor => {
  const p = w.personas.owner!;
  const mem = w.memberships.find((x) => x.userId === p.userId && x.eventId === E)!;
  return { kind: "user", userId: p.userId, orgId: w.org.id, eventId: E, role: mem.role };
};
const agent = (a: AgentActor["agent"]): AgentActor => ({
  kind: "agent",
  agent: a,
  runId: "run-test",
  eventId: E,
  simulation: false,
});

let n = 0;
const key = () => `exec-more-${Date.now()}-${n++}`;

/** Propose as an agent and approve as the owner when policy holds it; returns the proposal id. */
async function run(a: AgentActor["agent"], kind: ActionKind, payload: unknown): Promise<string> {
  const r = await m.actions.propose(agent(a), {
    kind,
    payload,
    summary: kind,
    rationale: "",
    idempotencyKey: key(),
  });
  if (r.status !== "created") throw new Error(`${kind}: ${JSON.stringify(r)}`);
  let status = r.proposal.status;
  if (status === "pending")
    status = (await m.actions.approve(ownerActor(), r.proposal.id, r.proposal.diffHash)).status;
  if (status !== "executed") {
    const [row] = await owner<
      { error: string | null }[]
    >`select error from proposals where id = ${r.proposal.id}`;
    throw new Error(`${kind} ended ${status}: ${row?.error}`);
  }
  return r.proposal.id;
}

const one = async <T>(q: Promise<T[]>) => (await q)[0]!;

beforeAll(async () => {
  m = {
    client: await import("@/db/client"),
    seed: await import("@/db/seed"),
    actions: await import("@/server/actions"),
    time: await import("@/lib/time"),
  };
  owner = m.client.ownerSql();
  await migrate(m.client.ownerDb(owner), { migrationsFolder: "./src/db/migrations" });
  const tables = await owner<
    { table_name: string }[]
  >`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
  await owner.unsafe(
    `truncate table ${tables.map((t) => `"${t.table_name}"`).join(", ")} restart identity cascade`,
  );
  await m.seed.seed(m.client.ownerDb(owner));
  m.time.setClockOffsetMs(new Date(HACKNOVA_NOW).getTime() - Date.now());
});

afterAll(async () => {
  m.time.setClockOffsetMs(0);
  await owner?.end({ timeout: 5 });
  await m?.client.sql.end({ timeout: 5 });
});

describe("planning executors", () => {
  it("creates a milestone and updates it to done", async () => {
    await run("planner", "plan.milestone.create", {
      title: "Print certificates",
      domain: "planning",
      dueOn: "2026-10-26",
      ownerRole: "lead",
    });
    const ms = await one(
      owner<{ id: string }[]>`select id from milestones where title = 'Print certificates'`,
    );
    await run("planner", "plan.milestone.update", { milestoneId: ms.id, status: "done" });
    const after = await one(
      owner<
        { status: string; completed_at: Date | null }[]
      >`select status, completed_at from milestones where id = ${ms.id}`,
    );
    expect(after.status).toBe("done");
    expect(after.completed_at).not.toBeNull();
  });

  it("stores a report built from SQL counts as a staff-only document", async () => {
    await run("chronicler", "report.generate", { kind: "final" });
    const doc = await one(
      owner<
        { content: string; public: boolean; status: string }[]
      >`select content, public, status from kb_documents where title like 'Final report%'`,
    );
    const confirmed = await one(
      owner<
        { n: number }[]
      >`select count(*)::int as n from registrations where event_id = ${E} and status = 'confirmed'`,
    );
    expect(doc.public).toBe(false);
    expect(doc.status).toBe("ready");
    expect(doc.content).toContain(`- confirmed: ${confirmed.n}`);
  });

  it("adds a playbook lesson for the org", async () => {
    await run("chronicler", "playbook.add_lesson", {
      eventType: w.event.type,
      title: "Order Jain meals separately",
      lesson: "Label and count them apart from veg.",
    });
    const l = await one(
      owner<
        { org_id: string; source_event_id: string }[]
      >`select org_id, source_event_id from playbook_lessons where title = 'Order Jain meals separately'`,
    );
    expect(l).toEqual({ org_id: w.org.id, source_event_id: E });
  });
});

describe("sponsor and marketing executors", () => {
  const sponsor = w.sponsorProspects[0]!;

  it("stores an outreach draft without sending it", async () => {
    await run("sponsorship", "sponsor.outreach.draft", {
      prospectId: sponsor.id,
      subject: "Partner with HackNova",
      body: "Hello, ...",
    });
    const tp = await one(
      owner<
        { draft_body: string }[]
      >`select draft_body from sponsor_touchpoints where prospect_id = ${sponsor.id} and draft_body is not null`,
    );
    expect(tp.draft_body).toBe("Hello, ...");
  });

  it("schedules a follow-up and records a deliverable", async () => {
    await run("sponsorship", "sponsor.followup.schedule", {
      prospectId: sponsor.id,
      dueAt: "2026-10-28T05:00:00.000Z",
      note: "Chase the logo files",
    });
    const s = await one(
      owner<
        { next_follow_up_at: Date }[]
      >`select next_follow_up_at from sponsor_prospects where id = ${sponsor.id}`,
    );
    expect(new Date(s.next_follow_up_at).toISOString()).toBe("2026-10-28T05:00:00.000Z");
    await run("sponsorship", "sponsor.deliverable.update", {
      prospectId: sponsor.id,
      title: "Logo on the stage banner",
      status: "done",
    });
    const d = await one(
      owner<
        { status: string }[]
      >`select status from sponsor_deliverables where prospect_id = ${sponsor.id} and title = 'Logo on the stage banner'`,
    );
    expect(d.status).toBe("done");
  });

  it("drafts a post, sets the calendar and files push suggestions as tasks", async () => {
    await run("marketing", "marketing.post.draft", { platform: "linkedin", body: "Day 2 starts now" });
    const post = await one(
      owner<
        { id: string; status: string }[]
      >`select id, status from marketing_posts where body = 'Day 2 starts now'`,
    );
    expect(post.status).toBe("draft");
    await run("marketing", "marketing.calendar.set", {
      entries: [
        { date: "2026-10-25", platform: "linkedin", theme: "x", postId: post.id },
        { date: "2026-10-26", platform: "instagram", theme: "Winners reel" },
      ],
    });
    const moved = await one(
      owner<{ scheduled_for: Date }[]>`select scheduled_for from marketing_posts where id = ${post.id}`,
    );
    expect(new Date(moved.scheduled_for).toISOString()).toBe("2026-10-24T18:30:00.000Z");
    expect((await owner`select 1 from marketing_posts where body = 'Winners reel'`).length).toBe(1);
    await run("marketing", "marketing.push.suggest", {
      target: 400,
      actual: 320,
      suggestions: [{ action: "Class visits in ECE", segment: "2nd year ECE", reason: "Lowest share" }],
    });
    expect(
      (await owner`select 1 from tasks where title = 'Class visits in ECE' and status = 'open'`).length,
    ).toBe(1);
  });
});

describe("speaker executors", () => {
  const session = w.sessions.find((s) => s.speakerIds.length > 0)!;
  const speakerId = session.speakerIds[0]!;
  const other = w.speakers.find((s) => !s.sessionIds.includes(session.id))!;

  it("confirms a speaker and links them to a session, and undo reverts both", async () => {
    const id = await run("speaker_liaison", "speaker.confirm", {
      speakerId: other.id,
      sessionId: session.id,
      status: "declined",
    });
    const linked = () =>
      owner`select 1 from session_speakers where session_id = ${session.id} and speaker_id = ${other.id}`;
    expect((await linked()).length).toBe(1);
    expect(await m.actions.undo(ownerActor(), id)).toMatchObject({ status: "undone" });
    expect((await linked()).length).toBe(0);
    const s = await one(owner<{ status: string }[]>`select status from speakers where id = ${other.id}`);
    expect(s.status).toBe(other.status);
  });

  it("records requirements and checks a reminder slot", async () => {
    await run("speaker_liaison", "speaker.requirement.record", { speakerId, av: ["clicker"], travel: "Cab" });
    const r = await one(
      owner<
        { av: string[]; travel: string }[]
      >`select av, travel from speaker_requirements where speaker_id = ${speakerId}`,
    );
    expect(r).toEqual({ av: ["clicker"], travel: "Cab" });
    await run("speaker_liaison", "speaker.reminder.schedule", {
      speakerId,
      sessionId: session.id,
      offsetsMinutes: [30],
      channels: ["email"],
    });
    const bad = await m.actions.propose(agent("speaker_liaison"), {
      kind: "speaker.reminder.schedule",
      payload: { speakerId: other.id, sessionId: session.id, offsetsMinutes: [30], channels: ["email"] },
      summary: "x",
      rationale: "",
      idempotencyKey: key(),
    });
    expect(bad.status === "created" && bad.proposal.status).toBe("failed");
  });
});

describe("logistics executors", () => {
  const catering = w.checklists.find((c) => c.scope.type === "vendor")!;

  it("updates a checklist item and adds a new one", async () => {
    await run("logistics", "logistics.checklist.update", {
      checklistId: catering.id,
      scope: catering.scope,
      items: [
        { itemId: catering.items[0]!.id, label: catering.items[0]!.label, status: "done" },
        { label: "Extra water at the counter", status: "todo" },
      ],
    });
    const items = await owner<
      { label: string; status: string }[]
    >`select label, status from checklist_items where checklist_id = ${catering.id} order by label`;
    expect(items).toContainEqual({ label: catering.items[0]!.label, status: "done" });
    expect(items).toContainEqual({ label: "Extra water at the counter", status: "todo" });
  });

  it("changes inventory by delta and refuses to go below zero", async () => {
    const badges = w.inventory.find((i) => i.name === "Badges")!;
    await run("logistics", "logistics.inventory.update", { itemId: badges.id, name: "Badges", delta: -10 });
    const b = await one(
      owner<{ count: number }[]>`select count from inventory_items where id = ${badges.id}`,
    );
    expect(b.count).toBe(badges.count - 10);
    const r = await m.actions.propose(agent("logistics"), {
      kind: "logistics.inventory.update",
      payload: { itemId: badges.id, name: "Badges", delta: -10_000 },
      summary: "x",
      rationale: "",
      idempotencyKey: key(),
    });
    expect(r.status === "created" && r.proposal.status).toBe("failed");
  });

  it("sets food counts as meal items, and undo removes them", async () => {
    const id = await run("logistics", "logistics.food_count.set", {
      date: "2026-10-25",
      meal: "lunch",
      counts: { veg: 200, nonVeg: 120, vegan: 5, jain: 12, other: 0 },
      basis: "confirmed x 0.9",
    });
    const rows = await owner<
      { name: string; count: number }[]
    >`select name, count from inventory_items where name like 'lunch 2026-10-25%' order by name`;
    expect(rows).toContainEqual({ name: "lunch 2026-10-25 veg", count: 200 });
    expect(rows).toHaveLength(5);
    await m.actions.undo(ownerActor(), id);
    expect((await owner`select 1 from inventory_items where name like 'lunch 2026-10-25%'`).length).toBe(0);
  });
});
