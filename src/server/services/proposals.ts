/**
 * Console reads for proposals and agent runs. Scoped by the actor's event (from the path, checked by
 * getActor), never by input. Decisions (approve, reject, edit, undo) live in src/server/actions.
 */
import { and, asc, desc, eq, inArray, lt, sql } from "drizzle-orm";
import {
  AgentRun,
  AgentStep,
  type ActionProposal,
  type ListAgentRunsQuery,
  type ListProposalsQuery,
  type ProposalResponse,
  type UserActor,
} from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { can, requirePermission } from "@/server/authz";
import { notFound } from "@/server/http";
import { approvalsFor, loadProposal, toProposal } from "@/server/actions/rows";
import { nowUtc } from "@/lib/time";

/** Cursor is the createdAt ISO of the last item on the previous page. */
export async function listProposals(
  actor: UserActor,
  q: ListProposalsQuery,
  client: Db = defaultDb,
): Promise<{ items: ActionProposal[]; nextCursor: string | null }> {
  requirePermission(actor, "proposal.read", { eventId: actor.eventId });
  const statuses = q.status === undefined ? undefined : Array.isArray(q.status) ? q.status : [q.status];
  const rows = await client
    .select()
    .from(t.proposals)
    .where(
      and(
        eq(t.proposals.eventId, actor.eventId),
        statuses ? inArray(t.proposals.status, statuses) : undefined,
        q.tier ? eq(t.proposals.riskTier, q.tier) : undefined,
        q.domain ? eq(t.proposals.domain, q.domain) : undefined,
        q.kind ? eq(t.proposals.kind, q.kind) : undefined,
        q.agent ? sql`${t.proposals.proposedBy}->>'agent' = ${q.agent}` : undefined,
        q.parentId ? eq(t.proposals.parentId, q.parentId) : undefined,
        q.cursor ? lt(t.proposals.createdAt, new Date(q.cursor)) : undefined,
      ),
    )
    .orderBy(desc(t.proposals.createdAt))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  const approvals = await approvalsFor(
    client,
    page.map((r) => r.id),
  );
  let items = page.map((r) => toProposal(r, approvals.get(r.id) ?? []));
  if (q.mine) items = items.filter((p) => canApprove(actor, p));
  return { items, nextCursor: rows.length > q.limit ? page.at(-1)!.createdAt.toISOString() : null };
}

/** Whether this user may approve now: permission for the tier and domain, pending, not already approved by them. */
export function canApprove(actor: UserActor, p: ActionProposal): boolean {
  return (
    p.status === "pending" &&
    !p.approvals.some((a) => a.userId === actor.userId) &&
    can(actor, "proposal.approve", { eventId: p.eventId, domain: p.domain, riskTier: p.riskTier })
  );
}

export async function getProposalDetail(
  actor: UserActor,
  id: string,
  client: Db = defaultDb,
): Promise<ProposalResponse> {
  requirePermission(actor, "proposal.read", { eventId: actor.eventId });
  const proposal = await loadProposal(client, id);
  if (!proposal || proposal.eventId !== actor.eventId) throw notFound("Proposal not found");
  const childRows = await client
    .select()
    .from(t.proposals)
    .where(eq(t.proposals.parentId, id))
    .orderBy(asc(t.proposals.createdAt));
  const approvals = await approvalsFor(
    client,
    childRows.map((r) => r.id),
  );
  return {
    proposal,
    children: childRows.map((r) => toProposal(r, approvals.get(r.id) ?? [])),
    canApprove: canApprove(actor, proposal),
    canUndo:
      Boolean(proposal.undoUntil && proposal.undoUntil > nowUtc().toISOString()) &&
      proposal.status === "executed" &&
      can(actor, "proposal.undo", {
        eventId: proposal.eventId,
        domain: proposal.domain,
        riskTier: proposal.riskTier,
      }),
  };
}

type RunRow = typeof t.agentRuns.$inferSelect;
const toRun = (r: RunRow): AgentRun =>
  AgentRun.parse({
    id: r.id,
    eventId: r.eventId,
    agent: r.agent,
    trigger: r.trigger,
    status: r.status,
    simulation: r.simulation,
    modelTier: r.modelTier,
    startedAt: r.startedAt.toISOString(),
    finishedAt: r.finishedAt?.toISOString(),
    stepCount: r.stepCount,
    proposalIds: r.proposalIds,
    inputTokens: r.inputTokens,
    outputTokens: r.outputTokens,
    costUsd: Number(r.costUsd),
    latencyMs: r.latencyMs ?? undefined,
    error: r.error ?? undefined,
  });

export async function listAgentRuns(
  actor: UserActor,
  q: ListAgentRunsQuery,
  client: Db = defaultDb,
): Promise<{ items: AgentRun[]; nextCursor: string | null }> {
  requirePermission(actor, "agents.read", { eventId: actor.eventId });
  const rows = await client
    .select()
    .from(t.agentRuns)
    .where(
      and(
        eq(t.agentRuns.eventId, actor.eventId),
        q.agent ? eq(t.agentRuns.agent, q.agent) : undefined,
        q.proposalId ? sql`${q.proposalId} = any(${t.agentRuns.proposalIds})` : undefined,
        q.since ? sql`${t.agentRuns.startedAt} >= ${new Date(q.since)}` : undefined,
        q.cursor ? lt(t.agentRuns.startedAt, new Date(q.cursor)) : undefined,
      ),
    )
    .orderBy(desc(t.agentRuns.startedAt))
    .limit(q.limit + 1);
  const page = rows.slice(0, q.limit);
  return {
    items: page.map(toRun),
    nextCursor: rows.length > q.limit ? page.at(-1)!.startedAt.toISOString() : null,
  };
}

export async function getAgentRun(
  actor: UserActor,
  runId: string,
  client: Db = defaultDb,
): Promise<{ run: AgentRun; steps: AgentStep[] }> {
  requirePermission(actor, "agents.read", { eventId: actor.eventId });
  const [run] = await client
    .select()
    .from(t.agentRuns)
    .where(and(eq(t.agentRuns.id, runId), eq(t.agentRuns.eventId, actor.eventId)));
  if (!run) throw notFound("Agent run not found");
  const steps = await client
    .select()
    .from(t.agentSteps)
    .where(eq(t.agentSteps.runId, runId))
    .orderBy(asc(t.agentSteps.index));
  return {
    run: toRun(run),
    steps: steps.map((s) =>
      AgentStep.parse({
        ...s.data,
        kind: s.kind,
        id: s.id,
        runId: s.runId,
        index: s.index,
        at: s.at.toISOString(),
      }),
    ),
  };
}
