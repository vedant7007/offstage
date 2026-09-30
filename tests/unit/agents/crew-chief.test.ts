import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";

let model: MockLanguageModelV4;
vi.mock("@/ai/router/tiers", () => ({ chain: () => [{ provider: "groq", model: "openai/gpt-oss-20b" }] }));
vi.mock("@/ai/router/providers", () => ({ languageModel: () => model, providerOptions: () => undefined }));

const { runAgent } = await import("@/agents/runtime/run");
const { memoryTrace } = await import("@/agents/runtime/memory-trace");
const { worldServices } = await import("@/agents/runtime/services");
const { crewChief } = await import("@/agents/crew-chief/config");
const { replacements } = await import("@/agents/crew-chief/tools");
const { _resetCircuits } = await import("@/ai/router/router");
const { _resetBudget } = await import("@/ai/router/budget");
import { fixtures } from "@/contracts/fixtures";
import type { ProposeResult } from "@/agents/runtime/contracts";
import type { EventWorld } from "@/contracts/fixtures";
import { replacementFor } from "@/solvers/crew";

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

// A seeded assignment whose volunteer "missed" the shift. `coverable` picks one the crew rules can cover.
function scenario(edit?: (w: EventWorld) => void, coverable = true) {
  const world = fixtures.eventFull();
  const state = { volunteers: world.volunteers, shifts: world.shifts, assignments: world.shiftAssignments };
  const a = world.shiftAssignments.find(
    (x) =>
      x.status === "assigned" && (!coverable || replacementFor(state, x.shiftId, x.volunteerId).length > 0),
  )!;
  a.status = "missed";
  edit?.(world);
  const propose = vi.fn(
    async (_a: unknown, input: { kind: string }) =>
      ({
        status: "created",
        proposal: { id: `p-${input.kind}`, status: "pending", riskTier: "T1" },
      }) as unknown as ProposeResult,
  );
  const trace = memoryTrace();
  const deps = {
    propose: propose as never,
    trace: trace.store,
    services: worldServices(world),
    eventContext: async () => "HackNova",
  };
  const payload = {
    shiftId: a.shiftId,
    assignmentId: a.id,
    volunteerId: a.volunteerId,
    startsAt: world.now,
    minutesLate: 10,
  };
  const ctx = {
    services: deps.services,
    payload,
    trigger: { type: "domain_event", eventType: "shift.missed" },
  } as never;
  return { world, a, propose, trace, deps, payload, ctx };
}
const trigger = { type: "domain_event" as const, eventType: "shift.missed" as const, ref: "de-miss" };
const inputs = (p: ReturnType<typeof vi.fn>) =>
  p.mock.calls.map((c) => c[1] as { kind: string; payload: Record<string, unknown>; rationale: string });

beforeEach(() => {
  _resetCircuits();
  _resetBudget();
});

describe("crew chief agent", () => {
  it("assigns an allowed replacement and drafts a note to them", async () => {
    const s = scenario();
    const { candidates } = await replacements(s.ctx);
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates.map((c) => c.volunteerId)).not.toContain(s.a.volunteerId);
    const pick = candidates[0]!;
    model = scripted(
      call("t1", "get_replacements", {}),
      call("t2", "assign_replacement", {
        volunteerId: pick.volunteerId,
        note: "Hi, could you cover this shift? Please confirm.",
      }),
      text("done"),
    );
    const res = await runAgent(crewChief, trigger, { eventId: s.world.event.id, payload: s.payload }, s.deps);
    expect(res.status).toBe("succeeded");
    const [assign, direct] = inputs(s.propose);
    expect(assign).toMatchObject({
      kind: "crew.assign_shift",
      payload: { shiftId: s.a.shiftId, volunteerId: pick.volunteerId, replacesVolunteerId: s.a.volunteerId },
    });
    expect(direct).toMatchObject({
      kind: "comms.send_direct",
      payload: { recipient: { type: "volunteer", id: pick.volunteerId } },
    });
    const body = Object.values(direct!.payload.bodyByChannel as Record<string, string>)[0];
    expect(body).toBe("Hi, could you cover this shift? Please confirm.");
  });

  it("replaces a note that fails moderation with the template, and says so", async () => {
    const s = scenario();
    const [pick] = (await replacements(s.ctx)).candidates;
    model = scripted(
      call("t1", "assign_replacement", {
        volunteerId: pick!.volunteerId,
        note: "Call Ravi on 98765 43210, you are confirmed for a certificate guaranteed.",
      }),
      text("done"),
    );
    await runAgent(crewChief, trigger, { eventId: s.world.event.id, payload: s.payload }, s.deps);
    const direct = inputs(s.propose).find((i) => i.kind === "comms.send_direct")!;
    const body = Object.values(direct.payload.bodyByChannel as Record<string, string>)[0]!;
    expect(body).not.toContain("98765");
    expect(body).toMatch(/^Hi \S+, can you cover the /);
    expect(direct.rationale).toMatch(/Draft replaced by a template: .*phone number/);
  });

  it("refuses a volunteer the rules do not allow", async () => {
    const s = scenario();
    model = scripted(
      call("t1", "assign_replacement", { volunteerId: s.a.volunteerId, note: "you again" }),
      text("done"),
    );
    const res = await runAgent(crewChief, trigger, { eventId: s.world.event.id, payload: s.payload }, s.deps);
    const tool = s.trace.stepsOf(res.runId).find((x) => x.kind === "tool") as { output: { error: string } };
    expect(tool.output.error).toMatch(/cannot legally take this shift/);
    // The model gave up after the refusal, so the rules fallback covers the shift with a legal volunteer.
    expect(res.status).toBe("fallback");
    const assigned = s.propose.mock.calls
      .map((c) => c[1] as { kind: string; payload: { volunteerId?: string } })
      .find((p) => p.kind === "crew.assign_shift");
    expect(assigned?.payload.volunteerId).not.toBe(s.a.volunteerId);
  });

  it("raises an incident when nobody can cover without breaking a rule, even with models down", async () => {
    const s = scenario((w) => {
      const a = w.shiftAssignments.find((x) => x.status === "missed")!;
      w.shifts.find((x) => x.id === a.shiftId)!.skills = ["skill-nobody-has"];
    }, false);
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
    const res = await runAgent(crewChief, trigger, { eventId: s.world.event.id, payload: s.payload }, s.deps);
    expect(res.status).toBe("fallback");
    const [incident] = inputs(s.propose);
    expect(incident).toMatchObject({
      kind: "incident.create",
      payload: { severity: "high", source: "system" },
    });
    expect(incident!.rationale).toMatch(/missing skill/);
  });
});
