// The only door to a language model. Every call carries a tier, a budget, a timeout and a step limit,
// walks the tier's provider chain, and reports every attempt so the runtime can store it as an AgentStep.

import {
  generateText,
  streamText,
  isStepCount,
  NoObjectGeneratedError,
  Output,
  type ModelMessage,
  type ToolSet,
} from "ai";
import type { z } from "zod";
import { chain, type Link, type Provider, type Tier } from "./tiers";
import { languageModel, providerOptions } from "./providers";
import { costUsd } from "./pricing";
import { bucketFor } from "./bucket";
import { dailyCapHit, recordUsage, runTokensLeft } from "./budget";

export type Attempt = {
  kind: "llm";
  tier: Tier;
  provider: Provider;
  model: string;
  ok: boolean;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  costUsd: number;
  error?: string;
  at: string;
};

export type ModelFailure = {
  reason: "no_provider" | "all_failed" | "bad_output" | "budget_run" | "budget_paused";
  message: string;
  attempts: Attempt[];
};

export type GenerateRequest<T> = {
  tier: Exclude<Tier, "stt">;
  /** Trusted instructions only. Untrusted text goes in messages, wrapped with guard.wrap(). */
  instructions?: string;
  messages: ModelMessage[];
  tools?: ToolSet;
  schema?: z.ZodType<T>;
  /** Model steps including tool round trips. Default 1. */
  maxSteps?: number;
  maxOutputTokens?: number;
  timeoutMs?: number;
  budget: { runId: string; tokens?: number; critical?: boolean };
  /** Force a single provider (smoke tests). */
  only?: Provider;
  onAttempt?: (a: Attempt) => void;
};

export type GenerateOk<T> = {
  ok: true;
  text: string;
  output: T | undefined;
  provider: Provider;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
  costUsd: number;
  attempts: Attempt[];
};
export type GenerateResult<T> = GenerateOk<T> | { ok: false; failure: ModelFailure };

const CIRCUIT_MS = 60_000;
const DEFAULT_TIMEOUT: Record<Exclude<Tier, "stt">, number> = { smart: 60_000, fast: 20_000, guard: 5_000 };
const circuit = new Map<string, number>(); // provider:model -> open until

const key = (l: Link) => `${l.provider}:${l.model}`;
export const circuitOpen = (l: Link, now = Date.now()) => (circuit.get(key(l)) ?? 0) > now;
export const _resetCircuits = () => circuit.clear();

function estimateTokens(req: GenerateRequest<unknown>): number {
  const chars =
    (req.instructions?.length ?? 0) +
    JSON.stringify(req.messages).length +
    Object.keys(req.tools ?? {}).length * 400 +
    (req.schema ? 400 : 0);
  return Math.ceil(chars / 4) + (req.maxOutputTokens ?? 1024);
}

function links(req: GenerateRequest<unknown>): Link[] | ModelFailure {
  let list = chain(req.tier, req.only);
  if (dailyCapHit()) {
    if (!req.budget.critical)
      return { reason: "budget_paused", message: "Daily model spend cap reached", attempts: [] };
    list = list.filter((l) => l.provider === "ollama"); // critical agents keep going on the local model
  }
  if (!list.length)
    return { reason: "no_provider", message: `No provider available for ${req.tier}`, attempts: [] };
  return list;
}

function errorText(e: unknown): string {
  const err = e as { statusCode?: number; message?: string; name?: string };
  return `${err.statusCode ? `${err.statusCode} ` : ""}${err.name ?? "Error"}: ${(err.message ?? String(e)).slice(0, 300)}`;
}

function attempt(req: GenerateRequest<unknown>, link: Link, fields: Partial<Attempt>): Attempt {
  const a: Attempt = {
    kind: "llm",
    tier: req.tier,
    provider: link.provider,
    model: link.model,
    ok: false,
    inputTokens: 0,
    outputTokens: 0,
    latencyMs: 0,
    costUsd: 0,
    at: new Date().toISOString(),
    ...fields,
  };
  if (a.ok || a.inputTokens) recordUsage(req.budget.runId, a.inputTokens + a.outputTokens, a.costUsd);
  req.onAttempt?.(a);
  return a;
}

type Picked = { link: Link; settle?: (actual: number) => void };

/** First link whose circuit is closed and whose rate bucket can cover the estimate. */
function pick(req: GenerateRequest<unknown>, list: Link[], tried: Set<string>): Picked | undefined {
  const est = estimateTokens(req);
  for (const link of list) {
    if (tried.has(key(link)) || circuitOpen(link)) continue;
    const bucket = bucketFor(link.provider, link.model);
    if (bucket && !bucket.canTake(est)) continue;
    tried.add(key(link));
    return { link, settle: bucket?.take(est) };
  }
  return undefined;
}

function callOptions(req: GenerateRequest<unknown>, link: Link, messages: ModelMessage[]) {
  return {
    model: languageModel(link),
    instructions: req.instructions,
    messages,
    tools: req.tools,
    output: req.schema ? Output.object({ schema: req.schema }) : undefined,
    stopWhen: isStepCount(req.maxSteps ?? 1),
    maxOutputTokens: req.maxOutputTokens,
    maxRetries: 0,
    abortSignal: AbortSignal.timeout(req.timeoutMs ?? DEFAULT_TIMEOUT[req.tier]),
    providerOptions: providerOptions(link, req.tier),
  };
}

