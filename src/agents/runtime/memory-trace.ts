// In-memory TraceStore for tests and what-if runs, which must persist nothing but the whatif_runs row.

import { nowUtc } from "@/lib/time";
import { randomUUID } from "node:crypto";
import type { AgentRun, AgentStep } from "./contracts";
import type { TraceStore } from "./types";

export function memoryTrace() {
  const runs = new Map<string, AgentRun>();
  const steps = new Map<string, AgentStep[]>();
  const store: TraceStore = {
    startRun: async (run) => {
      const id = randomUUID();
      runs.set(id, { ...run, id });
      steps.set(id, []);
      return id;
    },
    addStep: async (runId, index, step) => {
      steps
        .get(runId)!
        .push({ ...step, id: randomUUID(), runId, index, at: nowUtc().toISOString() } as AgentStep);
    },
    finishRun: async (runId, patch) => {
      runs.set(runId, { ...runs.get(runId)!, ...patch });
    },
  };
  /** Steps of a run in index order (writes are fire-and-forget, so arrival order can differ). */
  const stepsOf = (runId: string) => [...(steps.get(runId) ?? [])].sort((a, b) => a.index - b.index);
  return { store, runs, stepsOf };
}
