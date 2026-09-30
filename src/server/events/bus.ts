/**
 * Domain event bus. `publish` writes the event in the caller's transaction and notifies
 * listeners (SSE streams, the worker) through Postgres NOTIFY once that transaction commits.
 * Subscribing and streaming land with the proposal engine (Checkpoint 4).
 */
import { sql } from "drizzle-orm";
import { DomainEvent, type Actor, type DomainEventType } from "@/contracts";
import type { Db } from "@/db/client";
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
