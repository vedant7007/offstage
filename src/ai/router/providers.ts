import { groq } from "@ai-sdk/groq";
import { bedrock } from "@ai-sdk/amazon-bedrock";
import { createOllama } from "ai-sdk-ollama";
import type { LanguageModel } from "ai";
import { OLLAMA_BASE_URL, type Link, type Tier } from "./tiers";

// Groq and Bedrock read their credentials and region from env (GROQ_API_KEY, AWS_*).
const ollama = createOllama({ baseURL: OLLAMA_BASE_URL });

export function languageModel(link: Link): LanguageModel {
  if (link.provider === "groq") return groq(link.model);
  if (link.provider === "bedrock") return bedrock(link.model);
  return ollama(link.model, {
    options: { num_ctx: 8192 },
    think: false,
    structuredOutputs: true,
    // The router owns retries and step limits; the provider's own tool retry loop would hide calls from traces.
    reliableToolCalling: false,
    keep_alive: "30m",
  });
}

export function providerOptions(link: Link, tier: Tier) {
  // Only the gpt-oss chat models take reasoning effort; Prompt Guard rejects it with a 400.
  if (link.provider !== "groq" || (tier !== "smart" && tier !== "fast")) return undefined;
  // gpt-oss reasoning tokens count toward the 8K TPM free-tier limit, so keep effort low outside smart.
  // strictJsonSchema off: Groq strict mode rejects schemas with optional fields (400 on every call); the
  // router validates every output with zod and retries once, so non-strict JSON mode loses nothing.
  return { groq: { reasoningEffort: tier === "smart" ? "medium" : "low", strictJsonSchema: false } } as const;
}
