/**
 * Human decisions on proposals: approve, reject, edit, undo. Every one checks the permission
 * matrix against the proposal's own domain and tier, scoped to the actor's event.
 */
import { and, eq } from "drizzle-orm";
import { ActionPayloads, type ActionKind, type ActionProposal, type UserActor } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { nowUtc } from "@/lib/time";
import { requirePermission } from "@/server/authz";
import { publish } from "@/server/events/bus";
import { HttpError, notFound } from "@/server/http";
import { assignTier } from "@/server/policy/tiers";
import { executorFor } from "./executors";
import { executeProposal, undoProposal } from "./execute";
import { hashDiff, loadProposal, type ProposalRow } from "./rows";
import { ExecutionError } from "./types";

const FACULTY_ROLES = new Set(["owner", "faculty_approver"]);

async function lockPending(
  tx: Parameters<Parameters<Db["transaction"]>[0]>[0],
  actor: UserActor,
  id: string,
): Promise<ProposalRow> {
  const [row] = await tx
    .select()
    .from(t.proposals)
    .where(and(eq(t.proposals.id, id), eq(t.proposals.eventId, actor.eventId)))
    .for("update");
  if (!row || row.parentId) throw notFound("Proposal not found");
  return row;
}

async function expireIfDue(
  tx: Parameters<typeof lockPending>[0],
  row: ProposalRow,
  actor: UserActor,
): Promise<boolean> {
  if (row.status !== "pending" || row.expiresAt.getTime() > nowUtc().getTime()) return false;
  await tx.update(t.proposals).set({ status: "expired" }).where(eq(t.proposals.id, row.id));
  await tx.update(t.proposals).set({ status: "expired" }).where(eq(t.proposals.parentId, row.id));
  await publish(tx, {
    eventId: row.eventId,
    type: "proposal.expired",
    entity: "proposals",
    entityId: row.id,
    actor,
    payload: { proposalId: row.id },
  });
  return true;
}

export async function approve(
  actor: UserActor,
  id: string,
  diffHash: string,
  client: Db = defaultDb,
): Promise<ActionProposal> {
  const ready = await client.transaction(async (tx) => {
    const row = await lockPending(tx, actor, id);
    requirePermission(actor, "proposal.approve", {
      eventId: row.eventId,
      domain: row.domain as never,
      riskTier: row.riskTier as never,
    });
    if (await expireIfDue(tx, row, actor)) return "expired" as const;
    if (row.status !== "pending") throw new HttpError("conflict", `This proposal is already ${row.status}`);
    if (diffHash !== row.diffHash)
      throw new HttpError("stale", "The proposal changed since you opened it. Review the new diff.");

    const approvals = await tx
      .select()
      .from(t.proposalApprovals)
      .where(eq(t.proposalApprovals.proposalId, row.id));
    if (approvals.some((a) => a.userId === actor.userId))
      throw new HttpError("conflict", "You already approved this");
    // Two-person rule on T3: whoever proposed it cannot also approve it.
    if (row.riskTier === "T3" && row.proposedBy.kind === "user" && row.proposedBy.userId === actor.userId) {
      throw new HttpError("forbidden", "T3 needs someone other than the proposer to approve");
    }
    const count = approvals.length + 1;
    if (row.facultyApprovalRequired && count >= row.requiredApprovals) {
      const hasFaculty = approvals.some((a) => FACULTY_ROLES.has(a.role)) || FACULTY_ROLES.has(actor.role);
      if (!hasFaculty)
        throw new HttpError("forbidden", "This needs an owner or faculty approver as one of the approvals");
    }

    await tx
      .insert(t.proposalApprovals)
      .values({ eventId: row.eventId, proposalId: row.id, userId: actor.userId, role: actor.role, diffHash });
    const done = count >= row.requiredApprovals;
    if (done) {
      await tx.update(t.proposals).set({ status: "approved" }).where(eq(t.proposals.id, row.id));
      await tx.update(t.proposals).set({ status: "approved" }).where(eq(t.proposals.parentId, row.id));
    }
    await publish(tx, {
      eventId: row.eventId,
      type: "proposal.approved",
      entity: "proposals",
      entityId: row.id,
      actor,
      payload: { proposalId: row.id, approvals: count, required: row.requiredApprovals, final: done },
    });
    return done ? ("execute" as const) : ("waiting" as const);
  });
  if (ready === "expired")
    throw new HttpError("expired", "This proposal expired. Ask the agent to propose again.");
  if (ready === "execute") return executeProposal(id, { client, actor });
  return (await loadProposal(client, id))!;
}

