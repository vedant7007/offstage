/** Daily briefings: read the latest, or generate one from live facts and store it. */
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { writeBriefing, type QueueFacts } from "@/agents/commander/briefing";
import type { Briefing, BriefingQuery, Domain, UserActor } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { istDateKey, nowUtc } from "@/lib/time";
import { requirePermission } from "@/server/authz";
import { syncDemoClock } from "@/server/clock";
import { createReadServices } from "@/server/services/world";

type Row = typeof t.briefings.$inferSelect;
const toBriefing = (r: Row): Briefing => ({
  id: r.id,
  eventId: r.eventId,
  date: r.date,
  scope: r.scope,
  sections: r.sections,
  facts: r.facts,
  generatedBy: r.generatedBy,
  generatedAt: r.generatedAt.toISOString(),
});

export async function queueFacts(eventId: string, client: Db = defaultDb): Promise<QueueFacts> {
  const [row] = await client
    .select({
      pending: sql<number>`count(*)::int`,
      t3: sql<number>`count(*) filter (where ${t.proposals.riskTier} = 'T3')::int`,
    })
    .from(t.proposals)
    .where(
      and(eq(t.proposals.eventId, eventId), eq(t.proposals.status, "pending"), isNull(t.proposals.parentId)),
    );
  return { pending: row?.pending ?? 0, pendingTwoApprovals: row?.t3 ?? 0 };
}

export async function latestBriefing(
  actor: UserActor,
  q: Omit<BriefingQuery, "eventId">,
  client: Db = defaultDb,
) {
  requirePermission(actor, "event.read", { eventId: actor.eventId });
  await syncDemoClock(client);
  const rows = await client
    .select()
    .from(t.briefings)
    .where(and(eq(t.briefings.eventId, actor.eventId), eq(t.briefings.date, q.date ?? istDateKey(nowUtc()))))
    .orderBy(desc(t.briefings.generatedAt));
  const match = rows.find((r) => (q.domain ? r.scope.domain === q.domain : r.scope.full));
  return match ? toBriefing(match) : null;
}

export async function generateBriefing(actor: UserActor, domain: Domain | undefined, client: Db = defaultDb) {
  requirePermission(actor, "agents.command", { eventId: actor.eventId });
  return writeAndStore(actor.eventId, domain, client);
}

/** The morning job: the event head's full briefing plus one per domain that has a lead. */
export async function morningBriefings(eventId: string, client: Db = defaultDb): Promise<number> {
  const leads = await client
    .selectDistinct({ domains: t.memberships.domains })
    .from(t.memberships)
    .where(and(eq(t.memberships.eventId, eventId), eq(t.memberships.role, "lead")));
  const domains = [...new Set(leads.flatMap((l) => (l.domains ?? []) as Domain[]))];
  await writeAndStore(eventId, undefined, client);
  for (const d of domains) await writeAndStore(eventId, d, client);
  return 1 + domains.length;
}

async function writeAndStore(eventId: string, domain: Domain | undefined, client: Db) {
  await syncDemoClock(client);
  const actor = { kind: "system" as const, eventId, reason: "daily briefing" };
  const b = await writeBriefing(createReadServices(actor, { client }), await queueFacts(eventId, client), {
    domain,
    io: { runId: `briefing:${randomUUID()}`, onAttempt: () => {}, critical: false },
  });
  const [row] = await client
    .insert(t.briefings)
    .values({ eventId, ...b, generatedAt: nowUtc() })
    .returning();
  return toBriefing(row!);
}
