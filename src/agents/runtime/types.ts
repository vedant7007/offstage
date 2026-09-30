// One engine, fourteen configs. An agent is data: purpose, prompt, tools, triggers, limits, fallback.

import type { z } from "zod";
import type { Attempt } from "@/ai/router/router";
import type { Verdict } from "@/ai/guard";
import type {
  ActionKind,
  AgentActor,
  AgentName,
  AgentRun,
  AgentStep,
  AgentTrigger,
  Domain,
  DomainEventType,
  ProposeInputRaw,
  ProposeResult,
  Role,
} from "./contracts";

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
/**
 * A proposal as an agent writes it. The runtime adds the idempotency key. `dedupeKey` replaces the trigger in
 * that key, for agents that see the same situation through many events (twelve lunch questions, one incident).
 */
export type AgentProposal = DistributiveOmit<ProposeInputRaw, "idempotencyKey"> & { dedupeKey?: string };

/** What an agent run can see. `S` is the read-service surface: real services, a what-if snapshot, or a fake. */
export type RunContext<S> = {
  eventId: string;
  actor: AgentActor;
  trigger: AgentTrigger;
  /** Trigger data. When `untrusted` is set it only ever reaches the model wrapped as data. */
  payload: unknown;
  untrusted: boolean;
  services: S;
  simulation: boolean;
  /** Traced propose with the runtime's idempotency key. For tools that build deterministic proposals. */
  propose: (p: AgentProposal) => Promise<ProposeResult>;
};

/** A read tool: zod input, one-line description, compact JSON out. Never writes. */
export type ToolDef<S> = {
  name: string;
  description: string;
  input: z.ZodType;
  run: (input: never, ctx: RunContext<S>) => Promise<unknown>;
};

export type TriggerDef =
  | { type: "domain_event"; eventType: DomainEventType }
  | { type: "schedule"; name: string; cron: string }
  | { type: "command" };

export type AgentConfig<S = unknown> = {
  name: AgentName;
  purpose: string;
  humanLeadRole: Role;
  domain: Domain;
  modelTier: "smart" | "fast";
  tools: ToolDef<S>[];
  /** Action kinds this agent may propose. The propose tool refuses anything else. */
  actions: ActionKind[];
  systemPrompt: (ctx: RunContext<S>) => string;
  triggers: TriggerDef[];
  maxSteps: number;
  criticality: "critical" | "normal";
  /** Every run must end in a proposal (a disruption always needs a plan): if the model proposes nothing, the fallback runs. */
  mustPropose?: boolean;
  /** Rules-only path when models fail or the budget pauses the agent. */
  fallback: (ctx: RunContext<S>) => Promise<AgentProposal[]>;
  /**
   * Replaces the model tool loop for fixed pipelines (Helpdesk). The runtime still screens untrusted input,
   * traces, budgets and falls back. Model calls must pass io.onAttempt so they are traced.
   */
  pipeline?: (ctx: RunContext<S>, io: PipelineIO) => Promise<{ text?: string; output?: unknown }>;
};

type NewStep = AgentStep extends infer T
  ? T extends AgentStep
    ? Omit<T, "id" | "runId" | "index" | "at">
    : never
  : never;

export type PipelineIO = {
  runId: string;
  critical: boolean;
  onAttempt: (a: Attempt) => void;
  /** The guard verdict on untrusted input, when there was any. */
  guard?: Verdict;
};

/** Where runs and steps go: agent_runs / agent_steps in production, memory in tests and what-if. */
export type TraceStore = {
  startRun: (run: Omit<AgentRun, "id">) => Promise<string>;
  addStep: (runId: string, index: number, step: NewStep) => Promise<void>;
  finishRun: (runId: string, patch: Partial<AgentRun>) => Promise<void>;
};
export type { NewStep };

/** Everything the runtime needs from the platform. Injected, so tests and simulation swap it out. */
export type RuntimeDeps<S> = {
  propose: (actor: AgentActor, input: ProposeInputRaw) => Promise<ProposeResult>;
  trace: TraceStore;
  services: S;
  /** Trusted facts for the prompt: event summary, template rules, playbook lessons for this event type. */
  eventContext: (eventId: string, services: S) => Promise<string>;
};
