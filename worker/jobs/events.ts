/**
 * Domain event fan-out (issue #17). The bus NOTIFYs `sutradhar_events` on commit; the worker
 * turns each notification into one pg-boss job, and the job hands the event to the agent
 * dispatcher and the KB indexer. Jobs are keyed by event id, so a replay never runs twice, and
 * on start the worker replays anything published while it was down.
 */
import { asc, sql as dsql, eq, gt } from "drizzle-orm";
import type { PgBoss } from "pg-boss";
import type { RuntimeDeps } from "@/agents/runtime/types";
import type { Logger } from "pino";
import { DomainEvent } from "@/contracts";
import { db, sql } from "@/db/client";
import * as t from "@/db/schema";
import { syncDemoClock } from "@/server/clock";
import { EVENTS_CHANNEL } from "@/server/events/bus";
import { dbGate, runtimeDepsFor } from "@/server/services/agent-runtime";
import { dispatch } from "../jobs/agents/dispatcher";
import { KB_EVENTS, onKbEvent } from "../jobs/agents/kb-ingest";

export const DOMAIN_EVENT_QUEUE = "domain-event";
const CURSOR_KEY = "worker.domain_event_seq";

async function loadEvent(id: string): Promise<{ event: DomainEvent; seq: number } | null> {
  const [row] = await db.select().from(t.domainEvents).where(eq(t.domainEvents.id, id));
  if (!row) return null;
  return {
    seq: row.seq,
    event: DomainEvent.parse({
      id: row.id,
      eventId: row.eventId,
      type: row.type,
      entity: row.entity,
      entityId: row.entityId,
      actor: row.actor,
      payload: row.payload,
      at: row.at.toISOString(),
    }),
  };
}

async function saveCursor(seq: number): Promise<void> {
  await db
    .insert(t.appSettings)
    .values({ key: CURSOR_KEY, value: seq })
    .onConflictDoUpdate({
      target: t.appSettings.key,
      set: { value: dsql`to_jsonb(greatest((${t.appSettings.value} #>> '{}')::bigint, ${seq}::bigint))` },
    });
}

async function readCursor(): Promise<number> {
  const [row] = await db.select().from(t.appSettings).where(eq(t.appSettings.key, CURSOR_KEY));
  return Number(row?.value ?? 0);
}

/** Handle one domain event: wake agents whose triggers match, re-index KB documents. */
export async function handleDomainEvent(id: string, log: Logger): Promise<void> {
  const loaded = await loadEvent(id);
  if (!loaded) return;
  const { event, seq } = loaded;
  // The dispatcher takes deps for any services type; ours are the database ReadServices.
  const deps = runtimeDepsFor(event.eventId) as unknown as RuntimeDeps<unknown>;
  const results = await dispatch(event, { deps, gate: dbGate() });
  if (KB_EVENTS.has(event.type)) {
    const chunks = await onKbEvent(db, event);
    log.info({ type: event.type, documentId: event.entityId, chunks }, "kb document indexed");
  }
  if (results.length) {
    log.info(
      {
        type: event.type,
        agents: results.map((r) => ({
          agent: r.agent,
          result: "skipped" in r.result ? r.result.skipped : "ran",
        })),
      },
      "agents woken",
    );
  }
  await saveCursor(seq);
}

export async function registerDomainEventFanOut(boss: PgBoss, log: Logger): Promise<() => Promise<void>> {
  await boss.createQueue(DOMAIN_EVENT_QUEUE);
  await boss.work<{ id: string }>(DOMAIN_EVENT_QUEUE, async (jobs) => {
    // The periodic sync can lag a demo reset by up to 15 s; agents must stamp proposals with the current clock.
    await syncDemoClock().catch((err: unknown) => log.warn({ err }, "demo clock sync failed"));
    for (const job of jobs) await handleDomainEvent(job.data.id, log);
  });

  const enqueue = (id: string) =>
    boss
      .send(DOMAIN_EVENT_QUEUE, { id }, { singletonKey: id, retryLimit: 3 })
      .catch((err: unknown) => log.error({ err }, "could not enqueue domain event"));

  // Replay what was published while the worker was down.
  const cursor = await readCursor();
  const missed = await db
    .select({ id: t.domainEvents.id })
    .from(t.domainEvents)
    .where(gt(t.domainEvents.seq, cursor))
    .orderBy(asc(t.domainEvents.seq))
    .limit(1000);
  for (const m of missed) await enqueue(m.id);
  if (missed.length) log.info({ count: missed.length }, "replaying domain events");

  const listener = await sql.listen(EVENTS_CHANNEL, (payload) => {
    try {
      const { id } = JSON.parse(payload) as { id: string };
      void enqueue(id);
    } catch (err) {
      log.warn({ err }, "bad domain event notification");
    }
  });
  return () => listener.unlisten();
}
