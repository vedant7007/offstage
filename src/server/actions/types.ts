import type {
  ActionKind,
  ActionPayload,
  Actor,
  DiffEntry,
  EventSettings,
  Impact,
  Precondition,
  Role,
} from "@/contracts";
import type { Db } from "@/db/client";
import type { PublishInput } from "@/server/events/bus";

/** A database handle inside a transaction (or the pool for reads). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0] | Db;

export interface DescribeCtx {
  db: Tx;
  eventId: string;
  orgId: string;
  now: Date;
  settings: EventSettings;
}

export interface Description {
  diff: DiffEntry[];
  impact: Impact;
  preconditions: Precondition[];
}

export interface ExecCtx extends DescribeCtx {
  db: Tx;
  proposalId: string;
  /** Who proposed it. Executors never trust this for scope; the event is ctx.eventId. */
  proposedBy: Actor;
  /** Highest role among the human approvers, shown on messages ("approved by <role>"). */
  approvedByRole: Role | null;
  /** True when at least one human approved (emergency messages may then skip quiet hours). */
  humanApproved: boolean;
  /** Domain events to publish after the change, in the same transaction. */
  emit: (e: Omit<PublishInput, "eventId" | "actor">) => void;
}

export interface ExecResult {
  /** What the inverse needs to undo this execution (ids created, values replaced). */
  undoData?: Record<string, unknown>;
}

export interface Executor<K extends ActionKind> {
  kind: K;
  /** Diff, impact and the row versions the change depends on. Reads only. */
  describe: (payload: ActionPayload<K>, ctx: DescribeCtx) => Promise<Description>;
  /** Apply the change. Runs inside the proposal's transaction. */
  execute: (payload: ActionPayload<K>, ctx: ExecCtx) => Promise<ExecResult | void>;
  /** Undo within the undo window. Missing means the kind cannot be undone. */
  inverse?: (payload: ActionPayload<K>, undoData: Record<string, unknown>, ctx: ExecCtx) => Promise<void>;
}

export type AnyExecutor = Executor<ActionKind>;

export function impact(o: Partial<Impact> = {}): Impact {
  return { people: 0, attendees: 0, volunteers: 0, sessions: 0, channels: [], reversible: true, ...o };
}

/** Thrown by executors for business rule failures; the proposal ends as failed with this message. */
export class ExecutionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ExecutionError";
  }
}
