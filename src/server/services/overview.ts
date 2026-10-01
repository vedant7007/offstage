/**
 * Console overview and the metrics snapshot. Every number comes from SQL: the event's world from
 * loadWorld, plus the pieces loadWorld leaves out (pending proposals, recent questions, open
 * escalations, today's agent runs). The arithmetic is the same metricsSnapshot the fixtures use,
 * so mock mode and the database agree on what each number means.
 */
import { and, desc, eq, gte, isNull } from "drizzle-orm";
import type { AgentName, Domain, DomainEvent, MetricsSnapshot } from "@/contracts";
import type { OverviewResponse } from "@/contracts/api";
import type { EventWorld } from "@/contracts/fixtures";
import { metricsSnapshot } from "@/contracts/fixtures/world";
import { db } from "@/db/client";
import * as t from "@/db/schema";
import { istDayBounds, nowUtc } from "@/lib/time";
import { cachedWorld } from "./public";

async function extras(eventId: string, now: Date) {
  const tenMinAgo = new Date(now.getTime() - 10 * 60_000);
  const { start } = istDayBounds(now);
  const [pending, questions, escalations, runs, event] = await Promise.all([
    db
      .select({ domain: t.proposals.domain, agent: t.proposals.proposerAgent })
      .from(t.proposals)
      // Top-level only, like the Approvals list: a plan's steps are approved with the plan.
      .where(
        and(
          eq(t.proposals.eventId, eventId),
          eq(t.proposals.status, "pending"),
          isNull(t.proposals.parentId),
        ),
      ),
    db
      .select({ body: t.messages.body, at: t.messages.at })
      .from(t.messages)
      .where(
        and(eq(t.messages.eventId, eventId), eq(t.messages.role, "user"), gte(t.messages.at, tenMinAgo)),
      ),
    db
      .select({ status: t.escalations.status })
      .from(t.escalations)
      .where(and(eq(t.escalations.eventId, eventId), eq(t.escalations.status, "open"))),
    db
      .select({ agent: t.agentRuns.agent, costUsd: t.agentRuns.costUsd, startedAt: t.agentRuns.startedAt })
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.eventId, eventId), gte(t.agentRuns.startedAt, start))),
    db.select({ on: t.events.agentsEnabled }).from(t.events).where(eq(t.events.id, eventId)),
  ]);
  return { pending, questions, escalations, runs, agentsEnabled: event[0]?.on ?? false };
}

type Extras = Awaited<ReturnType<typeof extras>>;

/** The world with the rows metricsSnapshot reads filled in. Only the fields it reads are set. */
function withExtras(w: EventWorld, x: Extras, now: Date): EventWorld {
  return {
    ...w,
    now: now.toISOString(),
    proposals: x.pending.map((p) => ({ status: "pending", domain: p.domain as Domain })),
    messages: x.questions.map((q) => ({ role: "user", body: q.body, at: q.at.toISOString() })),
    escalations: x.escalations.map((e) => ({ status: e.status })),
    agentRuns: x.runs.map((r) => ({ costUsd: r.costUsd })),
  } as unknown as EventWorld;
}

export async function getMetrics(eventId: string): Promise<MetricsSnapshot> {
  const now = nowUtc();
  const [world, x] = await Promise.all([cachedWorld(eventId), extras(eventId, now)]);
  return metricsSnapshot(withExtras(world, x, now));
}

async function recentEvents(eventId: string): Promise<DomainEvent[]> {
  const rows = await db
    .select()
    .from(t.domainEvents)
    .where(eq(t.domainEvents.eventId, eventId))
    .orderBy(desc(t.domainEvents.seq))
    .limit(50);
  return rows.map((r) => ({
    id: r.id,
    eventId: r.eventId,
    type: r.type as DomainEvent["type"],
    entity: r.entity,
    entityId: r.entityId,
    actor: r.actor,
    payload: r.payload,
    at: r.at.toISOString(),
  }));
}

export async function getOverview(eventId: string): Promise<OverviewResponse> {
  const now = nowUtc();
  const [world, x, recent] = await Promise.all([
    cachedWorld(eventId),
    extras(eventId, now),
    recentEvents(eventId),
  ]);
  const count = (list: { agent: string | null }[], agent: AgentName) =>
    list.filter((r) => r.agent === agent).length;
  return {
    event: world.event,
    metrics: metricsSnapshot(withExtras(world, x, now)),
    agents: world.agents.map((a) => {
      const runs = x.runs.filter((r) => r.agent === a.name);
      const last = runs.reduce<Date | null>((m, r) => (!m || r.startedAt > m ? r.startedAt : m), null);
      return {
        ...a,
        pendingApprovals: count(x.pending, a.name),
        runsToday: runs.length,
        costUsdToday: Math.round(runs.reduce((s, r) => s + r.costUsd, 0) * 10_000) / 10_000,
        lastRunAt: last?.toISOString() ?? a.lastRunAt,
      };
    }),
    globalAgentsEnabled: x.agentsEnabled,
    recent,
  };
}
