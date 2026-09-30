/**
 * Execution. One transaction: lock the proposal, re-check every precondition version, run the
 * executor (or every child of a bundle, all or nothing), write the audit log, mark executed and
 * publish the domain events. A version mismatch marks the proposal stale instead.
 */
import { and, asc, eq } from "drizzle-orm";
import { ActionPayloads, type ActionKind, type ActionProposal, type Actor, type Role } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { logger } from "@/lib/logger";
import { nowUtc } from "@/lib/time";
import { audit, publish, type PublishInput } from "@/server/events/bus";
import { executorFor } from "./executors";
import { checkPreconditions } from "./preconditions";
import { approvalsFor, loadProposal, type ProposalRow } from "./rows";
import { ExecutionError, type ExecCtx, type Tx } from "./types";

const log = logger.child({ module: "actions.execute" });

export const UNDO_WINDOW_MS = 10 * 60_000;

/** Seniority used for the "approved by <role>" label. */
const ROLE_RANK: Role[] = ["owner", "faculty_approver", "organizer", "lead"];

function topRole(roles: string[]): Role | null {
  for (const r of ROLE_RANK) if (roles.includes(r)) return r;
  return (roles[0] as Role | undefined) ?? null;
}

async function runOne(
  tx: Tx,
  row: ProposalRow,
  base: Omit<ExecCtx, "proposalId" | "proposedBy" | "emit">,
  events: PublishInput[],
): Promise<Record<string, unknown> | undefined> {
  const kind = row.kind as ActionKind;
  const ex = executorFor(kind);
  if (!ex) throw new ExecutionError(`${kind} is not supported yet`);
  const payload = ActionPayloads[kind].parse(row.payload);
  const ctx: ExecCtx = {
    ...base,
    db: tx,
    proposalId: row.id,
    proposedBy: row.proposedBy,
    emit: (e) => events.push({ ...e, eventId: row.eventId, actor: row.proposedBy }),
  };
  const res = await ex.execute(payload as never, ctx);
  for (const d of row.diff) {
    await audit(tx, {
      eventId: row.eventId,
      actor: row.proposedBy,
      action: kind,
      entity: d.entity,
      entityId: d.id ?? undefined,
      before: d.before,
      after: d.after,
      proposalId: row.id,
    });
  }
  return res?.undoData;
}

