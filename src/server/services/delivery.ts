/** Outbox delivery counts for the console: what really went out versus what the mock driver took. */
import { and, eq, ne, sql } from "drizzle-orm";
import type { DeliveryStatsResponse, UserActor } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { requirePermission } from "@/server/authz";

export async function deliveryStats(actor: UserActor, client: Db = defaultDb): Promise<DeliveryStatsResponse> {
  requirePermission(actor, "proposal.read", { eventId: actor.eventId });
  const rows = await client
    .select({ channel: t.outbox.channel, status: t.outbox.status, n: sql<number>`count(*)::int` })
    .from(t.outbox)
    .where(and(eq(t.outbox.eventId, actor.eventId), ne(t.outbox.channel, "in_app")))
    .groupBy(t.outbox.channel, t.outbox.status);
  const by = new Map<string, DeliveryStatsResponse["channels"][number]>();
  for (const r of rows) {
    const c = by.get(r.channel) ?? { channel: r.channel as never, real: 0, mock: 0, pending: 0, failed: 0, skipped: 0 };
    if (r.status === "sent") c.real += r.n;
    else if (r.status === "delivered_mock") c.mock += r.n;
    else if (r.status === "failed") c.failed += r.n;
    else if (r.status === "skipped") c.skipped += r.n;
    else c.pending += r.n;
    by.set(r.channel, c);
  }
  return { channels: [...by.values()].sort((a, b) => a.channel.localeCompare(b.channel)) };
}
