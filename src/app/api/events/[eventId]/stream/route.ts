import { eq } from "drizzle-orm";
import { StreamMessage } from "@/contracts/api";
import { AgentName, DomainEvent } from "@/contracts";
import { db } from "@/db/client";
import * as t from "@/db/schema";
import { logger } from "@/lib/logger";
import { getActor, requirePermission } from "@/server/authz";
import { errorResponse } from "@/server/http";
import { subscribe, subscribeRuns } from "@/server/events/bus";
import { toRun } from "@/server/services/proposals";
import { getMetrics } from "@/server/services/overview";
import { sseResponse } from "@/server/sse";

export const dynamic = "force-dynamic";

const log = logger.child({ module: "api.stream" });
const METRICS_MS = 30_000;

type Ctx = { params: Promise<{ eventId: string }> };

async function domainEvent(id: string) {
  const [r] = await db.select().from(t.domainEvents).where(eq(t.domainEvents.id, id));
  return r ? DomainEvent.parse({ ...r, at: r.at.toISOString() }) : null;
}

async function proposalCard(id: string) {
  const [p] = await db
    .select({
      id: t.proposals.id,
      kind: t.proposals.kind,
      status: t.proposals.status,
      riskTier: t.proposals.riskTier,
      summary: t.proposals.summary,
      domain: t.proposals.domain,
    })
    .from(t.proposals)
    .where(eq(t.proposals.id, id));
  return p ?? null;
}

/**
 * Console live stream (SSE): every domain event of this event, a proposal card whenever a
 * proposal changes, metrics on connect and every 30 seconds, and a heartbeat. Pages that cannot
 * hold the stream fall back to polling GET .../overview.
 */
export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  let eventId: string;
  try {
    eventId = (await ctx.params).eventId;
    const actor = await getActor(req, { eventId });
    requirePermission(actor, "event.read", { eventId });
  } catch (err) {
    return errorResponse(err);
  }

  return sseResponse(req, async (ch) => {
    const send = (m: StreamMessage) => ch.send(m.type, StreamMessage.parse(m));
    const metrics = () =>
      getMetrics(eventId)
        .then((m) => send({ type: "metrics", metrics: m }))
        .catch((err: unknown) => log.warn({ err }, "metrics snapshot failed"));

    const off = subscribe(eventId, (n) => {
      void (async () => {
        const ev = await domainEvent(n.id);
        if (!ev) return;
        send({ type: "domain_event", event: ev });
        if (ev.type.startsWith("proposal.")) {
          const p = await proposalCard(ev.entityId);
          if (p) send({ type: "proposal", proposal: p as never });
        }
      })().catch((err: unknown) => log.warn({ err }, "stream message failed"));
    });
    // Agent runs for the Live Stage: the run row when it starts and ends, a light message per step.
    const offRuns = subscribeRuns(eventId, (n) => {
      if (n.phase === "step") {
        const agent = AgentName.safeParse(n.agent);
        if (agent.success && n.stepKind)
          send({ type: "agent_step", runId: n.runId, agent: agent.data, kind: n.stepKind });
        return;
      }
      void db
        .select()
        .from(t.agentRuns)
        .where(eq(t.agentRuns.id, n.runId))
        .then(([r]) => r && send({ type: "agent_run", run: toRun(r) }))
        .catch((err: unknown) => log.warn({ err }, "run message failed"));
    });
    await metrics();
    const timer = setInterval(() => void metrics(), METRICS_MS);
    return () => {
      clearInterval(timer);
      off();
      offRuns();
    };
  });
}
