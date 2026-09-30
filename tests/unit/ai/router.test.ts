import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError, tool } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";

const models = new Map<string, MockLanguageModelV4>();

vi.mock("../../../src/ai/router/tiers", () => ({
  chain: () => [
    { provider: "groq", model: "openai/gpt-oss-20b" },
    { provider: "ollama", model: "qwen3:4b-instruct" },
  ],
}));
vi.mock("../../../src/ai/router/providers", () => ({
  languageModel: (l: { provider: string }) => models.get(l.provider),
  providerOptions: () => undefined,
}));

const { generate, _resetCircuits } = await import("../../../src/ai/router/router");
const { _resetBudget, recordUsage } = await import("../../../src/ai/router/budget");

const usage = (i: number, o: number) => ({
  inputTokens: { total: i, noCache: i, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: o, text: o, reasoning: 0 },
});
const text = (t: string) => ({
  content: [{ type: "text" as const, text: t }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage: usage(10, 5),
  warnings: [],
});
const rateLimited = () =>
  new APICallError({
    message: "rate limited",
    url: "x",
    requestBodyValues: {},
    statusCode: 429,
    isRetryable: true,
  });

const base = {
  tier: "fast" as const,
  instructions: "test",
  messages: [{ role: "user" as const, content: "hi" }],
};

beforeEach(() => {
  models.clear();
  _resetCircuits();
  _resetBudget();
});

describe("router", () => {
  it("falls back on 429, records both attempts, and keeps the circuit open", async () => {
    const groq = new MockLanguageModelV4({
      doGenerate: async () => {
        throw rateLimited();
      },
    });
    models.set("groq", groq);
    models.set("ollama", new MockLanguageModelV4({ doGenerate: async () => text("from ollama") }));

    const seen: string[] = [];
    const r = await generate({
      ...base,
      budget: { runId: "r1" },
      onAttempt: (a) => seen.push(`${a.provider}:${a.ok}`),
    });
    expect(r.ok && r.text).toBe("from ollama");
    expect(seen).toEqual(["groq:false", "ollama:true"]);

    await generate({ ...base, budget: { runId: "r2" } });
    expect(groq.doGenerateCalls).toHaveLength(1); // circuit open, groq skipped on the second call
  });

  it("retries a schema failure once with the error, then returns bad_output", async () => {
    const m = new MockLanguageModelV4({ doGenerate: async () => text('{"seats":"sixty"}') });
    models.set("groq", m);
    const r = await generate({ ...base, schema: z.object({ seats: z.number() }), budget: { runId: "r3" } });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.failure.reason).toBe("bad_output");
    expect(m.doGenerateCalls).toHaveLength(2);
    expect(JSON.stringify(m.doGenerateCalls[1]!.prompt)).toContain("failed validation");
  });

  it("accepts the retry when the second output is valid", async () => {
    let n = 0;
    models.set(
      "groq",
      new MockLanguageModelV4({ doGenerate: async () => text(n++ ? '{"seats":60}' : "nope") }),
    );
    const r = await generate({ ...base, schema: z.object({ seats: z.number() }), budget: { runId: "r4" } });
    expect(r.ok && r.output).toEqual({ seats: 60 });
  });

  it("runs tool steps up to maxSteps and records one attempt per model step", async () => {
    let step = 0;
    models.set(
      "groq",
      new MockLanguageModelV4({
        doGenerate: async () =>
          step++ === 0
            ? {
                content: [
                  {
                    type: "tool-call" as const,
                    toolCallId: "t1",
                    toolName: "getRoom",
                    input: '{"roomId":"r-204"}',
                  },
                ],
                finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
                usage: usage(20, 5),
                warnings: [],
              }
            : text("60 seats"),
      }),
    );
    const execute = vi.fn(async () => ({ capacity: 60 }));
    const attempts: unknown[] = [];
    const r = await generate({
      ...base,
      maxSteps: 3,
      tools: {
        getRoom: tool({ description: "room", inputSchema: z.object({ roomId: z.string() }), execute }),
      },
      budget: { runId: "r5" },
      onAttempt: (a) => attempts.push(a),
    });
    expect(r.ok && r.text).toBe("60 seats");
    expect(execute).toHaveBeenCalledOnce();
    expect(attempts).toHaveLength(2);
    expect(r.ok && r.usage).toEqual({ inputTokens: 30, outputTokens: 10 });
  });

  it("pauses non-critical calls at the daily cap and keeps critical ones on ollama", async () => {
    const groq = new MockLanguageModelV4({ doGenerate: async () => text("groq") });
    models.set("groq", groq);
    models.set("ollama", new MockLanguageModelV4({ doGenerate: async () => text("ollama") }));
    recordUsage("spend", 0, 100);

    const paused = await generate({ ...base, budget: { runId: "r6" } });
    expect(!paused.ok && paused.failure.reason).toBe("budget_paused");

    const critical = await generate({ ...base, budget: { runId: "r7", critical: true } });
    expect(critical.ok && critical.provider).toBe("ollama");
    expect(groq.doGenerateCalls).toHaveLength(0);
  });

  it("refuses a run that has spent its token budget", async () => {
    models.set("groq", new MockLanguageModelV4({ doGenerate: async () => text("x") }));
    recordUsage("r8", 30_000, 0);
    const r = await generate({ ...base, budget: { runId: "r8" } });
    expect(!r.ok && r.failure.reason).toBe("budget_run");
  });
});
