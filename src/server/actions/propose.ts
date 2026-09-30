/**
 * The only write door for agents (and the console): actions.propose(actor, input).
 * Validates, describes, tiers, stores and publishes. T0, and T1 when auto-approve is on, execute
 * straight away; everything else waits for humans.
 */
import { and, eq } from "drizzle-orm";
import {
  ACTION_KINDS,
  ActionPayloads,
  AGENT_DOMAIN,
  ProposeInput,
  ProposeResult,
  type ActionKind,
  type Actor,
  type DiffEntry,
  type Domain,
  type EventSettings,
  type Impact,
  type Precondition,
  type RiskTier,
} from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { logger } from "@/lib/logger";
import { nowUtc } from "@/lib/time";
import { can } from "@/server/authz/permissions";
import { publish } from "@/server/events/bus";
import { assignTier } from "@/server/policy/tiers";
import { executorFor } from "./executors";
import { executeProposal } from "./execute";
import { hashDiff, loadProposal } from "./rows";
import { ExecutionError, type Description } from "./types";

const log = logger.child({ module: "actions.propose" });

/** Proposals left untouched this long expire (unless the event sets another TTL). */
export const DEFAULT_TTL_MINUTES = 30;
export const UNDO_WINDOW_MINUTES = 10;

const KIND_DOMAIN: Record<string, Domain> = {
  plan: "planning",
  finance: "finance",
  sponsor: "sponsorship",
  marketing: "marketing",
  registration: "registrations",
  schedule: "schedule",
  speaker: "speakers",
  crew: "crew",
  logistics: "logistics",
  comms: "comms",
  helpdesk: "helpdesk",
  kb: "helpdesk",
  incident: "ops",
  certificates: "post_event",
  od: "post_event",
  report: "post_event",
  playbook: "post_event",
};

export function domainFor(kind: ActionKind, actor: Actor): Domain {
  if (actor.kind === "agent") return AGENT_DOMAIN[actor.agent];
  return KIND_DOMAIN[kind.split(".")[0]!] ?? "planning";
}

function invalid(issues: { path: string; message: string }[]): ProposeResult {
  return { status: "invalid", issues };
}

function mergeImpact(a: Impact, b: Impact): Impact {
  return {
    people: a.people + b.people,
    attendees: a.attendees + b.attendees,
    volunteers: a.volunteers + b.volunteers,
    sessions: a.sessions + b.sessions,
    moneyInr:
      a.moneyInr !== undefined || b.moneyInr !== undefined
        ? (a.moneyInr ?? 0) + (b.moneyInr ?? 0)
        : undefined,
    channels: [...new Set([...a.channels, ...b.channels])],
    reversible: a.reversible && b.reversible,
  };
}

/** An agent may only make the impact bigger than what the server computed, never smaller. */
function atLeast(server: Impact, claimed: Impact | undefined): Impact {
  if (!claimed) return server;
  return {
    people: Math.max(server.people, claimed.people),
    attendees: Math.max(server.attendees, claimed.attendees),
    volunteers: Math.max(server.volunteers, claimed.volunteers),
    sessions: Math.max(server.sessions, claimed.sessions),
    moneyInr: server.moneyInr ?? claimed.moneyInr,
    channels: [...new Set([...server.channels, ...claimed.channels])],
    reversible: server.reversible && claimed.reversible,
  };
}

interface Described extends Description {
  riskTier: RiskTier;
  requiredApprovals: number;
  facultyApprovalRequired: boolean;
  reasons: string[];
  children?: {
    kind: ActionKind;
    payload: unknown;
    summary: string;
    rationale: string;
    proposedBy?: string;
    d: Description;
    riskTier: RiskTier;
    requiredApprovals: number;
    reasons: string[];
  }[];
}

