/**
 * The router's daily model spend, shared through usage_budget so the web app and the worker count one total
 * (and one cap). One row per org per IST day; adds are atomic increments.
 */
import { sql } from "drizzle-orm";
import type { SpendStore } from "@/ai/router";
import { db as defaultDb, type Db } from "@/db/client";
import { istDateKey } from "@/lib/time";

const CAP_USD = Number(process.env.AI_DAILY_CAP_USD ?? 3);

export function dbSpendStore(client: Db = defaultDb): SpendStore {
  const upsert = async (usd: number) => {
    const day = istDateKey(Date.now());
    const rows = await client.execute<{ spent_usd: string; cap_usd: string }>(sql`
      insert into usage_budget (org_id, event_id, day, spent_usd, cap_usd)
      select id, null, ${day}, ${usd}, ${CAP_USD} from orgs order by created_at limit 1
      on conflict (org_id, coalesce(event_id, ''), day)
      do update set spent_usd = usage_budget.spent_usd + excluded.spent_usd, updated_at = now()
      returning spent_usd, cap_usd`);
    const r = [...rows][0];
    return { spentUsd: Number(r?.spent_usd ?? 0), capUsd: Number(r?.cap_usd ?? CAP_USD) };
  };
  return { get: () => upsert(0), add: (usd) => upsert(usd) };
}
