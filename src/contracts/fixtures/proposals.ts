import type { Actor, Domain } from "../identity";
import {
  ActionPayloads,
  ActionProposal,
  type ActionKind,
  type ActionPayloadInput,
  type Approval,
  type DiffEntry,
  type Evidence,
  type Impact,
  type Precondition,
  type ProposalStatus,
  type RiskTier,
} from "../proposals";
import { addMinutesIso, hash32, stableId } from "./rng";

export interface MakeProposalInput<K extends ActionKind> {
  kind: K;
  payload: ActionPayloadInput<K>;
  eventId: string;
  proposedBy: Actor;
  domain: Domain;
  summary: string;
  createdAt: string;
  riskTier: RiskTier;
  id?: string;
  rationale?: string;
  evidence?: Evidence[];
  impact?: Partial<Impact>;
  diff?: DiffEntry[];
  tierReasons?: string[];
  requiredApprovals?: number;
  approvals?: Approval[];
  facultyApprovalRequired?: boolean;
  status?: ProposalStatus;
  preconditions?: Precondition[];
  planId?: string;
  parentId?: string;
  executedAt?: string;
  undoUntil?: string;
  error?: string;
}

const DEFAULT_APPROVALS: Record<RiskTier, number> = { T0: 0, T1: 0, T2: 1, T3: 2 };

/** Stable short hash of a diff, the same shape the proposal engine produces. */
export function diffHashOf(diff: DiffEntry[]): string {
  const s = JSON.stringify(diff);
  return `${hash32(s).toString(16).padStart(8, "0")}${hash32(`x${s}`).toString(16).padStart(8, "0")}`;
}

/** Build a valid ActionProposal with sensible defaults. Throws if the result breaks the contract. */
export function makeProposal<K extends ActionKind>(input: MakeProposalInput<K>): ActionProposal {
  const payload = ActionPayloads[input.kind].parse(input.payload);
  const diff = input.diff ?? [];
  const id = input.id ?? stableId(`proposal:${input.eventId}`, `${input.kind}:${input.summary}`);
  return ActionProposal.parse({
    id,
    eventId: input.eventId,
    kind: input.kind,
    payload,
    proposedBy: input.proposedBy,
    planId: input.planId,
    parentId: input.parentId,
    domain: input.domain,
    summary: input.summary,
    rationale: input.rationale ?? "",
    evidence: input.evidence ?? [],
    impact: {
      people: 0,
      attendees: 0,
      volunteers: 0,
      sessions: 0,
      channels: [],
      reversible: true,
      ...input.impact,
    },
    diff,
    diffHash: diffHashOf(diff),
    riskTier: input.riskTier,
    tierReasons: input.tierReasons ?? [],
    requiredApprovals: input.requiredApprovals ?? DEFAULT_APPROVALS[input.riskTier],
    approvals: input.approvals ?? [],
    facultyApprovalRequired: input.facultyApprovalRequired ?? false,
    status: input.status ?? "pending",
    idempotencyKey: `fixture:${id}`,
    preconditions: input.preconditions ?? [],
    expiresAt: addMinutesIso(input.createdAt, 30),
    createdAt: input.createdAt,
    executedAt: input.executedAt,
    undoUntil: input.undoUntil,
    error: input.error,
  });
}