/** Execute an approved proposal. Safe to call twice: an executed proposal is returned as is. */
export async function executeProposal(
  proposalId: string,
  opts: { client?: Db; actor?: Actor } = {},
): Promise<ActionProposal> {
  const client = opts.client ?? defaultDb;
  try {
    // Returns normally for stale proposals so the stale marking and its event commit.
    await client.transaction(async (tx) => {
      const [row] = await tx.select().from(t.proposals).where(eq(t.proposals.id, proposalId)).for("update");
      if (!row) throw new ExecutionError("Proposal not found");
      if (row.status === "executed") return;
      if (row.status !== "approved") throw new ExecutionError(`Proposal is ${row.status}, not approved`);

      const [ev] = await tx.select().from(t.events).where(eq(t.events.id, row.eventId));
      if (!ev) throw new ExecutionError("Event not found");
      const approvals = (await approvalsFor(tx, [row.id])).get(row.id) ?? [];
      const humanApproved = approvals.length > 0 || row.proposedBy.kind === "user";
      const base = {
        db: tx,
        eventId: row.eventId,
        orgId: ev.orgId,
        now: nowUtc(),
        settings: ev.settings,
        approvedByRole:
          topRole(approvals.map((a) => a.role)) ??
          (row.proposedBy.kind === "user" ? row.proposedBy.role : null),
        humanApproved,
      };

      const children =
        row.kind === "plan.bundle"
          ? await tx
              .select()
              .from(t.proposals)
              .where(and(eq(t.proposals.parentId, row.id), eq(t.proposals.eventId, row.eventId)))
              .orderBy(asc(t.proposals.idempotencyKey))
          : [];
      const stale = await checkPreconditions(tx, row.eventId, [
        ...row.preconditions,
        ...children.flatMap((c) => c.preconditions),
      ]);
      if (stale.length) {
        await tx
          .update(t.proposals)
          .set({
            status: "stale",
            error: `Changed since proposed: ${stale.map((s) => `${s.entity} ${s.id}`).join(", ")}`,
          })
          .where(eq(t.proposals.id, row.id));
        if (children.length)
          await tx.update(t.proposals).set({ status: "stale" }).where(eq(t.proposals.parentId, row.id));
        await publish(tx, {
          eventId: row.eventId,
          type: "proposal.stale",
          entity: "proposals",
          entityId: row.id,
          actor: opts.actor ?? { kind: "system", eventId: row.eventId },
          payload: { proposalId: row.id, stale },
        });
        return;
      }

      const events: PublishInput[] = [];
      let undoData: Record<string, unknown> | undefined;
      if (row.kind === "plan.bundle") {
        const childUndo: Record<string, unknown> = {};
        for (const c of children) {
          childUndo[c.id] = (await runOne(tx, c, base, events)) ?? {};
          await tx
            .update(t.proposals)
            .set({
              status: "executed",
              executedAt: nowUtc(),
              undoData: (childUndo[c.id] as Record<string, unknown>) ?? null,
            })
            .where(eq(t.proposals.id, c.id));
        }
        undoData = { children: childUndo };
      } else {
        undoData = await runOne(tx, row, base, events);
      }

      const undoable = row.riskTier === "T1" && !!executorFor(row.kind as ActionKind)?.inverse;
      await tx
        .update(t.proposals)
        .set({
          status: "executed",
          executedAt: nowUtc(),
          undoUntil: undoable ? new Date(nowUtc().getTime() + UNDO_WINDOW_MS) : null,
          undoData: undoData ?? null,
          error: null,
        })
        .where(eq(t.proposals.id, row.id));
      await publish(tx, {
        eventId: row.eventId,
        type: "proposal.executed",
        entity: "proposals",
        entityId: row.id,
        actor: opts.actor ?? row.proposedBy,
        payload: { proposalId: row.id, kind: row.kind },
      });
      for (const e of events) await publish(tx, e);
    });
  } catch (err) {
    {
      const message = err instanceof ExecutionError ? err.message : "Execution failed";
      if (!(err instanceof ExecutionError)) log.error({ err, proposalId }, "executor crashed");
      await client.transaction(async (tx) => {
        const [row] = await tx.select().from(t.proposals).where(eq(t.proposals.id, proposalId));
        if (!row || row.status === "executed") return;
        await tx
          .update(t.proposals)
          .set({ status: "failed", error: message })
          .where(eq(t.proposals.id, proposalId));
        await publish(tx, {
          eventId: row.eventId,
          type: "proposal.failed",
          entity: "proposals",
          entityId: proposalId,
          actor: opts.actor ?? row.proposedBy,
          payload: { proposalId, error: message },
        });
      });
    }
  }
  return (await loadProposal(client, proposalId))!;
}

/** Undo an executed proposal inside its window. */
export async function undoProposal(
  proposalId: string,
  actor: Actor,
  client: Db = defaultDb,
): Promise<ActionProposal> {
  await client.transaction(async (tx) => {
    const [row] = await tx.select().from(t.proposals).where(eq(t.proposals.id, proposalId)).for("update");
    if (!row) throw new ExecutionError("Proposal not found");
    if (row.status !== "executed")
      throw new ExecutionError(`Only executed proposals can be undone (this one is ${row.status})`);
    if (!row.undoUntil || row.undoUntil.getTime() < nowUtc().getTime())
      throw new ExecutionError("The undo window has closed");
    const kind = row.kind as ActionKind;
    const ex = executorFor(kind);
    if (!ex?.inverse) throw new ExecutionError("This action cannot be undone");
    const [ev] = await tx.select().from(t.events).where(eq(t.events.id, row.eventId));
    const events: PublishInput[] = [];
    const ctx: ExecCtx = {
      db: tx,
      eventId: row.eventId,
      orgId: ev!.orgId,
      now: nowUtc(),
      settings: ev!.settings,
      proposalId: row.id,
      proposedBy: row.proposedBy,
      approvedByRole: null,
      humanApproved: true,
      emit: (e) => events.push({ ...e, eventId: row.eventId, actor }),
    };
    await ex.inverse(ActionPayloads[kind].parse(row.payload) as never, row.undoData ?? {}, ctx);
    await tx.update(t.proposals).set({ status: "undone", undoUntil: null }).where(eq(t.proposals.id, row.id));
    await audit(tx, {
      eventId: row.eventId,
      actor,
      action: `${kind}.undo`,
      entity: "proposals",
      entityId: row.id,
      proposalId: row.id,
    });
    await publish(tx, {
      eventId: row.eventId,
      type: "proposal.undone",
      entity: "proposals",
      entityId: row.id,
      actor,
      payload: { proposalId: row.id, kind },
    });
    for (const e of events) await publish(tx, e);
  });
  return (await loadProposal(client, proposalId))!;
}
