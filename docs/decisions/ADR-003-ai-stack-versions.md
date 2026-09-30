# ADR-003: AI stack versions and model choices verified at build time

- Date: 2026-09-30
- Status: Accepted
- Owner: Vedant
- Amends: blueprint Section 8 (stack table and router tiers)

## Context

Blueprint Section 8 names the AI stack as of writing. Checkpoint 0 requires checking each package and model against official docs or `npm view` before use. Several things have moved.

## Findings and decisions

| Item | Blueprint says | Verified 2026-09-30 | Decision |
|---|---|---|---|
| Vercel AI SDK | `ai` v6 | `ai@7.0.123` is current. ESM only. `generateObject` / `streamObject` are deprecated. `system` is now `instructions`, `stepCountIs` is now `isStepCount`, system messages inside `messages` are rejected by default. | Use v7. Structured output is `generateText({ output: Output.object({ schema }) })`. The default rejection of system messages in `messages` backs our rule that untrusted text never reaches instructions. |
| Groq provider | `@ai-sdk/groq` | `4.0.53`, peer `zod ^3.25 or ^4.1` | Use it. `reasoningEffort` goes only to gpt-oss models; Prompt Guard 2 returns HTTP 400 if it is sent. |
| Groq models | gpt-oss-120b / 20b, Prompt Guard 2 86m, whisper-large-v3-turbo | All four live. Prompt Guard 2 is still preview. Its input window is 512 tokens, so long text is screened in slices. | No change. |
| Groq rate-limit headers | not specified | `x-ratelimit-limit-requests` / `remaining-requests` are **per day**. `x-ratelimit-limit-tokens` / `remaining-tokens` are **per minute**. Resets look like `2m59.56s`. | The router bucket tracks RPM itself and resyncs TPM and RPD from the headers. |
| Bedrock model | Nova 2 Lite | Model id `amazon.nova-2-lite-v1:0`. From ap-south-1 it is reachable **only** through the global profile `global.amazon.nova-2-lite-v1:0`. Converse tool use is supported, but **native structured outputs are not**. | Default `BEDROCK_MODEL_ID=global.amazon.nova-2-lite-v1:0`. The router validates JSON with zod and retries once, so no native structured output is needed. Not smoke tested yet because the AWS account is still being verified. |
| Bedrock provider | `@ai-sdk/amazon-bedrock` | `5.0.102`. Reads `AWS_BEARER_TOKEN_BEDROCK` or IAM keys, plus `AWS_REGION` | Use it. |
| Ollama provider | `ai-sdk-ollama` | `4.3.0`, peer `ai ^7`. Supports tools and JSON schema output. | Use it with `reliableToolCalling: false`, so the router, not the provider, owns retries and step counts. |
| Local model | "largest Qwen3 that fits 6 GB with 8k context" | On the RTX 3050 6 GB, `qwen3:8b` at 8k context spills 16% to CPU (15 tok/s, 136 s cold load). `qwen3:4b-instruct` stays 100% on GPU (4.2 GB, 55 tok/s). | `OLLAMA_MODEL=qwen3:4b-instruct` for both smart and fast. It passes tool calls and JSON schema output in `pnpm ai:smoke`. |
| Embeddings | bge-small-en-v1.5 via `@huggingface/transformers` | `@huggingface/transformers@4.3.0`, `Xenova/bge-small-en-v1.5`, 384 dims, CLS pooling, q8 | Use it. `pnpm ai:models` prefetches the model at build time. |
| PDF text | `pdf-parse` or `unpdf` | `unpdf@1.8.1` (maintained, ESM) | `unpdf`. |
| Tooling | not specified | TypeScript `7.0.2`, Vitest `5.0.2` (needs Node >= 22.12), tsx `4.23.15` | Pinned in the bootstrap `package.json`. Abhinav owns the final repo config. |

## Guard measurements (for honesty on slides)

On `tests/evals/injection.jsonl` (20 injections, 20 benign questions):
- Prompt Guard 2 alone blocks 11/20 injections and allows 20/20 benign questions.
- Heuristics alone block 20/20 and allow 20/20. **Caveat:** the heuristics were written while looking at this set, so they are fitted to it. Checkpoint 6 red-teaming needs a held-out set before we quote a block rate publicly.
- Combined, as `screen()` runs them: 20/20 blocked, 20/20 allowed.

## Consequences

- The router code targets the AI SDK v7 API. Anyone copying v6 examples from the web will hit renamed options.
- Bedrock pricing in `src/ai/router/pricing.ts` comes from AWS-derived listings, because the AWS pricing page renders client side. Re-check it in the Bedrock console before Gate 2.
