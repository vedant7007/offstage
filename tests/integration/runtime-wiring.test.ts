import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AgentActor } from "@/contracts";
import { fixtures } from "@/contracts/fixtures";

type Mods = {
  client: typeof import("@/db/client");
  seed: typeof import("@/db/seed");
  world: typeof import("@/server/services/world");
  rt: typeof import("@/server/services/agent-runtime");
  events: typeof import("../../worker/jobs/events");
};
let m: Mods;
let owner: Sql;
const fx = fixtures.eventFull();
const E = fx.event.id;
const agent: AgentActor = { kind: "agent", agent: "scheduler", runId: "r", eventId: E };

beforeAll(async () => {
  m = {
    client: await import("@/db/client"),
    seed: await import("@/db/seed"),
    world: await import("@/server/services/world"),
    rt: await import("@/server/services/agent-runtime"),
    events: await import("../../worker/jobs/events"),
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
});

afterAll(async () => {
  await owner?.end({ timeout: 5 });
  await m?.client.sql.end({ timeout: 5 });
});

describe("read services over the database (#26)", () => {
  it("match the fixture world the seed came from", async () => {
    const s = m.world.createReadServices(agent, { searchKb: async () => [] });
    expect((await s.event()).slug).toBe("hacknova-2026");
    expect(await s.sessions()).toHaveLength(16);
    expect(await s.volunteers()).toHaveLength(28);
    expect(await s.availability()).toHaveLength(fx.availability.length);
    const lab = (await s.sessions()).find((x) => x.registeredCount === 95);
    expect(lab).toBeDefined();
  });

  it("never hand agents raw contact details", async () => {
    const s = m.world.createReadServices(agent, { searchKb: async () => [] });
    const regs = await s.registrations({ limit: 20 });
    expect(regs).toHaveLength(20);
    for (const r of regs) {
      expect(r.emailMasked).toContain("***");
      // Masked emails keep the domain; the full address must never appear.
      const full = fx.registrations.find((x) => x.id === r.id)!.email;
      expect(JSON.stringify(r)).not.toContain(full);
    }
    for (const sp of await s.speakers()) expect("email" in sp).toBe(false);
  });

  it("refuse an actor that is not bound to an event", () => {
    expect(() => m.world.createReadServices({ kind: "system" })).toThrow();
  });
});

describe("trace store and gate (#17)", () => {
  it("writes runs and steps", async () => {
    const trace = m.rt.dbTraceStore();
    const runId = await trace.startRun({
      eventId: E,
      agent: "scheduler",
      trigger: { type: "manual" },
      status: "running",
      simulation: false,
      modelTier: "smart",
      startedAt: new Date().toISOString(),
      stepCount: 0,
      proposalIds: [],
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
    });
    await trace.addStep(runId, 0, {
      kind: "llm",
      tier: "smart",
      provider: "groq",
      model: "openai/gpt-oss-120b",
      ok: true,
      inputTokens: 100,
      outputTokens: 20,
      latencyMs: 800,
      costUsd: 0.0002,
    });
    await trace.addStep(runId, 1, { kind: "note", text: "woke crew_chief" });
    await trace.finishRun(runId, {
      status: "succeeded",
      stepCount: 2,
      inputTokens: 100,
      outputTokens: 20,
      costUsd: 0.0002,
      finishedAt: new Date().toISOString(),
    });
    const [run] = await owner<
      { status: string; step_count: number }[]
    >`select status, step_count from agent_runs where id = ${runId}`;
    expect(run).toEqual({ status: "succeeded", step_count: 2 });
    const steps = await owner<
      { kind: string }[]
    >`select kind from agent_steps where run_id = ${runId} order by index`;
    expect(steps.map((s) => s.kind)).toEqual(["llm", "note"]);
  });

  it("respects per-agent flags and the kill switch", async () => {
    const gate = m.rt.dbGate();
    expect(await gate.enabled(E, "scheduler")).toBe(true);
    expect(await gate.killSwitch(E)).toBe(false);
    await owner`update agent_configs set enabled = false where event_id = ${E} and agent = 'scheduler'`;
    await owner`update events set agents_enabled = false where id = ${E}`;
    expect(await gate.enabled(E, "scheduler")).toBe(false);
    expect(await gate.killSwitch(E)).toBe(true);
    await owner`update agent_configs set enabled = true where event_id = ${E}`;
    await owner`update events set agents_enabled = true where id = ${E}`;
  });

  it("runtime deps propose through the engine and refuse other events", async () => {
    const deps = m.rt.runtimeDepsFor(E);
    const r = await deps.propose(agent, {
      kind: "incident.create",
      payload: {
        title: "Projector flicker",
        category: "av",
        severity: "low",
        source: "radar",
        description: "",
      },
      summary: "Projector flicker in Lab 204",
      rationale: "",
      idempotencyKey: `wiring-${Date.now()}`,
    });
    expect(r.status).toBe("created");
    const other = fixtures.charityDrive().event.id;
    expect(() =>
      deps.propose(
        { ...agent, eventId: other },
        {
          kind: "incident.create",
          payload: { title: "x", category: "av", severity: "low", source: "radar", description: "" },
          summary: "x",
          rationale: "",
          idempotencyKey: "x",
        },
      ),
    ).toThrow();
  });
});

describe("domain event fan-out", () => {
  it("handles an event and moves the replay cursor forward only", async () => {
    const [ev] = await owner<
      { id: string; seq: number }[]
    >`select id, seq from domain_events order by seq desc limit 1`;
    const log = { info() {}, warn() {}, error() {} } as never;
    await m.events.handleDomainEvent(ev!.id, log);
    const [c1] = await owner<
      { value: number }[]
    >`select value from app_settings where key = 'worker.domain_event_seq'`;
    expect(Number(c1!.value)).toBe(Number(ev!.seq));
    const [older] = await owner<{ id: string }[]>`select id from domain_events order by seq asc limit 1`;
    await m.events.handleDomainEvent(older!.id, log);
    const [c2] = await owner<
      { value: number }[]
    >`select value from app_settings where key = 'worker.domain_event_seq'`;
    expect(Number(c2!.value)).toBe(Number(ev!.seq));
  });
});
