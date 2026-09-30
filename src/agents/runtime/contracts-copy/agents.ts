// Verbatim copy of src/contracts/agents.ts from abhinav/contracts @ b3e2fa7 (PR #5). Delete this folder when PR #5 merges.
import { z } from "zod";
import { Id, IsoDateTime } from "./common";
import { AgentName, Domain, Role } from "./identity";
import { ActionKind, ProposalStatus } from "./proposals";

export const ModelTier = z.enum(["smart", "fast", "guard", "stt"]);
export type ModelTier = z.infer<typeof ModelTier>;

export const ModelProvider = z.enum(["groq", "bedrock", "ollama"]);
export type ModelProvider = z.infer<typeof ModelProvider>;

export const AgentTrigger = z.object({
  type: z.enum(["domain_event", "schedule", "command", "manual", "whatif"]),
  ref: z.string().max(200).optional().describe("Domain event id, schedule name, or command id"),
  eventType: z.string().max(80).optional().describe("Domain event type when type is 'domain_event'"),
});
export type AgentTrigger = z.infer<typeof AgentTrigger>;

export const AgentRunStatus = z.enum([
  "running",
  "succeeded",
  "failed",
  "fallback",
  "budget_paused",
  "killed",
]);
export type AgentRunStatus = z.infer<typeof AgentRunStatus>;

export const AgentRun = z.object({
  id: Id,
  eventId: Id,
  agent: AgentName,
  trigger: AgentTrigger,
  status: AgentRunStatus,
  simulation: z.boolean(),
  modelTier: ModelTier.exclude(["stt"]),
  startedAt: IsoDateTime,
  finishedAt: IsoDateTime.optional(),
  stepCount: z.int().nonnegative(),
  proposalIds: z.array(Id),
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  costUsd: z.number().nonnegative(),
  latencyMs: z.int().nonnegative().optional(),
  error: z.string().max(2000).optional(),
});
export type AgentRun = z.infer<typeof AgentRun>;

const StepBase = z.object({
  id: Id,
  runId: Id,
  index: z.int().nonnegative().describe("Order within the run, from 0"),
  at: IsoDateTime,
});

/** One model call attempt, exactly as the router reports it (src/ai/router Attempt). */
export const LlmStep = StepBase.extend({
  kind: z.literal("llm"),
  tier: ModelTier,
  provider: ModelProvider,
  model: z.string().max(120),
  ok: z.boolean(),
  inputTokens: z.int().nonnegative(),
  outputTokens: z.int().nonnegative(),
  latencyMs: z.int().nonnegative(),
  costUsd: z.number().nonnegative(),
  error: z.string().max(2000).optional(),
});

export const ToolStep = StepBase.extend({
  kind: z.literal("tool"),
  tool: z.string().max(80),
  input: z.unknown().describe("Redacted with the logger rules before storing"),
  output: z.unknown().describe("Redacted and truncated before storing"),
  ok: z.boolean(),
  latencyMs: z.int().nonnegative(),
  error: z.string().max(2000).optional(),
});

export const ProposeStep = StepBase.extend({
  kind: z.literal("propose"),
  actionKind: ActionKind,
  proposalId: Id.optional().describe("Missing when propose() rejected the input"),
  result: z.enum(["created", "duplicate", "simulated", "invalid"]),
  status: ProposalStatus.optional(),
  issues: z.array(z.string().max(400)).optional(),
});

export const GuardStep = StepBase.extend({
  kind: z.literal("guard"),
  verdict: z.enum(["allow", "flag", "block"]),
  reasons: z.array(z.string().max(200)),
  score: z.number(),
  by: z.enum(["heuristics", "prompt_guard", "classifier", "heuristics_only"]),
});

export const FallbackStep = StepBase.extend({
  kind: z.literal("fallback"),
  reason: z.enum(["no_provider", "all_failed", "bad_output", "budget_run", "budget_paused", "error"]),
  message: z.string().max(2000),
});

export const NoteStep = StepBase.extend({
  kind: z.literal("note"),
  text: z.string().max(2000).describe("Free-form trace note, e.g. 'woke scheduler, crew_chief'"),
});

export const AgentStep = z.discriminatedUnion("kind", [
  LlmStep,
  ToolStep,
  ProposeStep,
  GuardStep,
  FallbackStep,
  NoteStep,
]);
export type AgentStep = z.infer<typeof AgentStep>;

export const AgentHealth = z.enum(["healthy", "degraded", "failing", "paused", "disabled"]);
export type AgentHealth = z.infer<typeof AgentHealth>;

/** One card on the agent org chart. */
export const AgentConfigSummary = z.object({
  name: AgentName,
  domain: Domain,
  humanLeadRole: Role,
  humanLeadUserId: Id.optional(),
  humanLeadName: z.string().max(120).optional(),
  mandate: z.string().max(200).optional(),
  enabled: z.boolean(),
  autoApproveT1: z.boolean(),
  modelTier: ModelTier.exclude(["stt", "guard"]),
  health: AgentHealth,
  lastRunAt: IsoDateTime.optional(),
  pendingApprovals: z.int().nonnegative(),
  runsToday: z.int().nonnegative(),
  costUsdToday: z.number().nonnegative(),
});
export type AgentConfigSummary = z.infer<typeof AgentConfigSummary>;
