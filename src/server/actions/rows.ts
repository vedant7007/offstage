import { createHash } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import { ActionProposal, type DiffEntry, type Role } from "@/contracts";
import * as t from "@/db/schema";
import type { Tx } from "./types";

export type ProposalRow = typeof t.proposals.$inferSelect;
export type ApprovalRow = typeof t.proposalApprovals.$inferSelect;

/** Hash of what an approver is shown. Approving with an older hash is refused. */
export function hashDiff(kind: string, payload: unknown, diff: DiffEntry[]): string {
  return createHash("sha256").update(JSON.stringify({ kind, payload, diff })).digest("hex").slice(0, 32);
}

export function toProposal(row: ProposalRow, approvals: ApprovalRow[]): ActionProposal {
  return ActionProposal.parse({
    id: row.id,
    eventId: row.eventId,
    kind: row.kind,
    payload: row.payload,
    proposedBy: row.proposedBy,
    planId: row.planId ?? undefined,
    parentId: row.parentId ?? undefined,
    domain: row.domain,
    summary: row.summary,
    rationale: row.rationale,
    evidence: row.evidence,
    impact: row.impact,
    diff: row.diff,
    diffHash: row.diffHash,
    riskTier: row.riskTier,
    tierReasons: row.tierReasons,
    requiredApprovals: row.requiredApprovals,
    approvals: approvals.map((a) => ({
      userId: a.userId,
      role: a.role as Role,
      at: a.at.toISOString(),
      diffHash: a.diffHash,
    })),
    facultyApprovalRequired: row.facultyApprovalRequired,
    status: row.status,
    idempotencyKey: row.idempotencyKey,
    preconditions: row.preconditions,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    executedAt: row.executedAt?.toISOString(),
    undoUntil: row.undoUntil?.toISOString(),
    error: row.error ?? undefined,
  });
}

export async function approvalsFor(db: Tx, ids: string[]): Promise<Map<string, ApprovalRow[]>> {
  const map = new Map<string, ApprovalRow[]>();
  if (ids.length === 0) return map;
  const rows = await db
    .select()
    .from(t.proposalApprovals)
    .where(inArray(t.proposalApprovals.proposalId, ids))
    .orderBy(asc(t.proposalApprovals.at));
  for (const r of rows) map.set(r.proposalId, [...(map.get(r.proposalId) ?? []), r]);
  return map;
}

export async function loadProposal(db: Tx, id: string): Promise<ActionProposal | null> {
  const [row] = await db.select().from(t.proposals).where(eq(t.proposals.id, id));
  if (!row) return null;
  return toProposal(row, (await approvalsFor(db, [id])).get(id) ?? []);
}
