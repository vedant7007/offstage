import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockLanguageModelV4 } from "ai/test";

let model: MockLanguageModelV4;
vi.mock("@/ai/router/tiers", () => ({ chain: () => [{ provider: "groq", model: "openai/gpt-oss-20b" }] }));
vi.mock("@/ai/router/providers", () => ({ languageModel: () => model, providerOptions: () => undefined }));

const { askAnswer, spokenInr, spokenTime, speakable } = await import("@/agents/commander/voice-ask");
const { pickIntent } = await import("@/agents/commander/voice");
const { worldServices } = await import("@/agents/runtime/services");
const { _resetCircuits } = await import("@/ai/router/router");
const { _resetBudget } = await import("@/ai/router/budget");
import { fixtures } from "@/contracts/fixtures";
import type { MetricsSnapshot } from "@/contracts";
import type { Turn } from "@/agents/commander/voice";

const usage = {
  inputTokens: { total: 300, noCache: 300, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 40, text: 40, reasoning: 0 },
};
const replies = (...outs: object[]) => {
  let i = 0;
  return new MockLanguageModelV4({
    doGenerate: async () =>
      ({
        content: [{ type: "text", text: JSON.stringify(outs[Math.min(i++, outs.length - 1)]) }],
        finishReason: { unified: "stop", raw: "stop" },
        usage,
        warnings: [],
      }) as never,
  });
};
const down = () =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw Object.assign(new Error("unavailable"), { statusCode: 503 });
    },
  });

const WIFI = {
  chunkId: "c1",
  docId: "kb-faq",
  docTitle: "FAQ",
  section: "Is there WiFi?",
  snippet: "Yes. Connect to the network HackNova-Guest. The password is printed on the back of your badge.",
  score: 0.73,
};
const metrics = {
  registrations: { confirmed: 412, waitlisted: 18, cancelled: 6, target: 450 },
  checkins: { count: 120, rate: 0.29, lastTenMinutes: 9 },
  incidentsOpen: 1,
  emergenciesOpen: 0,
  pendingApprovals: 2,
  pendingByDomain: {},
  helpdesk: { lastTenMinutes: 3, clusters: [], escalationsOpen: 1 },
  budget: [],
  funnel: { actual: 430, target: 500 },
  modelSpendUsdToday: 0,
} as unknown as MetricsSnapshot;
const searchKb = vi.fn(async () => [WIFI]);
const deps = () => ({
  services: worldServices(fixtures.eventFull(), { searchKb }),
  metrics: async () => metrics,
  queue: async () => ({
    pending: 2,
    pendingTwoApprovals: 1,
    top: [{ tier: "T2", summary: "Move lunch to Hall B" }],
  }),
});
const ask = (text: string, history: Turn[] = [], topics: never[] = []) =>
  askAnswer({ text, intent: "ask", topics, history, deps: deps(), runId: `r-${Math.random()}` });

beforeEach(() => {
  _resetCircuits();
  _resetBudget();
  searchKb.mockClear();
});

