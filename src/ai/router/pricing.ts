// USD per 1M tokens.
// Groq: verified 2026-09-30 at console.groq.com/docs/models.
// Nova 2 Lite: global profile rate $0.30 / $2.50, verified 2026-09-30 from AWS-derived price listings
// (aws.amazon.com/bedrock/pricing renders client side). Re-check in the Bedrock console before Gate 2.
// Ollama runs locally and costs nothing per token.
const PRICES: Record<string, { in: number; out: number }> = {
  "openai/gpt-oss-120b": { in: 0.15, out: 0.6 },
  "openai/gpt-oss-20b": { in: 0.075, out: 0.3 },
  "meta-llama/llama-prompt-guard-2-86m": { in: 0.04, out: 0.04 },
  "global.amazon.nova-2-lite-v1:0": { in: 0.3, out: 2.5 },
};

/** whisper-large-v3-turbo on Groq, USD per audio hour (verified 2026-09-30). */
export const WHISPER_USD_PER_HOUR = 0.04;

export function costUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = PRICES[model];
  return p ? (inputTokens * p.in + outputTokens * p.out) / 1e6 : 0;
}
