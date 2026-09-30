// Tier -> ordered provider chain. Order comes from AI_PROFILE (docs/decisions/ADR-001-model-access.md)
// and can be overridden per tier with AI_CHAIN_<TIER>=groq,bedrock,ollama.

export type Tier = "smart" | "fast" | "guard" | "stt";
export type Provider = "groq" | "bedrock" | "ollama";
export type Link = { provider: Provider; model: string };

const env = process.env;

// Groq ids verified 2026-09-30 at console.groq.com/docs/models. Prompt Guard 2 is a preview model and may vanish.
const GROQ_MODELS: Record<Tier, string> = {
  smart: "openai/gpt-oss-120b",
  fast: "openai/gpt-oss-20b",
  guard: "meta-llama/llama-prompt-guard-2-86m",
  stt: "whisper-large-v3-turbo",
};
// ap-south-1 only reaches Nova 2 Lite through the global cross-region profile (AWS model card, 2026-09-30).
const BEDROCK_MODEL = env.BEDROCK_MODEL_ID || "global.amazon.nova-2-lite-v1:0";
// Largest Qwen3 that stays 100% on a 6 GB GPU at 8k context (qwen3:8b spills 16% to CPU, 15 tok/s vs 55).
const OLLAMA_MODEL = env.OLLAMA_MODEL || "qwen3:4b-instruct";
export const OLLAMA_BASE_URL = env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

const MODELS: Record<Provider, Partial<Record<Tier, string>>> = {
  groq: GROQ_MODELS,
  bedrock: { smart: BEDROCK_MODEL, fast: BEDROCK_MODEL },
  ollama: { smart: OLLAMA_MODEL, fast: OLLAMA_MODEL },
};

const ORDERS: Record<"dev" | "demo", Record<Tier, Provider[]>> = {
  // dev saves Groq's free daily tokens: local model first.
  dev: { smart: ["ollama", "groq"], fast: ["ollama", "groq"], guard: ["groq"], stt: ["groq"] },
  demo: {
    smart: ["bedrock", "groq", "ollama"],
    fast: ["groq", "bedrock", "ollama"],
    guard: ["groq"],
    stt: ["groq"],
  },
};

export function profile(): "dev" | "demo" {
  return env.AI_PROFILE === "demo" ? "demo" : "dev";
}

function order(tier: Tier): Provider[] {
  const override = env[`AI_CHAIN_${tier.toUpperCase()}`];
  if (!override) return ORDERS[profile()][tier];
  return override
    .split(",")
    .map((s) => s.trim())
    .filter((s): s is Provider => s in MODELS);
}

let ollamaUp = false;

export async function probeOllama(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(2000) });
    ollamaUp = res.ok;
  } catch {
    ollamaUp = false;
  }
  return ollamaUp;
}

void probeOllama();
setInterval(probeOllama, 60_000).unref();

export function available(p: Provider): boolean {
  if (p === "groq") return Boolean(env.GROQ_API_KEY);
  if (p === "bedrock")
    return Boolean(env.AWS_BEARER_TOKEN_BEDROCK || (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY));
  return ollamaUp;
}

/** Configured chain for a tier, before availability filtering. */
export function configuredChain(tier: Tier): Link[] {
  return order(tier).flatMap((provider) => {
    const model = MODELS[provider][tier];
    return model ? [{ provider, model }] : [];
  });
}

/** Available chain for a tier. With `only`, that provider alone, even if the profile's order leaves it out. */
export function chain(tier: Tier, only?: Provider): Link[] {
  const links = only
    ? MODELS[only][tier]
      ? [{ provider: only, model: MODELS[only][tier]! }]
      : []
    : configuredChain(tier);
  return links.filter((l) => available(l.provider));
}
