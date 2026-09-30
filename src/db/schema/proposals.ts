import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  real,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Actor, AgentTrigger, DiffEntry, Evidence, Impact, Precondition } from "@/contracts";
import { createdAt, pk, ts, updatedAt, version } from "./_columns";
import { events, users } from "./core";

const eventRef = () =>
  text()
    .notNull()
    .references(() => events.id, { onDelete: "cascade" });

export const proposals = pgTable(
  "proposals",
  {
    id: pk(),
    eventId: eventRef(),
    kind: text().notNull(),
    payload: jsonb().$type<unknown>().notNull(),
    proposedBy: jsonb().$type<Actor>().notNull(),
    /** Denormalised from proposedBy for filtering; null when a human or the system proposed. */
    proposerAgent: text(),
    planId: text(),
    parentId: text(),
    domain: text().notNull(),
    summary: text().notNull(),
    rationale: text().notNull().default(""),
    evidence: jsonb().$type<Evidence[]>().notNull().default([]),
    impact: jsonb().$type<Impact>().notNull(),
    diff: jsonb().$type<DiffEntry[]>().notNull().default([]),
    diffHash: text().notNull(),
    riskTier: text().notNull(),
    tierReasons: jsonb().$type<string[]>().notNull().default([]),
    requiredApprovals: integer().notNull(),
    facultyApprovalRequired: boolean().notNull().default(false),
    status: text().notNull().default("pending"),
    idempotencyKey: text().notNull(),
    preconditions: jsonb().$type<Precondition[]>().notNull().default([]),
    expiresAt: ts().notNull(),
    executedAt: ts(),
    undoUntil: ts(),
    /** State the executor needs to undo (for example the rows it created). */
    undoData: jsonb().$type<Record<string, unknown>>(),
    error: text(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex().on(t.eventId, t.idempotencyKey),
    index().on(t.eventId, t.status, t.createdAt),
    index().on(t.parentId),
    index().on(t.eventId, t.domain, t.status),
  ],
);

export const proposalApprovals = pgTable(
  "proposal_approvals",
  {
    id: pk(),
    eventId: eventRef(),
    proposalId: text()
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id),
    role: text().notNull(),
    diffHash: text().notNull(),
    at: createdAt(),
  },
  (t) => [uniqueIndex().on(t.proposalId, t.userId)],
);

export const agentRuns = pgTable(
  "agent_runs",
  {
    id: pk(),
    eventId: eventRef(),
    agent: text().notNull(),
    trigger: jsonb().$type<AgentTrigger>().notNull(),
    status: text().notNull().default("running"),
    simulation: boolean().notNull().default(false),
    modelTier: text().notNull(),
    startedAt: createdAt(),
    finishedAt: ts(),
    stepCount: integer().notNull().default(0),
    proposalIds: text().array().notNull().default([]),
    inputTokens: integer().notNull().default(0),
    outputTokens: integer().notNull().default(0),
    costUsd: numeric({ precision: 12, scale: 6, mode: "number" }).notNull().default(0),
    latencyMs: integer(),
    error: text(),
  },
  (t) => [index().on(t.eventId, t.startedAt), index().on(t.eventId, t.agent, t.startedAt)],
);

export const agentSteps = pgTable(
  "agent_steps",
  {
    id: pk(),
    eventId: eventRef(),
    runId: text()
      .notNull()
      .references(() => agentRuns.id, { onDelete: "cascade" }),
    index: integer().notNull(),
    kind: text().notNull(),
    /** The full AgentStep minus id, runId, index and at; already redacted by the runtime. */
    data: jsonb().$type<Record<string, unknown>>().notNull(),
    costUsd: real(),
    at: createdAt(),
  },
  (t) => [uniqueIndex().on(t.runId, t.index)],
);
