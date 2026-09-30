import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";

let model: MockLanguageModelV4;
vi.mock("@/ai/router/tiers", () => ({ chain: () => [{ provider: "groq", model: "openai/gpt-oss-120b" }] }));
vi.mock("@/ai/router/providers", () => ({ languageModel: () => model, providerOptions: () => undefined }));

const { runAgent } = await import("@/agents/runtime/run");
const { memoryTrace } = await import("@/agents/runtime/memory-trace");
const { worldServices } = await import("@/agents/runtime/services");
const { scheduler } = await import("@/agents/scheduler/config");
const { planFor } = await import("@/agents/scheduler/tools");
const { _resetCircuits } = await import("@/ai/router/router");
const { _resetBudget } = await import("@/ai/router/budget");
const { isValid } = await import("@/solvers/schedule");
import { fixtures } from "@/contracts/fixtures";
import type { ProposeResult } from "@/agents/runtime/contracts";

const usage = {
  inputTokens: { total: 50, noCache: 50, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 20, text: 20, reasoning: 0 },
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

const world = fixtures.eventFull();
const target = world.sessions
  .filter(
    (s) =>
      ["talk", "workshop"].includes(s.kind) &&
      s.status === "scheduled" &&
      s.startsAt > world.now &&
      s.registeredCount > 0,
  )
  .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0]!;
const trigger = { type: "domain_event" as const, eventType: "session.cancelled" as const, ref: "de-cancel" };
const payload = {
  sessionId: target.id,
  reason: "Speaker cancelled",
  speakerIds: target.speakerIds,
  registeredCount: target.registeredCount,
};

function setup() {
  const propose = vi.fn(
    async (_a: unknown, input: { kind: string }) =>
      ({
        status: "created",
        proposal: { id: "p-bundle", status: "pending", riskTier: "T2", kind: input.kind },
      }) as unknown as ProposeResult,
  );
  const trace = memoryTrace();
  const deps = {
    propose: propose as never,
    trace: trace.store,
    services: worldServices(fixtures.eventFull()),
    eventContext: async () => "HackNova 2026",
  };
  return { propose, trace, deps };
}

beforeEach(() => {
  _resetCircuits();
  _resetBudget();
});

describe("scheduler agent", () => {
  it("proposes exactly the chosen solver option as a plan.bundle with ripple and all options", async () => {
    model = scripted(
      call("t1", "get_options", {}),
      call("t2", "choose_option", { optionId: "opt-1", rationale: "Fewest moved sessions (0)." }),
      text("Proposed opt-1."),
    );
    const { propose, deps } = setup();
    const res = await runAgent(scheduler, trigger, { eventId: world.event.id, payload }, deps);
    expect(res.status).toBe("succeeded");
    expect(propose).toHaveBeenCalledOnce();

    const input = propose.mock.calls[0]![1] as unknown as {
      kind: string;
      payload: {
        children: { kind: string; payload: unknown; proposedBy: string }[];
        options: { id: string; chosen: boolean }[];
        ripple: { attendees: { count: number; sample: { displayName: string }[] } };
      };
      evidence: { type: string; ref: string }[];
      idempotencyKey: string;
    };
    const plan = await planFor({ services: deps.services, payload, trigger } as never);
    const chosen = plan.options.find((o) => o.id === "opt-1")!;
    expect(input.kind).toBe("plan.bundle");
    const scheduleChildren = input.payload.children.filter((c) => c.kind.startsWith("schedule."));
    expect(scheduleChildren.map((c) => ({ kind: c.kind, payload: c.payload }))).toEqual(chosen.actions);
    expect(scheduleChildren.every((c) => c.proposedBy === "scheduler")).toBe(true);
    // Composed consequences: the cancelled workshop's crew is released and its attendees are told.
    expect(
      input.payload.children.some((c) => c.kind === "comms.send_announcement" && c.proposedBy === "herald"),
    ).toBe(true);
    expect(input.payload.children.at(-1)!.kind).toBe("kb.publish_update");
    expect(input.payload.options.filter((o) => o.chosen).map((o) => o.id)).toEqual(["opt-1"]);
    expect(input.payload.ripple.attendees.count).toBe(chosen.metrics.attendeesAffected);
    for (const s of input.payload.ripple.attendees.sample) expect(s.displayName).toMatch(/^\S+( \S\.)?$/); // short names only
    expect(input.evidence).toContainEqual(
      expect.objectContaining({ type: "row", ref: `sessions/${target.id}` }),
    );
    for (const o of plan.options) expect(isValid(plan.state, o.actions)).toBe(true);
  });

  it("refuses an option the solver did not return", async () => {
    model = scripted(call("t1", "choose_option", { optionId: "opt-9", rationale: "made up" }), text("done"));
    const { propose, trace, deps } = setup();
    const res = await runAgent(scheduler, trigger, { eventId: world.event.id, payload }, deps);
    expect(propose).not.toHaveBeenCalled();
    const tool = trace.stepsOf(res.runId).find((s) => s.kind === "tool") as { output: { error: string } };
    expect(tool.output.error).toMatch(/^No option opt-9/);
  });

  it("falls back to the solver's first option when models fail", async () => {
    model = new MockLanguageModelV4({
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
    const { propose, deps } = setup();
    const res = await runAgent(scheduler, trigger, { eventId: world.event.id, payload }, deps);
    expect(res.status).toBe("fallback");
    const input = propose.mock.calls[0]![1] as unknown as {
      payload: { options: { id: string; chosen: boolean }[] };
      rationale: string;
    };
    expect(input.payload.options.find((o) => o.chosen)!.id).toBe("opt-1");
    expect(input.rationale).toMatch(/^Chosen by rules/);
  });

  it("offers to fix the seeded over-capacity lab when that session is updated", async () => {
    const plan = await planFor({
      services: worldServices(fixtures.eventFull()),
      payload: { sessionId: target.id },
      trigger: { type: "domain_event", eventType: "session.updated" },
    } as never);
    expect(target.registeredCount).toBe(95); // the Lab 204 workshop
    expect(plan.options[0]!.metrics).toMatchObject({
      capacityShortfall: 0,
      minutesShifted: 0,
      roomChanges: 1,
    });
  });

  it("does nothing for an update that causes no clash", async () => {
    const services = worldServices(fixtures.eventFull());
    const { detectClashes } = await import("@/solvers/schedule");
    const clashing = new Set(
      detectClashes({
        sessions: world.sessions,
        rooms: world.rooms,
        choices: await services.sessionChoices(),
      }).flatMap((c) => ("sessionIds" in c ? c.sessionIds : [c.sessionId])),
    );
    const calm = world.sessions.find(
      (x) => x.status === "scheduled" && x.kind === "talk" && !clashing.has(x.id),
    )!;
    const plan = await planFor({
      services,
      payload: { sessionId: calm.id },
      trigger: { type: "domain_event", eventType: "session.updated" },
    } as never);
    expect(plan.options).toEqual([]);
    expect(plan.note).toMatch(/no clash/);
  });
});