async function describeAll(
  kind: ActionKind,
  payload: unknown,
  ctx: { db: Db; eventId: string; orgId: string; now: Date; settings: EventSettings },
): Promise<Described> {
  if (kind === "plan.bundle") {
    const p = ActionPayloads["plan.bundle"].parse(payload);
    const children: NonNullable<Described["children"]> = [];
    let diff: DiffEntry[] = [];
    let imp: Impact = { people: 0, attendees: 0, volunteers: 0, sessions: 0, channels: [], reversible: true };
    let pre: Precondition[] = [];
    for (const c of p.children) {
      const childPayload = ActionPayloads[c.kind].parse(c.payload);
      const ex = executorFor(c.kind);
      if (!ex) throw new ExecutionError(`${c.kind} is not supported yet`);
      const d = await ex.describe(childPayload as never, ctx);
      const tier = assignTier({ kind: c.kind, payload: childPayload, impact: d.impact }, ctx.settings);
      children.push({
        kind: c.kind,
        payload: childPayload,
        summary: c.summary,
        rationale: c.rationale,
        proposedBy: c.proposedBy,
        d,
        riskTier: tier.riskTier,
        requiredApprovals: tier.requiredApprovals,
        reasons: tier.reasons,
      });
      diff = diff.concat(d.diff);
      imp = mergeImpact(imp, d.impact);
      pre = pre.concat(d.preconditions);
    }
    const tier = assignTier(
      { kind, payload: p, impact: imp, childTiers: children.map((c) => c.riskTier) },
      ctx.settings,
    );
    return { diff, impact: imp, preconditions: pre, ...tier, children };
  }
  const ex = executorFor(kind);
  if (!ex) throw new ExecutionError(`${kind} is not supported yet`);
  const d = await ex.describe(payload as never, ctx);
  const tier = assignTier({ kind, payload, impact: d.impact }, ctx.settings);
  return { ...d, ...tier };
}

async function autoApproveT1(db: Db, eventId: string, actor: Actor): Promise<boolean> {
  const [ev] = await db
    .select({ settings: t.events.settings })
    .from(t.events)
    .where(eq(t.events.id, eventId));
  if (ev && ev.settings.autoApproveT1 === false) return false;
  if (actor.kind !== "agent") return true;
  const [cfg] = await db
    .select({ auto: t.agentConfigs.autoApproveT1 })
    .from(t.agentConfigs)
    .where(and(eq(t.agentConfigs.eventId, eventId), eq(t.agentConfigs.agent, actor.agent)));
  return cfg?.auto ?? true;
}