describe("askAnswer", () => {
  it("answers from a document and returns only the sources it really used", async () => {
    model = replies({
      mode: "answer",
      say: "The network is HackNova-Guest, and the password is printed on the back of your badge.",
      citations: ["kb-faq#Is there WiFi?", "kb:made-up#nothing"],
    });
    const r = await ask("What is the WiFi password?");
    expect(r.fallback).toBeUndefined();
    expect(r.lines.join(" ")).toMatch(/badge/);
    expect(r.sources).toEqual([{ ref: "kb:kb-faq#Is there WiFi?", label: "FAQ: Is there WiFi?" }]);
  });

  it("asks one question when the request is ambiguous, then completes it on the next turn", async () => {
    model = replies({
      mode: "clarify",
      say: "There are two workshops today.",
      followUp: "Which one, Fine-tuning or Retrieval?",
      citations: ["live:schedule"],
    });
    const first = await ask("When does the workshop start?", [], ["schedule"] as never[]);
    expect(first.followUp).toBe("Which one, Fine-tuning or Retrieval?");
    expect(first.lines.at(-1)).toBe(first.followUp);

    const history: Turn[] = [
      { role: "user", text: "When does the workshop start?", topics: ["schedule"] },
      { role: "assistant", text: first.lines.join(" "), followUp: true },
    ];
    model = replies({
      mode: "answer",
      say: "The network is HackNova-Guest.",
      citations: ["kb:kb-faq#Is there WiFi?"],
    });
    await ask("the retrieval one", history, ["schedule", "documents"] as never[]);
    // The short answer is searched together with the question it answers, and the model sees the conversation.
    expect(searchKb).toHaveBeenLastCalledWith("When does the workshop start? the retrieval one", 3);
    expect(JSON.stringify(model.doGenerateCalls[0]!.prompt)).toContain(
      "Which one, Fine-tuning or Retrieval?",
    );
  });

  it("never says a number the records do not have", async () => {
    model = replies({
      mode: "answer",
      say: "There are 7777 people checked in.",
      citations: ["sql:registrations"],
    });
    const r = await ask("How many people checked in?", [], ["registrations"] as never[]);
    expect(r.fallback).toBe("unsupported");
    expect(r.lines.join(" ")).not.toMatch(/7777/);
    expect(r.lines.join(" ")).toMatch(/412 confirmed/); // the rules-based brief from SQL metrics
  });

  it("never claims to have changed anything", async () => {
    model = replies({ mode: "action", say: "Done, I've moved the keynote to 4 PM.", citations: [] });
    const r = await ask("Move the keynote to 4 PM");
    expect(r.fallback).toBe("claimed_done");
    expect(r.lines.join(" ")).toMatch(/can't make that change by voice/);
  });

  it("falls back to the records by rules when no model answers", async () => {
    model = down();
    const r = await ask("How many people registered?", [], ["registrations"] as never[]);
    expect(r.fallback).toBe("no_model");
    expect(r.lines.join(" ")).toMatch(/412 confirmed/);
  });

  it("answers a change request without a model by pointing to the propose flow", async () => {
    model = down();
    const r = await ask("Move the Next.js talk to 5 PM", [], ["schedule"] as never[]);
    expect(r.lines).toEqual([expect.stringMatching(/can't make that change by voice/)]);
  });

  it("says it could not reach its tools when no model answers and no record fits", async () => {
    model = down();
    const r = await ask("Tell me something interesting");
    expect(r.lines.join(" ")).toMatch(/could not reach my tools/);
  });
});

describe("pickIntent with the model", () => {
  it("routes an open question to ask with topics", async () => {
    model = replies({ intent: "ask", topics: ["volunteers"] });
    const p = await pickIntent("How many people are on duty right now?", "r1");
    expect(p).toMatchObject({ intent: "ask", by: "model" });
    expect(p.topics).toContain("volunteers");
  });

  it("never lets an answer to our own question start a scenario", async () => {
    model = replies({ intent: "lunch_confusion", topics: [] });
    expect((await pickIntent("the lunch one", "r2", { followUp: true })).intent).toBe("ask");
  });

  it("falls back to ask with keyword topics when the router fails", async () => {
    model = down();
    const p = await pickIntent("Which sponsors have committed?", "r3");
    expect(p).toMatchObject({ intent: "ask", topics: ["sponsors"] });
  });
});

describe("spoken forms", () => {
  it("reads money, times and symbols the way a person would say them", () => {
    expect(spokenInr(240000)).toBe("2.4 lakh rupees");
    expect(spokenInr(45500)).toBe("46 thousand rupees");
    expect(spokenInr(15000000)).toBe("1.5 crore rupees");
    expect(spokenTime("2026-10-24T08:30:00.000Z")).toBe("2 PM");
    expect(spokenTime("2026-10-24T05:00:00.000Z")).toBe("10:30 AM");
    expect(speakable("**Lunch** \u2014 Hall B & C, 80% full")).toBe("Lunch, Hall B and C, 80 percent full");
  });
});
