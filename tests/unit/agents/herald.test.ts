import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";

let model: MockLanguageModelV4;
vi.mock("@/ai/router/tiers", () => ({ chain: () => [{ provider: "groq", model: "openai/gpt-oss-20b" }] }));
vi.mock("@/ai/router/providers", () => ({ languageModel: () => model, providerOptions: () => undefined }));

const { runAgent } = await import("@/agents/runtime/run");
const { memoryTrace } = await import("@/agents/runtime/memory-trace");
const { worldServices } = await import("@/agents/runtime/services");
const { herald } = await import("@/agents/herald/config");
const { _resetCircuits } = await import("@/ai/router/router");
const { _resetBudget } = await import("@/ai/router/budget");
import { fixtures } from "@/contracts/fixtures";
import { formatTime } from "@/lib/time";
import type { ProposeResult } from "@/agents/runtime/contracts";
import type { EventWorld } from "@/contracts/fixtures";

const usage = {
  inputTokens: { total: 30, noCache: 30, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 10, text: 10, reasoning: 0 },
};
const call = (id: string, toolName: string, input: object) => ({
  content: [{ type: "tool-call" as const, toolCallId: id, toolName, input: JSON.stringify(input) }],
  finishReason: { unified: "tool-calls" as const, raw: "tool_calls" },
  usage,
  warnings: [],
});
const text = (t: string) => ({
  content: [{ type: "text" as const, text: t }],
  finishReason: { unified: "stop" as const, raw: "stop" },
  usage,
  warnings: [],
});
const scripted = (...steps: object[]) => {
  let i = 0;
  return new MockLanguageModelV4({ doGenerate: async () => steps[Math.min(i++, steps.length - 1)] as never });
};
const down = () =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw new APICallError({
        message: "down",
        url: "x",
        requestBodyValues: {},
        statusCode: 503,
        isRetryable: true,
      });
    },
  });

/** A talk moved 2 hours later into another room. `applied` controls whether the world already shows it. */
function moved(applied = true) {
  const world = fixtures.eventFull();
  const s = world.sessions.find((x) => x.kind === "talk" && x.status === "scheduled")!;
  const other = world.rooms.find((r) => r.id !== s.roomId)!;
  const before = { startsAt: s.startsAt, endsAt: s.endsAt, roomId: s.roomId };
  const after = {
    startsAt: new Date(Date.parse(s.startsAt) + 2 * 3_600_000).toISOString(),
    endsAt: new Date(Date.parse(s.endsAt) + 2 * 3_600_000).toISOString(),
    roomId: other.id,
  };
  if (applied) Object.assign(s, after);
  return {
    world,
    s,
    other,
    payload: { sessionId: s.id, before, after },
    newTime: formatTime(after.startsAt),
  };
}

function deps(world: EventWorld) {
  const propose = vi.fn(
    async (_a: unknown, input: { kind: string }) =>
      ({
        status: "created",
        proposal: { id: `p-${input.kind}`, status: "pending", riskTier: "T2" },
      }) as unknown as ProposeResult,
  );
  const trace = memoryTrace();
  return {
    propose,
    trace,
    deps: {
      propose: propose as never,
      trace: trace.store,
      services: worldServices(world),
      eventContext: async () => "HackNova",
    },
  };
}
const updated = { type: "domain_event" as const, eventType: "session.updated" as const, ref: "de-upd" };
const input = (p: ReturnType<typeof vi.fn>) =>
  p.mock.calls[0]![1] as {
    kind: string;
    payload: { segment: object; channels: string[]; bodyByChannel: Record<string, string>; category: string };
    rationale: string;
  };

beforeEach(() => {
  _resetCircuits();
  _resetBudget();
});

describe("herald agent", () => {
  it("announces an applied move to the session's attendees, after fixing a draft that missed the new time", async () => {
    const m = moved();
    const good = `"${m.s.title}" now starts at ${m.newTime} in ${m.other.name}. Please head there at the new time.`;
    model = scripted(
      call("t1", "get_change", {}),
      call("t2", "propose_announcement", {
        title: `Moved: ${m.s.title}`,
        body: `"${m.s.title}" has moved to ${m.other.name}.`,
      }),
      call("t3", "propose_announcement", { title: `Moved: ${m.s.title}`, body: good }),
      text("done"),
    );
    const d = deps(m.world);
    const res = await runAgent(herald, updated, { eventId: m.world.event.id, payload: m.payload }, d.deps);
    expect(res.status).toBe("succeeded");
    expect(d.propose).toHaveBeenCalledOnce();
    const a = input(d.propose);
    expect(a.kind).toBe("comms.send_announcement");
    expect(a.payload.segment).toEqual({ type: "session", ref: m.s.id });
    expect(a.payload.category).toBe("change");
    expect(Object.keys(a.payload.bodyByChannel).sort()).toEqual([...a.payload.channels].sort());
    expect(Object.values(a.payload.bodyByChannel)[0]).toBe(good);
    const rejected = d.trace.stepsOf(res.runId).filter((x) => x.kind === "tool")[1] as {
      output: { error: string };
    };
    expect(rejected.output.error).toContain(`the new time ${m.newTime}`);
  });

  it("stays quiet while the change is not applied yet", async () => {
    const m = moved(false);
    model = down();
    const d = deps(m.world);
    await runAgent(herald, updated, { eventId: m.world.event.id, payload: m.payload }, d.deps);
    expect(d.propose).not.toHaveBeenCalled();
  });

  it("rejects a draft that fails moderation", async () => {
    const m = moved();
    model = scripted(
      call("t1", "propose_announcement", {
        title: "Moved",
        body: `"${m.s.title}" is at ${m.newTime} in ${m.other.name}. Questions? Call 98765 43210.`,
      }),
      text("done"),
    );
    const d = deps(m.world);
    const res = await runAgent(herald, updated, { eventId: m.world.event.id, payload: m.payload }, d.deps);
    expect(d.propose).not.toHaveBeenCalled();
    const tool = d.trace.stepsOf(res.runId).find((x) => x.kind === "tool") as { output: { error: string } };
    expect(tool.output.error).toMatch(/phone number/);
  });

  it("uses the template for an approved cancellation when models are down", async () => {
    const world = fixtures.eventFull();
    const s = world.sessions.find((x) => x.kind === "talk")!;
    s.status = "cancelled";
    model = down();
    const d = deps(world);
    const res = await runAgent(
      herald,
      { type: "domain_event", eventType: "session.cancelled", ref: "de-c" },
      { eventId: world.event.id, payload: { sessionId: s.id, reason: "Speaker unwell" } },
      d.deps,
    );
    expect(res.status).toBe("fallback");
    const body = Object.values(input(d.propose).payload.bodyByChannel)[0]!;
    expect(body).toContain(`"${s.title}"`);
    expect(body).toContain("is cancelled");
  });
});
