/**
 * Version checks. A proposal records the version of every row it depends on; execution
 * re-reads them and refuses (stale) if anything moved in between.
 */
import { sql } from "drizzle-orm";
import type { Precondition } from "@/contracts";
import type { Tx } from "./types";

/** Entities a precondition may name. Anything else is rejected, so names never reach SQL unchecked. */
const VERSIONED_TABLES = new Set([
  "events",
  "rooms",
  "tracks",
  "sessions",
  "speakers",
  "registrations",
  "tickets",
  "teams",
  "volunteers",
  "shifts",
  "shift_assignments",
  "tasks",
  "incidents",
  "kb_documents",
  "escalations",
  "announcements",
  "milestones",
  "budget_categories",
  "ledger_entries",
  "sponsor_prospects",
  "sponsor_deliverables",
  "marketing_posts",
  "checklists",
  "checklist_items",
  "inventory_items",
  "agent_configs",
]);

export function isVersionedEntity(entity: string): boolean {
  return VERSIONED_TABLES.has(entity);
}

export interface StaleEntry {
  entity: string;
  id: string;
  expected: number;
  actual: number | null;
}

/** Returns the preconditions that no longer hold (empty when all good). Locks the rows it reads. */
export async function checkPreconditions(
  db: Tx,
  eventId: string,
  pre: Precondition[],
): Promise<StaleEntry[]> {
  const stale: StaleEntry[] = [];
  for (const p of pre) {
    if (!VERSIONED_TABLES.has(p.entity)) throw new Error(`Unknown precondition entity: ${p.entity}`);
    // The events table is scoped by its own id; every other table by event_id.
    const scope = p.entity === "events" ? sql`id = ${eventId}` : sql`event_id = ${eventId}`;
    const rows = await db.execute<{ version: number }>(
      sql`select version from ${sql.identifier(p.entity)} where id = ${p.id} and ${scope} for update`,
    );
    const actual = rows[0]?.version ?? null;
    if (actual !== p.version) stale.push({ entity: p.entity, id: p.id, expected: p.version, actual });
  }
  return stale;
}