export async function generate<T = never>(req: GenerateRequest<T>): Promise<GenerateResult<T>> {
  const attempts: Attempt[] = [];
  const list = links(req);
  if (!Array.isArray(list)) return { ok: false, failure: list };
  if (runTokensLeft(req.budget.runId, req.budget.tokens) <= 0)
    return { ok: false, failure: { reason: "budget_run", message: "Run token budget spent", attempts } };

  const tried = new Set<string>();
  let messages = req.messages;
  const parseRetried = new Set<string>();
  let badOutput = false;

  for (let picked = pick(req, list, tried); picked; picked = pick(req, list, tried)) {
    const { link, settle } = picked;
    const started = Date.now();
    let stepStart = started;
    try {
      const result = await generateText({
        ...callOptions(req, link, messages),
        onStepEnd: ({ usage }) => {
          const now = Date.now();
          const inTok = usage.inputTokens ?? 0;
          const outTok = usage.outputTokens ?? 0;
          attempts.push(
            attempt(req, link, {
              ok: true,
              inputTokens: inTok,
              outputTokens: outTok,
              latencyMs: now - stepStart,
              costUsd: costUsd(link.model, inTok, outTok),
            }),
          );
          stepStart = now;
        },
      });
      const inputTokens = result.usage.inputTokens ?? 0;
      const outputTokens = result.usage.outputTokens ?? 0;
      settle?.(inputTokens + outputTokens);
      bucketFor(link.provider, link.model)?.sync(result.finalStep.response.headers);
      return {
        ok: true,
        text: result.text,
        output: req.schema ? (result.output as T) : undefined,
        provider: link.provider,
        model: link.model,
        usage: { inputTokens, outputTokens },
        costUsd: costUsd(link.model, inputTokens, outputTokens),
        attempts,
      };
    } catch (e) {
      const error = errorText(e);
      attempts.push(attempt(req, link, { latencyMs: Date.now() - stepStart, error }));
      if (NoObjectGeneratedError.isInstance(e)) {
        // Output failed the schema: retry once on the same provider with the error. If it fails again,
        // try the next provider from a clean prompt; only when every provider fails is it bad_output.
        badOutput = true;
        messages = req.messages;
        if (parseRetried.has(key(link))) continue;
        parseRetried.add(key(link));
        tried.delete(key(link));
        messages = [
          ...req.messages,
          ...(e.text ? [{ role: "assistant" as const, content: e.text }] : []),
          {
            role: "user",
            content: `That output failed validation: ${error}. Reply again with only JSON that matches the schema.`,
          },
        ];
        continue;
      }
      // 429, 5xx, timeout or any provider error: open the circuit for this model and move on.
      circuit.set(key(link), Date.now() + CIRCUIT_MS);
    }
  }
  const failure: ModelFailure = badOutput
    ? { reason: "bad_output", message: "No provider returned output that matches the schema", attempts }
    : attempts.length
      ? { reason: "all_failed", message: "Every provider in the chain failed", attempts }
      : { reason: "no_provider", message: "Every provider is rate limited or tripped", attempts };
  return { ok: false, failure };
}

export type StreamOk = {
  ok: true;
  textStream: AsyncIterable<string>;
  provider: Provider;
  model: string;
  /** Resolves when the stream ends, with the usage attempt. */
  done: Promise<Attempt>;
};

/**
 * Streaming text. Falls back to the next provider only if the first one fails before its first token;
 * once text has reached the client we cannot switch without showing a restart.
 */
export async function stream(
  req: Omit<GenerateRequest<never>, "schema">,
): Promise<StreamOk | { ok: false; failure: ModelFailure }> {
  const attempts: Attempt[] = [];
  const list = links(req);
  if (!Array.isArray(list)) return { ok: false, failure: list };
  if (runTokensLeft(req.budget.runId, req.budget.tokens) <= 0)
    return { ok: false, failure: { reason: "budget_run", message: "Run token budget spent", attempts } };

  const tried = new Set<string>();
  for (let picked = pick(req, list, tried); picked; picked = pick(req, list, tried)) {
    const { link, settle } = picked;
    const started = Date.now();
    const result = streamText(callOptions(req, link, req.messages));
    // Probe on a separate tee of the stream; the caller's textStream still starts from the beginning.
    const reader = result.stream.getReader();
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done || value.type === "text-delta" || value.type === "tool-call" || value.type === "finish")
          break;
        if (value.type === "error") throw value.error;
      }
      void reader.cancel();
    } catch (e) {
      void reader.cancel();
      attempts.push(attempt(req, link, { latencyMs: Date.now() - started, error: errorText(e) }));
      circuit.set(key(link), Date.now() + CIRCUIT_MS);
      continue;
    }
    const done = Promise.all([result.usage, result.finalStep]).then(
      ([usage, finalStep]) => {
        const inTok = usage.inputTokens ?? 0;
        const outTok = usage.outputTokens ?? 0;
        settle?.(inTok + outTok);
        bucketFor(link.provider, link.model)?.sync(finalStep.response.headers);
        return attempt(req, link, {
          ok: true,
          inputTokens: inTok,
          outputTokens: outTok,
          latencyMs: Date.now() - started,
          costUsd: costUsd(link.model, inTok, outTok),
        });
      },
      (e: unknown) => attempt(req, link, { latencyMs: Date.now() - started, error: errorText(e) }),
    );
    return { ok: true, textStream: result.textStream, provider: link.provider, model: link.model, done };
  }
  return {
    ok: false,
    failure: {
      reason: attempts.length ? "all_failed" : "no_provider",
      message: "No provider streamed",
      attempts,
    },
  };
}
