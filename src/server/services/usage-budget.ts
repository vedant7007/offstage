/**
 * Shared daily model spend (issue #14). The router's daily cap reads and writes this, so the
 * web app and the worker count against one number. Days are IST calendar days.
 */
import { and, eq, isNull, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db/client";
import { usageBudget } from "@/db/schema";
import { istDateKey, nowUtc } from "@/lib/time";

export interface BudgetScope {
  orgId: string;
  /** Omit for an org-wide budget. */
  eventId?: string;
}

export interface UsageDay {
  day: string;
  spentUsd: number;
  capUsd: number;
  remainingUsd: number;
  exhausted: boolean;
}

const DEFAULT_CAP_USD = () => Number(process.env.AI_DAILY_CAP_USD ?? 3);

function scopeWhere(scope: BudgetScope, day: string) {
  return and(
    eq(usageBudget.orgId, scope.orgId),
    scope.eventId ? eq(usageBudget.eventId, scope.eventId) : isNull(usageBudget.eventId),
    eq(usageBudget.day, day),
  );
}

function toDay(row: { day: string; spentUsd: number; capUsd: number }): UsageDay {
  const remaining = Math.max(0, row.capUsd - row.spentUsd);
  return {
    day: row.day,
    spentUsd: row.spentUsd,
    capUsd: row.capUsd,
    remainingUsd: remaining,
    exhausted: row.spentUsd >= row.capUsd,
  };
}

/** Spend so far today (or on `day`). Returns zero spent with the default cap when nothing is recorded. */
export async function getUsage(
  scope: BudgetScope,
  day = istDateKey(nowUtc()),
  client: Pick<Db, "select"> = defaultDb,
): Promise<UsageDay> {
  const [row] = await client.select().from(usageBudget).where(scopeWhere(scope, day)).limit(1);
  return toDay(row ?? { day, spentUsd: 0, capUsd: DEFAULT_CAP_USD() });
}

/** Add spend atomically (safe with concurrent callers) and return the new total. */
export async function addUsage(
  scope: BudgetScope,
  usd: number,
  day = istDateKey(nowUtc()),
  client: Pick<Db, "execute"> = defaultDb,
): Promise<UsageDay> {
  if (!Number.isFinite(usd) || usd < 0) throw new RangeError("usd must be a non-negative number");
  const rows = await client.execute<{ day: string; spent_usd: string; cap_usd: string }>(sql`
    insert into ${usageBudget} (org_id, event_id, day, spent_usd, cap_usd)
    values (${scope.orgId}, ${scope.eventId ?? null}, ${day}, ${usd}, ${DEFAULT_CAP_USD()})
    on conflict (org_id, coalesce(event_id, ''), day)
    do update set spent_usd = ${usageBudget}.spent_usd + excluded.spent_usd, updated_at = now()
    returning day::text as day, spent_usd, cap_usd`);
  const r = rows[0];
  if (!r) throw new Error("usage_budget upsert returned nothing");
  return toDay({ day: r.day, spentUsd: Number(r.spent_usd), capUsd: Number(r.cap_usd) });
}

/** Change the cap for a day (organizer setting). */
export async function setDailyCap(
  scope: BudgetScope,
  capUsd: number,
  day = istDateKey(nowUtc()),
  client: Pick<Db, "execute"> = defaultDb,
): Promise<void> {
  await client.execute(sql`
    insert into ${usageBudget} (org_id, event_id, day, spent_usd, cap_usd)
    values (${scope.orgId}, ${scope.eventId ?? null}, ${day}, 0, ${capUsd})
    on conflict (org_id, coalesce(event_id, ''), day) do update set cap_usd = excluded.cap_usd, updated_at = now()`);
}
