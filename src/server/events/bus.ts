/**
 * Domain event bus. `publish` writes the event in the caller's transaction and notifies
 * listeners (SSE streams, the worker) through Postgres NOTIFY once that transaction commits.
 * `subscribe` is the web side: one LISTEN connection per process, fanned out to SSE streams by event.
 */
import { sql } from "drizzle-orm";
import { DomainEvent, type Actor, type DomainEventType } from "@/contracts";
import { sql as rawSql, type Db } from "@/db/client";
import { logger } from "@/lib/logger";
import { auditLog, domainEvents } from "@/db/schema";

export const EVENTS_CHANNEL = "sutradhar_events";

export interface PublishInput {
  eventId: string;
  type: DomainEventType;
  entity: string;
  entityId: string;
  actor: Actor;
  payload?: Record<string, unknown>;
  at?: Date;
}

type Tx = Pick<Db, "insert" | "execute">;

/** Insert a domain event and NOTIFY with its id. NOTIFY is delivered on commit, never for a rollback. */
export async function publish(tx: Tx, input: PublishInput): Promise<DomainEvent> {
  const [row] = await tx
    .insert(domainEvents)
    .values({
      eventId: input.eventId,
      type: input.type,
      entity: input.entity,
      entityId: input.entityId,
      actor: input.actor,
      payload: input.payload ?? {},
      ...(input.at ? { at: input.at } : {}),
    })
    .returning();
  if (!row) throw new Error("domain event insert returned nothing");
  await tx.execute(
    sql`select pg_notify(${EVENTS_CHANNEL}, ${JSON.stringify({ id: row.id, eventId: row.eventId, type: row.type })})`,
  );
  return DomainEvent.parse({
    id: row.id,
    eventId: row.eventId,
    type: row.type,
    entity: row.entity,
    entityId: row.entityId,
    actor: row.actor,
    payload: row.payload,
    at: row.at.toISOString(),
  });
}

/** Append an audit row. Every state change made outside a proposal executor must call this too. */
export async function audit(
  tx: Pick<Db, "insert">,
  input: {
    eventId: string;
    actor: Actor;
    action: string;
    entity: string;
    entityId?: string;
    before?: Record<string, unknown> | null;
    after?: Record<string, unknown> | null;
    proposalId?: string;
  },
): Promise<void> {
  await tx.insert(auditLog).values({
    eventId: input.eventId,
    actor: input.actor,
    action: input.action,
    entity: input.entity,
    entityId: input.entityId ?? null,
    before: input.before ?? null,
    after: input.after ?? null,
    proposalId: input.proposalId ?? null,
  });
}

export interface Notice {
  id: string;
  eventId: string;
  type: DomainEventType;
}

/** One LISTEN connection per channel per process, fanned out to subscribers by event id. */
function channel<N extends { eventId: string }>(name: string) {
  const listeners = new Map<string, Set<(n: N) => void>>();
  let listening: Promise<unknown> | undefined;
  return (eventId: string, fn: (n: N) => void): (() => void) => {
    listening ??= rawSql
      .listen(name, (raw) => {
        let n: N;
        try {
          n = JSON.parse(raw) as N;
        } catch {
          return;
        }
        for (const l of listeners.get(n.eventId) ?? []) l(n);
      })
      .catch((err: unknown) => {
        logger
          .child({ module: "bus" })
          .error({ err, channel: name }, "LISTEN failed; streams fall back to polling");
        listening = undefined;
      });
    const set = listeners.get(eventId) ?? new Set();
    set.add(fn);
    listeners.set(eventId, set);
    return () => {
      set.delete(fn);
      if (!set.size) listeners.delete(eventId);
    };
  };
}

/**
 * Call `fn` for every domain event of one event (the NOTIFY payload: id, event, type) until the
 * returned function is called. The first subscriber opens the process's LISTEN connection;
 * postgres.js reconnects it on its own if the database restarts.
 */
export const subscribe = channel<Notice>(EVENTS_CHANNEL);

/** Agent run lifecycle, for the Live Stage: a run starting, each step, and the run finishing. */
export const RUNS_CHANNEL = "sutradhar_runs";
export interface RunNotice {
  eventId: string;
  runId: string;
  agent: string;
  phase: "started" | "step" | "finished";
  stepKind?: string;
  status?: string;
}
export const subscribeRuns = channel<RunNotice>(RUNS_CHANNEL);

/** Best effort: a missed notice only delays the stage until the next one. */
export async function notifyRun(client: Pick<Db, "execute">, n: RunNotice): Promise<void> {
  await client.execute(sql`select pg_notify(${RUNS_CHANNEL}, ${JSON.stringify(n)})`).catch(() => undefined);
}
