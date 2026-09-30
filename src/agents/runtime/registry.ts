// Registry of agent configs, and wake(): the one way a run starts. Respects per-agent enabled flags
// and the per-event kill switch before anything else happens.

import type { AgentName, AgentTrigger } from "./contracts";
import { runAgent, type RunInput, type RunResult } from "./run";
import type { AgentConfig, RuntimeDeps } from "./types";

/** Read from agent_configs and the kill switch in production; plain functions in tests. */
export type Gate = {
  enabled: (eventId: string, agent: AgentName) => Promise<boolean>;
  killSwitch: (eventId: string) => Promise<boolean>;
};

export type WakeResult = RunResult | { skipped: "unknown_agent" | "disabled" | "kill_switch" };

const configs = new Map<AgentName, AgentConfig<never>>();

export function register<S>(config: AgentConfig<S>) {
  configs.set(config.name, config as unknown as AgentConfig<never>);
}

export function registered(): AgentConfig<never>[] {
  return [...configs.values()];
}

export function _clearRegistry() {
  configs.clear();
}

export async function wake<S>(
  agent: AgentName,
  trigger: AgentTrigger,
  input: RunInput,
  deps: RuntimeDeps<S>,
  gate: Gate,
  opts: { simulation?: boolean } = {},
): Promise<WakeResult> {
  const config = configs.get(agent) as AgentConfig<S> | undefined;
  if (!config) return { skipped: "unknown_agent" };
  // What-if runs ignore the switches: they persist nothing and must show what an agent would do.
  if (!opts.simulation) {
    if (await gate.killSwitch(input.eventId)) return { skipped: "kill_switch" };
    if (!(await gate.enabled(input.eventId, agent))) return { skipped: "disabled" };
  }
  return runAgent(config, trigger, input, deps, opts);
}
