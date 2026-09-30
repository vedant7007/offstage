// Spend limits: per-run token budget, per-day USD cap, per-agent concurrency.
// The daily cap is shared through a SpendStore (the usage_budget table) when one is plugged in with
// useSpendStore(); without one, each process counts its own spend in memory.

import { istDateKey } from "@/lib/time";

const env = process.env;
export const RUN_TOKEN_BUDGET = Number(env.AI_RUN_TOKEN_BUDGET ?? 30_000);
const DAILY_CAP_USD = Number(env.AI_DAILY_CAP_USD ?? 3);
const AGENT_CONCURRENCY = Number(env.AI_AGENT_CONCURRENCY ?? 2);

const istDay = () => istDateKey(Date.now());

/** Shared spend for today. Abhinav's getUsage/addUsage over usage_budget, bound to an org or event. */
export type SpendStore = {
  get: () => Promise<{ spentUsd: number; capUsd: number }>;
  add: (usd: number) => Promise<{ spentUsd: number; capUsd: number }>;
};
const REFRESH_MS = 30_000;
let store: SpendStore | undefined;
let shared: { spentUsd: number; capUsd: number; at: number; day: string } | undefined;

const remember = (u: { spentUsd: number; capUsd: number }) =>
  (shared = { ...u, at: Date.now(), day: istDay() });
function refresh() {
  store?.get().then(remember, () => undefined); // a failed read keeps the last known value
}

/** Plug in the shared store once at startup (worker and web). */
export function useSpendStore(s: SpendStore | undefined) {
  store = s;
  shared = undefined;
  refresh();
}

const runTokens = new Map<string, number>();
let day = istDay();
let spentUsd = 0;

function rollDay() {
  const today = istDay();
  if (today !== day) {
    day = today;
    spentUsd = 0;
  }
}

export function recordUsage(runId: string, tokens: number, usd: number) {
  rollDay();
  spentUsd += usd;
  if (store && usd > 0) store.add(usd).then(remember, () => undefined);
  runTokens.set(runId, (runTokens.get(runId) ?? 0) + tokens);
}

export function runTokensLeft(runId: string, budget = RUN_TOKEN_BUDGET): number {
  return budget - (runTokens.get(runId) ?? 0);
}

/** Call when a run finishes so the map does not grow forever. */
export function endRun(runId: string) {
  runTokens.delete(runId);
}

export function dailyCapHit(): boolean {
  rollDay();
  if (store && (!shared || Date.now() - shared.at > REFRESH_MS)) refresh();
  const sharedHit = shared?.day === day && shared.spentUsd >= shared.capUsd;
  return sharedHit || spentUsd >= DAILY_CAP_USD;
}

export function spentToday(): { day: string; usd: number; capUsd: number } {
  rollDay();
  if (shared?.day === day) return { day, usd: Math.max(spentUsd, shared.spentUsd), capUsd: shared.capUsd };
  return { day, usd: spentUsd, capUsd: DAILY_CAP_USD };
}

const running = new Map<string, number>();
const waiting = new Map<string, (() => void)[]>();

/** Runs fn once the agent has a free slot (default 2 concurrent runs per agent). */
export async function withAgentSlot<T>(agent: string, fn: () => Promise<T>): Promise<T> {
  if ((running.get(agent) ?? 0) >= AGENT_CONCURRENCY) {
    // The finishing run hands its slot straight to us, so the count is already right.
    await new Promise<void>((resolve) => waiting.set(agent, [...(waiting.get(agent) ?? []), resolve]));
  } else {
    running.set(agent, (running.get(agent) ?? 0) + 1);
  }
  try {
    return await fn();
  } finally {
    const next = waiting.get(agent)?.shift();
    if (next) next();
    else running.set(agent, (running.get(agent) ?? 1) - 1);
  }
}

/** Test hook. */
export function _resetBudget() {
  runTokens.clear();
  store = undefined;
  shared = undefined;
  spentUsd = 0;
  day = istDay();
}
