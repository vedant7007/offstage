/**
 * The platform side of the agent runtime (issue #17): where traces go, whether an agent may
 * run, and the dependencies the runtime needs, all bound to one event.
 */
import { memoryTrace } from "@/agents/runtime/memory-trace";
import { and, eq } from "drizzle-orm";
import type { Gate } from "@/agents/runtime/registry";
import type { ReadServices } from "@/agents/runtime/services";
import type { NewStep, RuntimeDeps, TraceStore } from "@/agents/runtime/types";
import type { AgentActor, AgentName, AgentRun, ProposeInputRaw } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { propose } from "@/server/actions/propose";
import { createReadServices } from "./world";

/** agent_runs and agent_steps. Steps arrive already redacted by the runtime. */
export function dbTraceStore(client: Db = defaultDb): TraceStore {
  const eventOfRun = new Map<string, string>();
  return {
    async startRun(run: Omit<AgentRun, "id">) {
      const [row] = await client
        .insert(t.agentRuns)
        .values({
          eventId: run.eventId,
          agent: run.agent,
          trigger: run.trigger,
          status: run.status,
          simulation: run.simulation,
          modelTier: run.modelTier,
          startedAt: new Date(run.startedAt),
          finishedAt: run.finishedAt ? new Date(run.finishedAt) : null,
          stepCount: run.stepCount,
          proposalIds: run.proposalIds,
          inputTokens: run.inputTokens,
          outputTokens: run.outputTokens,
          costUsd: run.costUsd,
          latencyMs: run.latencyMs ?? null,
          error: run.error ?? null,
        })
        .returning({ id: t.agentRuns.id });
      eventOfRun.set(row!.id, run.eventId);
      return row!.id;
    },
    async addStep(runId: string, index: number, step: NewStep) {
      let eventId = eventOfRun.get(runId);
      if (!eventId) {
        const [r] = await client
          .select({ eventId: t.agentRuns.eventId })
          .from(t.agentRuns)
          .where(eq(t.agentRuns.id, runId));
        eventId = r?.eventId;
      }
      if (!eventId) throw new Error(`Unknown agent run ${runId}`);
      const { kind, ...data } = step;
      await client.insert(t.agentSteps).values({
        eventId,
        runId,
        index,
        kind,
        data: data as Record<string, unknown>,
        costUsd: kind === "llm" && "costUsd" in data ? (data.costUsd as number) : null,
      });
    },
    async finishRun(runId: string, patch: Partial<AgentRun>) {
      const set: Partial<typeof t.agentRuns.$inferInsert> = {};
      if (patch.status) set.status = patch.status;
      if (patch.finishedAt) set.finishedAt = new Date(patch.finishedAt);
      if (patch.stepCount !== undefined) set.stepCount = patch.stepCount;
      if (patch.proposalIds) set.proposalIds = patch.proposalIds;
      if (patch.inputTokens !== undefined) set.inputTokens = patch.inputTokens;
      if (patch.outputTokens !== undefined) set.outputTokens = patch.outputTokens;
      if (patch.costUsd !== undefined) set.costUsd = patch.costUsd;
      if (patch.latencyMs !== undefined) set.latencyMs = patch.latencyMs;
      if (patch.error !== undefined) set.error = patch.error;
      if (Object.keys(set).length) await client.update(t.agentRuns).set(set).where(eq(t.agentRuns.id, runId));
      eventOfRun.delete(runId);
    },
  };
}

/** Per-agent enabled flags (agent_configs) and the per-event kill switch (events.agents_enabled). */
export function dbGate(client: Db = defaultDb): Gate {
  return {
    async enabled(eventId: string, agent: AgentName) {
      const [c] = await client
        .select({ enabled: t.agentConfigs.enabled })
        .from(t.agentConfigs)
        .where(and(eq(t.agentConfigs.eventId, eventId), eq(t.agentConfigs.agent, agent)));
      return c?.enabled ?? false;
    },
    async killSwitch(eventId: string) {
      const [e] = await client
        .select({ on: t.events.agentsEnabled })
        .from(t.events)
        .where(eq(t.events.id, eventId));
      return !(e?.on ?? false);
    },
  };
}

/** Trusted facts for prompts: what the event is. Numbers stay out; agents read them via services. */
async function eventContext(_eventId: string, services: ReadServices): Promise<string> {
  const ev = await services.event();
  const rooms = await services.rooms();
  return [
    `${ev.name} (${ev.type.replace(/_/g, " ")}), ${ev.venue.name}, ${ev.venue.city}.`,
    `Runs ${ev.startsAt} to ${ev.endsAt} (UTC; show times in IST).`,
    `Rooms: ${rooms.map((r) => `${r.name} (${r.capacity} seats)`).join(", ")}.`,
    ev.settings.facultyApproverRequired ? "Official notices need faculty approval." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Everything the agent runtime needs for one event. */
export function runtimeDepsFor(eventId: string, client: Db = defaultDb): RuntimeDeps<ReadServices> {
  const readActor: AgentActor = { kind: "agent", agent: "commander", runId: "read", eventId };
  return {
    propose: (actor: AgentActor, input: ProposeInputRaw) => {
      if (actor.eventId !== eventId) throw new Error("Agent actor bound to another event");
      return propose(actor, input, client);
    },
    trace: dbTraceStore(client),
    services: createReadServices(readActor, { client }),
    eventContext,
  };
}

/**
 * What-if: agents run over a snapshot, proposals come back "simulated" (propose never writes for a
 * simulation actor), and traces stay in memory so nothing reaches the real timeline.
 */
export function simulationDeps(
  eventId: string,
  services: ReadServices,
  client: Db = defaultDb,
): RuntimeDeps<ReadServices> {
  return {
    propose: (actor: AgentActor, input: ProposeInputRaw) => {
      if (actor.eventId !== eventId || !actor.simulation)
        throw new Error("Simulation deps need a simulation actor");
      return propose(actor, input, client);
    },
    trace: memoryTrace().store,
    services,
    eventContext,
  };
}

/** Events whose agents should run on schedules: the ones that are live or being planned. */
export async function activeEventIds(client: Db = defaultDb): Promise<string[]> {
  const rows = await client
    .select({ id: t.events.id, status: t.events.status, on: t.events.agentsEnabled })
    .from(t.events);
  return rows.filter((r) => r.on && (r.status === "live" || r.status === "planning")).map((r) => r.id);
}