export async function propose(actor: Actor, raw: unknown, client: Db = defaultDb): Promise<ProposeResult> {
  const parsed = ProposeInput.safeParse(raw);
  if (!parsed.success)
    return invalid(parsed.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })));
  const input = parsed.data;
  if (!(ACTION_KINDS as readonly string[]).includes(input.kind))
    return invalid([{ path: "kind", message: "Unknown kind" }]);

  const eventId = actor.eventId;
  if (!eventId) return invalid([{ path: "actor", message: "The actor is not bound to an event" }]);
  if (!can(actor, "proposal.create", { eventId }))
    return invalid([{ path: "actor", message: "Not allowed to propose here" }]);

  const [ev] = await client.select().from(t.events).where(eq(t.events.id, eventId));
  if (!ev) return invalid([{ path: "actor.eventId", message: "Event not found" }]);

  const [dup] = await client
    .select({ id: t.proposals.id })
    .from(t.proposals)
    .where(and(eq(t.proposals.eventId, eventId), eq(t.proposals.idempotencyKey, input.idempotencyKey)));
  if (dup) return { status: "duplicate", proposal: (await loadProposal(client, dup.id))! };

  const describeCtx = { db: client, eventId, orgId: ev.orgId, now: nowUtc(), settings: ev.settings };
  let d: Described;
  try {
    d = await describeAll(input.kind, input.payload, describeCtx);
  } catch (err) {
    if (err instanceof ExecutionError) return invalid([{ path: "payload", message: err.message }]);
    throw err;
  }
  const finalImpact = atLeast(d.impact, input.impact);
  // Re-tier if the proposer claimed a larger impact than we computed.
  if (finalImpact !== d.impact && input.kind !== "plan.bundle") {
    Object.assign(
      d,
      assignTier({ kind: input.kind, payload: input.payload, impact: finalImpact }, ev.settings),
    );
  }
  const diff = d.diff.length ? d.diff : (input.diff ?? []);

  if (actor.kind === "agent" && actor.simulation) {
    return {
      status: "simulated",
      kind: input.kind,
      summary: input.summary,
      riskTier: d.riskTier,
      impact: finalImpact,
      diff,
    };
  }

  const domain = domainFor(input.kind, actor);
  const ttl = ev.settings.proposalTtlMinutes ?? DEFAULT_TTL_MINUTES;
  const autoRun =
    d.riskTier === "T0" || (d.riskTier === "T1" && (await autoApproveT1(client, eventId, actor)));
  const diffHash = hashDiff(input.kind, input.payload, diff);

  const id = await client.transaction(async (tx) => {
    const [row] = await tx
      .insert(t.proposals)
      .values({
        eventId,
        createdAt: nowUtc(),
        kind: input.kind,
        payload: input.payload,
        proposedBy: actor,
        proposerAgent: actor.kind === "agent" ? actor.agent : null,
        planId: input.planId ?? null,
        parentId: input.parentId ?? null,
        domain,
        summary: input.summary,
        rationale: input.rationale,
        evidence: input.evidence,
        impact: finalImpact,
        diff,
        diffHash,
        riskTier: d.riskTier,
        tierReasons: d.reasons,
        requiredApprovals: d.requiredApprovals,
        facultyApprovalRequired: d.facultyApprovalRequired,
        status: autoRun ? "approved" : "pending",
        idempotencyKey: input.idempotencyKey,
        preconditions: d.preconditions,
        expiresAt: new Date(nowUtc().getTime() + ttl * 60_000),
      })
      .returning({ id: t.proposals.id });
    const proposalId = row!.id;
    for (const [i, c] of (d.children ?? []).entries()) {
      await tx.insert(t.proposals).values({
        eventId,
        createdAt: nowUtc(),
        kind: c.kind,
        payload: c.payload,
        proposedBy:
          c.proposedBy && actor.kind === "agent" ? { ...actor, agent: c.proposedBy as never } : actor,
        proposerAgent: c.proposedBy ?? (actor.kind === "agent" ? actor.agent : null),
        parentId: proposalId,
        planId: input.planId ?? null,
        domain: c.proposedBy
          ? AGENT_DOMAIN[c.proposedBy as keyof typeof AGENT_DOMAIN]
          : domainFor(c.kind, actor),
        summary: c.summary,
        rationale: c.rationale,
        evidence: [],
        impact: c.d.impact,
        diff: c.d.diff,
        diffHash: hashDiff(c.kind, c.payload, c.d.diff),
        riskTier: c.riskTier,
        tierReasons: c.reasons,
        requiredApprovals: c.requiredApprovals,
        facultyApprovalRequired: false,
        status: autoRun ? "approved" : "pending",
        idempotencyKey: `${input.idempotencyKey}#${i}`,
        preconditions: c.d.preconditions,
        expiresAt: new Date(nowUtc().getTime() + ttl * 60_000),
      });
    }
    await publish(tx, {
      eventId,
      type: "proposal.created",
      entity: "proposals",
      entityId: proposalId,
      actor,
      payload: {
        proposalId,
        kind: input.kind,
        riskTier: d.riskTier,
        status: autoRun ? "approved" : "pending",
      },
    });
    return proposalId;
  });

  log.info({ proposalId: id, kind: input.kind, riskTier: d.riskTier, autoRun }, "proposal created");
  const proposal = autoRun ? await executeProposal(id, { client }) : (await loadProposal(client, id))!;
  return { status: "created", proposal };
}
