import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentActor, UserActor } from "@/contracts";
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
const LEAD_ROLES = ["owner", "organizer", "lead", "faculty_approver"];

const ownerActor = (): UserActor => {
  const p = w.personas.owner!;
  const mem = w.memberships.find((x) => x.userId === p.userId && x.eventId === E)!;
  return { kind: "user", userId: p.userId, orgId: w.org.id, eventId: E, role: mem.role };
};
const radar: AgentActor = { kind: "agent", agent: "radar", runId: "run-test", eventId: E, simulation: false };

let n = 0;
/** Radar reports an incident; approved by the owner if policy holds it. Returns the incident id. */
async function report(category: string, title: string): Promise<string> {
  const r = await m.actions.propose(radar, {
    kind: "incident.create",
    payload: { title, category, severity: "high", source: "radar", description: "test" },
    summary: title,
    rationale: "",
    idempotencyKey: `emergency-${Date.now()}-${n++}`,
  });
  if (r.status !== "created") throw new Error(JSON.stringify(r));
  let status = r.proposal.status;
  if (status === "pending")
    status = (await m.actions.approve(ownerActor(), r.proposal.id, r.proposal.diffHash)).status;
  expect(status).toBe("executed");
  const [row] = await owner<{ id: string }[]>`select id from incidents where title = ${title}`;
  return row!.id;
}

const notified = (title: string) =>
  owner<
    { userId: string; category: string; body: string }[]
  >`select user_id as "userId", category, body from notifications where event_id = ${E} and title = ${`Emergency: ${title}`}`;

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

describe("emergency incidents alert every lead", () => {
  it("a medical incident notifies each owner, organizer, lead and faculty approver, nobody else", async () => {
    const members = await owner<
      { userId: string; role: string }[]
    >`select user_id as "userId", role from memberships where event_id = ${E}`;
    const leads = members.filter((x) => LEAD_ROLES.includes(x.role)).map((x) => x.userId);
    const others = members.filter((x) => !LEAD_ROLES.includes(x.role)).map((x) => x.userId);
    expect(leads.length).toBeGreaterThan(0);
    expect(others.some((u) => members.find((x) => x.userId === u)?.role === "volunteer")).toBe(true);

    await report("medical", "Attendee fainted near the stage");
    const rows = await notified("Attendee fainted near the stage");
    expect(rows.map((r) => r.userId).sort()).toEqual([...leads].sort());
    expect(rows.every((r) => r.category === "emergency")).toBe(true);
    expect(rows[0]!.body).toContain("Agents do not act on emergencies. Respond now.");
    expect(rows[0]!.body).not.toMatch(/—/);
    expect(rows.some((r) => others.includes(r.userId))).toBe(false);
  });

  it("also queues the alert on the leads' other channels, never deferred", async () => {
    const rows = await owner<{ channel: string; status: string }[]>`
      select channel, status from outbox
      where event_id = ${E} and subject = ${"Emergency: Attendee fainted near the stage"}`;
    expect(rows.map((r) => r.channel)).toContain("email");
    expect(rows.filter((r) => r.channel === "email").every((r) => r.status === "pending")).toBe(true);
  });

  it("a non-emergency av incident notifies nobody", async () => {
    await report("av", "Projector flickering in hall B");
    expect(await notified("Projector flickering in hall B")).toHaveLength(0);
    const [c] = await owner<
      { n: number }[]
    >`select count(*)::int as n from notifications where category = 'emergency' and title like 'Emergency: Projector%'`;
    expect(c!.n).toBe(0);
  });
});