export async function reject(
  actor: UserActor,
  id: string,
  reason: string,
  client: Db = defaultDb,
): Promise<ActionProposal> {
  await client.transaction(async (tx) => {
    const row = await lockPending(tx, actor, id);
    requirePermission(actor, "proposal.reject", {
      eventId: row.eventId,
      domain: row.domain as never,
      riskTier: row.riskTier as never,
    });
    if (row.status !== "pending") throw new HttpError("conflict", `This proposal is already ${row.status}`);
    await tx.update(t.proposals).set({ status: "rejected", error: reason }).where(eq(t.proposals.id, row.id));
    await tx.update(t.proposals).set({ status: "rejected" }).where(eq(t.proposals.parentId, row.id));
    await publish(tx, {
      eventId: row.eventId,
      type: "proposal.rejected",
      entity: "proposals",
      entityId: row.id,
      actor,
      payload: { proposalId: row.id, reason },
    });
  });
  return (await loadProposal(client, id))!;
}

/** Replace the payload of a pending proposal. Re-describes, re-tiers, clears approvals, new diff hash. */
export async function edit(
  actor: UserActor,
  id: string,
  payload: unknown,
  summary: string | undefined,
  client: Db = defaultDb,
): Promise<ActionProposal> {
  await client.transaction(async (tx) => {
    const row = await lockPending(tx, actor, id);
    requirePermission(actor, "proposal.edit", {
      eventId: row.eventId,
      domain: row.domain as never,
      riskTier: row.riskTier as never,
    });
    if (row.status !== "pending")
      throw new HttpError("conflict", `Only pending proposals can be edited (this one is ${row.status})`);
    const kind = row.kind as ActionKind;
    if (kind === "plan.bundle")
      throw new HttpError("bad_request", "Edit the children of a bundle, not the bundle");
    const parsed = ActionPayloads[kind].safeParse(payload);
    if (!parsed.success) {
      throw new HttpError("bad_request", "The new payload is not valid", {
        issues: parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      });
    }
    const [ev] = await tx.select().from(t.events).where(eq(t.events.id, row.eventId));
    const ex = executorFor(kind);
    if (!ex) throw new ExecutionError(`${kind} is not supported yet`);
    let d;
    try {
      d = await ex.describe(parsed.data as never, {
        db: tx,
        eventId: row.eventId,
        orgId: ev!.orgId,
        now: nowUtc(),
        settings: ev!.settings,
      });
    } catch (err) {
      if (err instanceof ExecutionError) throw new HttpError("bad_request", err.message);
      throw err;
    }
    const tier = assignTier({ kind, payload: parsed.data, impact: d.impact }, ev!.settings);
    await tx.delete(t.proposalApprovals).where(eq(t.proposalApprovals.proposalId, row.id));
    await tx
      .update(t.proposals)
      .set({
        payload: parsed.data,
        summary: summary ?? row.summary,
        diff: d.diff,
        impact: d.impact,
        preconditions: d.preconditions,
        diffHash: hashDiff(kind, parsed.data, d.diff),
        riskTier: tier.riskTier,
        tierReasons: [...tier.reasons, `Edited by ${actor.role}`],
        requiredApprovals: tier.requiredApprovals,
        facultyApprovalRequired: tier.facultyApprovalRequired,
        expiresAt: new Date(nowUtc().getTime() + (ev!.settings.proposalTtlMinutes ?? 30) * 60_000),
      })
      .where(eq(t.proposals.id, row.id));
    await publish(tx, {
      eventId: row.eventId,
      type: "proposal.edited",
      entity: "proposals",
      entityId: row.id,
      actor,
      payload: { proposalId: row.id, riskTier: tier.riskTier },
    });
  });
  return (await loadProposal(client, id))!;
}

export async function undo(actor: UserActor, id: string, client: Db = defaultDb): Promise<ActionProposal> {
  const [row] = await client
    .select()
    .from(t.proposals)
    .where(and(eq(t.proposals.id, id), eq(t.proposals.eventId, actor.eventId)));
  if (!row) throw notFound("Proposal not found");
  requirePermission(actor, "proposal.undo", {
    eventId: row.eventId,
    domain: row.domain as never,
    riskTier: row.riskTier as never,
  });
  try {
    return await undoProposal(id, actor, client);
  } catch (err) {
    if (err instanceof ExecutionError) throw new HttpError("conflict", err.message);
    throw err;
  }
}
