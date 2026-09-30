/**
 * Evals for the console. The golden set (src/ai/evals/golden.ts) runs in this process when the owner asks and
 * its result is stored in app_settings, so every console reads the same run. Live numbers (latency and cost per
 * agent run, injections the guard blocked) are SQL over this event's rows.
 */
import { eq, sql } from "drizzle-orm";
import type { EvalsResponse, GoldenRun, UserActor } from "@/contracts";
import { AgentName } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { logger } from "@/lib/logger";
import { nowUtc } from "@/lib/time";
import { requirePermission } from "@/server/authz";
import { forbidden } from "@/server/http";

const log = logger.child({ module: "evals" });
const LATEST = "evals:latest";
const RUNNING = "evals:running";
// ponytail: runs in the web process; a crash mid-run leaves the flag, which expires after this long.
const STALE_MS = 15 * 60_000;

type Running = { startedAt: string; error?: string | null };

async function setting<T>(client: Db, key: string): Promise<T | null> {
  const [row] = await client.select().from(t.appSettings).where(eq(t.appSettings.key, key));
  return (row?.value as T | undefined) ?? null;
}
async function put(client: Db, key: string, value: unknown) {
  await client
    .insert(t.appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: t.appSettings.key, set: { value, updatedAt: new Date() } });
}

async function live(eventId: string, client: Db): Promise<EvalsResponse["live"]> {
  const agents = (await client.execute(sql`
    select agent, count(*)::int as runs, count(*) filter (where status = 'failed')::int as failed,
      coalesce(round(avg(latency_ms)), 0)::int as latency, coalesce(avg(cost_usd), 0)::float as avg_cost,
      coalesce(sum(cost_usd), 0)::float as total_cost
    from ${t.agentRuns} where event_id = ${eventId} and not simulation and status <> 'running'
    group by agent order by agent`)) as unknown as {
    agent: string;
    runs: number;
    failed: number;
    latency: number;
    avg_cost: number;
    total_cost: number;
  }[];
  // A blocked message is never stored as a message; the helpdesk writes an audit row for it instead.
  const [guard] = (await client.execute(sql`
    with blocked as (
      select (select count(*) from ${t.auditLog} where event_id = ${eventId} and action = 'helpdesk.input_blocked')
        + (select count(*) from ${t.agentSteps} s join ${t.agentRuns} r on r.id = s.run_id
            where r.event_id = ${eventId} and s.kind = 'guard' and s.data->>'verdict' = 'block') as n
    )
    select (select n from blocked) as blocked,
      (select n from blocked)
      + (select count(*) from ${t.messages} where event_id = ${eventId} and role = 'user')
      + (select count(*) from ${t.agentSteps} s join ${t.agentRuns} r on r.id = s.run_id
          where r.event_id = ${eventId} and s.kind = 'guard' and s.data->>'verdict' <> 'block') as screened`)) as unknown as {
    blocked: number;
    screened: number;
  }[];
  return {
    agents: agents
      .filter((a) => AgentName.safeParse(a.agent).success)
      .map((a) => ({
        agent: a.agent as EvalsResponse["live"]["agents"][number]["agent"],
        runs: a.runs,
        failed: a.failed,
        avgLatencyMs: a.latency,
        avgCostUsd: a.avg_cost,
        totalCostUsd: a.total_cost,
      })),
    injectionsBlocked: Number(guard?.blocked ?? 0),
    guardScreened: Number(guard?.screened ?? 0),
  };
}

export async function getEvals(actor: UserActor, client: Db = defaultDb): Promise<EvalsResponse> {
  requirePermission(actor, "event.read", { eventId: actor.eventId });
  const [golden, running] = await Promise.all([
    setting<GoldenRun>(client, LATEST),
    setting<Running>(client, RUNNING),
  ]);
  const active = running && !running.error && Date.now() - Date.parse(running.startedAt) < STALE_MS;
  return {
    golden,
    running: active ? { startedAt: running.startedAt } : null,
    lastError: running?.error ?? null,
    canRun: actor.role === "owner",
    live: await live(actor.eventId, client),
  };
}

/** Owner only. Starts a golden-set run in the background and returns at once; the page polls. */
export async function runEvals(actor: UserActor, client: Db = defaultDb): Promise<EvalsResponse> {
  requirePermission(actor, "event.read", { eventId: actor.eventId });
  if (actor.role !== "owner") throw forbidden("Only the event owner can rerun the evals");
  const now = await getEvals(actor, client);
  if (now.running) return now;
  await put(client, RUNNING, { startedAt: nowUtc().toISOString(), error: null } satisfies Running);
  void (async () => {
    try {
      const { runGolden, passes, THRESHOLDS, EVAL_EVENT } = await import("@/ai/evals/golden");
      // The seeded golden event's Postgres index, the one the real helpdesk searches; memory if it is missing.
      const { searchKbPg } = await import("@/ai/rag/pg");
      const [ev] = await client
        .select({ id: t.events.id })
        .from(t.events)
        .where(eq(t.events.slug, EVAL_EVENT));
      const r = await runGolden(
        ev ? { search: (q, k) => searchKbPg(client, ev.id, q, k), index: "postgres" } : {},
      );
      const golden: GoldenRun = {
        at: nowUtc().toISOString(),
        profile: r.profile,
        index: r.index,
        helpdesk: {
          questions: r.helpdesk.questions,
          groundingRate: r.helpdesk.groundingRate,
          refusalRate: r.helpdesk.refusalRate,
          avgLatencyMs: r.helpdesk.avgLatencyMs,
        },
        retrieval: { hitRate: r.retrieval.hitRate, k: r.retrieval.k },
        guard: {
          injections: r.guard.injections,
          injectionBlockRate: r.guard.injectionBlockRate,
          benignAllowRate: r.guard.benignAllowRate,
        },
        solver: { checked: r.solver.checked, passed: r.solver.passed },
        costUsd: r.costUsd,
        thresholds: THRESHOLDS,
        pass: passes(r),
        misses: [...r.helpdesk.misses, ...r.retrieval.misses, ...r.guard.failures, ...r.solver.failures]
          .slice(0, 30)
          .map((m) => m.slice(0, 400)),
      };
      await put(client, LATEST, golden);
      await client.delete(t.appSettings).where(eq(t.appSettings.key, RUNNING));
      log.info({ costUsd: r.costUsd, pass: golden.pass }, "golden evals finished");
    } catch (err) {
      log.warn({ err }, "golden evals failed");
      await put(client, RUNNING, {
        startedAt: nowUtc().toISOString(),
        error: String(err instanceof Error ? err.message : err).slice(0, 300),
      } satisfies Running).catch(() => undefined);
    }
  })();
  return getEvals(actor, client);
}
