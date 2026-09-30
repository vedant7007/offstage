// Spend limits: per-run token budget, per-day USD cap, per-agent concurrency.
// ponytail: daily spend lives in process memory, so web and worker each count their own spend.
// Read and write the usage_budget row once Abhinav's schema lands so the cap is shared.

const env = process.env;
export const RUN_TOKEN_BUDGET = Number(env.AI_RUN_TOKEN_BUDGET ?? 30_000);
const DAILY_CAP_USD = Number(env.AI_DAILY_CAP_USD ?? 3);
const AGENT_CONCURRENCY = Number(env.AI_AGENT_CONCURRENCY ?? 2);

// TODO(time): swap for the IST day helper in src/lib/time.ts when it exists.
const istDay = (t = Date.now()) => new Date(t + 5.5 * 3600_000).toISOString().slice(0, 10);

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
  return spentUsd >= DAILY_CAP_USD;
}

export function spentToday(): { day: string; usd: number; capUsd: number } {
  rollDay();
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
  spentUsd = 0;
  day = istDay();
}
