# ADR-001: Model access while Groq is on the free tier

- Date: 2026-09-30
- Status: Accepted
- Owner: Vedant
- Supersedes: nothing. Amends the provider order in blueprint Section 8 until the Groq upgrade is possible.

## Context

Blueprint Section 8 plans to upgrade the team Groq org to Developer pay-as-you-go. Groq is refusing paid upgrades right now, so we are on the free tier. For the gpt-oss models that is roughly 30 requests/min, 8K tokens/min and 200K tokens/day per model. A full day of building plus rehearsals would burn the daily allowance before the demo, and one burst of agent runs can exceed 8K tokens/min.

We have AWS credits (Amazon Bedrock, Nova 2 Lite) and a local GPU laptop that can run Ollama.

## Decision

### 1. `AI_PROFILE` env var, values `dev` and `demo`

**`dev`** (default while building): save Groq's daily tokens.
- All tiers: Ollama on the local GPU laptop first, Groq free tier second.

**`demo`**: best quality and latency on stage.
- `smart` tier: Amazon Bedrock Nova 2 Lite (AWS credits) -> Groq `openai/gpt-oss-120b` -> Ollama -> rules-only.
- `fast` tier: Groq `openai/gpt-oss-20b` (low latency for the helpdesk) -> Bedrock Nova 2 Lite -> Ollama.
- `guard` and `stt` stay as in blueprint Section 8.

### 2. Per-provider token bucket in the router

- Each provider (and each Groq model, since limits are per model) gets a bucket for requests/min and tokens/min, plus a daily token counter for Groq.
- Before a call, the router estimates the request's tokens and skips to the next provider in the chain if the bucket cannot cover it. We fall back before hitting a 429, not after.
- After each Groq response, the router reads Groq's rate-limit response headers (remaining requests and tokens, reset times) and resyncs the bucket from them. Verify the exact header names in the Groq docs when implementing.
- A 429 still opens the 60s circuit described in PROMPT-VEDANT Checkpoint 0.1, as a last line of defence.

### 3. When the Groq upgrade becomes available

The plan in blueprint Section 8 applies again with no code change except env: raise the bucket limits through env and, if we want Groq first for `smart` too, change the provider order through env. The router must read both from env, not constants.

## Consequences

- Building mostly runs on the local model, so output quality during development is lower than on stage. Evals must be run at least once with `AI_PROFILE=demo` before each gate huddle.
- The demo depends on AWS Bedrock access for the `smart` tier. Nova model access must be enabled in the Bedrock console for our region before Gate 2.
- The token bucket adds a small amount of router code, but it also covers Section 6 loophole 18 (provider rate limited) more gracefully than a circuit breaker alone.
