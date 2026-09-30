import { beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError } from "ai";
import { MockLanguageModelV4 } from "ai/test";

let model: MockLanguageModelV4;
vi.mock("@/ai/router/tiers", () => ({ chain: () => [{ provider: "groq", model: "openai/gpt-oss-120b" }] }));
vi.mock("@/ai/router/providers", () => ({ languageModel: () => model, providerOptions: () => undefined }));

const { runAgent } = await import("@/agents/runtime/run");
const { memoryTrace } = await import("@/agents/runtime/memory-trace");
const { worldServices } = await import("@/agents/runtime/services");
const { commander } = await import("@/agents/commander/config");
const { withoutConflicts, movedText, releasedText, composeBundle } =
  await import("@/agents/commander/compose");
const { _resetCircuits } = await import("@/ai/router/router");
const { _resetBudget } = await import("@/ai/router/budget");
import { fixtures, type EventWorld } from "@/contracts/fixtures";
import type { ProposeResult } from "@/agents/runtime/contracts";

const usage = {
  inputTokens: { total: 80, noCache: 80, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 30, text: 30, reasoning: 0 },
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

/** The seed after `demo:trigger speaker_cancel`. */
function scenario() {
  const w: EventWorld = fixtures.eventFull();
  const keynote = w.sessions.find((s) => s.title === "Keynote: Open source careers")!;
  const evals = w.sessions.find((s) => s.title === "Evaluating LLM apps")!;
  keynote.status = "cancelled";
  const aud = w.rooms.find((r) => r.id === keynote.roomId)!;
  // Seeded for this scenario (#53): the keynote's hall shift starts empty, Evaluating LLM apps has two.
  const keynoteShift = w.shifts.find((x) => x.sessionId === keynote.id)!;
  const evalsShift = w.shifts.find((x) => x.sessionId === evals.id)!;
  expect(w.shiftAssignments.filter((x) => x.shiftId === keynoteShift.id)).toHaveLength(0);
  const free = w.shiftAssignments
    .filter((x) => x.shiftId === evalsShift.id)
    .map((x) => w.volunteers.find((v) => v.id === x.volunteerId)!);
  expect(free).toHaveLength(2);
  const propose = vi.fn(
    async (_a: unknown, input: { kind: string }) =>
      ({
        status: "created",
        proposal: { id: "p-bundle", status: "pending", riskTier: "T3", kind: input.kind },
      }) as unknown as ProposeResult,
  );
  const trace = memoryTrace();
  const deps = {
    propose: propose as never,
    trace: trace.store,
    services: worldServices(w),
    eventContext: async () => "HackNova 2026",
  };
  const payload = {
    sessionId: keynote.id,
    reason: "Speaker cancelled: flight cancelled",
    speakerIds: keynote.speakerIds,
    registeredCount: 240,
  };
  return { w, keynote, evals, aud, free, keynoteShift, evalsShift, propose, trace, deps, payload };
}
const trigger = {
  type: "domain_event" as const,
  eventType: "session.cancelled" as const,
  ref: "de-speaker-cancel",
};
type Bundle = {
  kind: string;
  payload: {
    title: string;
    children: { kind: string; payload: Record<string, unknown>; proposedBy: string; summary: string }[];
    ripple: {
      sessions: unknown[];
      volunteers: unknown[];
      announcements: { recipients: number }[];
      attendees: { count: number };
      kbAnswers: unknown[];
    };
    options: { id: string; chosen: boolean }[];
  };
};

beforeEach(() => {
  _resetCircuits();
  _resetBudget();
});

describe("commander on speaker_cancel", () => {
  it("proposes one bundle: fill the slot, move the crew, tell both audiences, update the helpdesk notes", async () => {
    const s = scenario();
    model = scripted(
      call("t1", "get_options", {}),
      call("t2", "choose_option", {
        optionId: "opt-1",
        rationale: "Keeps the prime auditorium slot busy; one move, no shortfall.",
      }),
      text("Proposed the plan."),
    );
    const res = await runAgent(commander, trigger, { eventId: s.w.event.id, payload: s.payload }, s.deps);
    expect(res.status).toBe("succeeded");
    expect(s.propose).toHaveBeenCalledOnce();
    const b = s.propose.mock.calls[0]![1] as unknown as Bundle;
    const kinds = b.payload.children.map((c) => c.kind);

    // Schedule: "Evaluating LLM apps" takes the keynote's 4 PM auditorium slot. No second cancel of the keynote.
    expect(b.payload.children[0]).toMatchObject({
      kind: "schedule.move_session",
      payload: { sessionId: s.evals.id, newStartsAt: s.keynote.startsAt, newRoomId: s.aud.id },
    });
    expect(kinds).not.toContain("schedule.cancel_session");
    // Crew: both hall volunteers follow the session to the keynote's hall shift.
    for (const v of s.free) {
      expect(b.payload.children).toContainEqual(
        expect.objectContaining({
          kind: "crew.unassign_shift",
          payload: expect.objectContaining({ shiftId: s.evalsShift.id, volunteerId: v.id }),
        }),
      );
      expect(b.payload.children).toContainEqual(
        expect.objectContaining({
          kind: "crew.assign_shift",
          payload: { shiftId: s.keynoteShift.id, volunteerId: v.id },
        }),
      );
    }
    // Comms: the keynote audience hears what replaces it; the moved session's audience hears the new time and room.
    const notes = b.payload.children.filter((c) => c.kind === "comms.send_announcement");
    expect(notes).toHaveLength(2);
    const bodies = notes.map((n) => Object.values(n.payload.bodyByChannel as Record<string, string>)[0]!);
    expect(bodies[0]).toContain(`"${s.keynote.title}"`);
    expect(bodies[0]).toContain(`In its place, "${s.evals.title}" starts at 4:00 PM in ${s.aud.name}.`);
    expect(bodies[1]).toContain(`It is now Sat, 24 Oct, 4:00 PM in ${s.aud.name}`);
    expect(notes.map((n) => n.payload.channels)).toEqual([
      ["in_app", "email", "telegram", "whatsapp"],
      ["in_app", "email", "telegram", "whatsapp"],
    ]);
    // Helpdesk: a schedule note it will cite.
    expect(b.payload.children.at(-1)).toMatchObject({
      kind: "kb.publish_update",
      payload: { title: "Schedule changes", public: true },
    });
    // Ripple for the console.
    expect(b.payload.ripple.volunteers).toHaveLength(2);
    expect(b.payload.ripple.announcements.map((a) => a.recipients)).toEqual([
      s.keynote.registeredCount,
      s.evals.registeredCount,
    ]);
    // Distinct people across both sessions, and no one twice in the sample.
    const both = new Set(
      s.w.registrations
        .filter(
          (r) =>
            r.status === "confirmed" &&
            (r.sessionChoices.includes(s.keynote.id) || r.sessionChoices.includes(s.evals.id)),
        )
        .map((r) => r.id),
    );
    expect(b.payload.ripple.attendees.count).toBe(both.size);
    const sample = (b.payload.ripple.attendees as unknown as { sample: { registrationId: string }[] }).sample;
    expect(new Set(sample.map((x) => x.registrationId)).size).toBe(sample.length);
    expect(b.payload.options.filter((o) => o.chosen)).toHaveLength(1);
  });

  it("still proposes the solver's first option as one bundle when models are down", async () => {
    const s = scenario();
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
    const res = await runAgent(commander, trigger, { eventId: s.w.event.id, payload: s.payload }, s.deps);
    expect(res.status).toBe("fallback");
    const b = s.propose.mock.calls[0]![1] as unknown as Bundle;
    expect(b.kind).toBe("plan.bundle");
    expect(b.payload.children.map((c) => c.kind)).toContain("comms.send_announcement");
  });

  it("drops a later child that would set the same thing differently", () => {
    const move = (at: string) => ({
      kind: "schedule.move_session" as const,
      payload: { sessionId: "s1", newStartsAt: at },
      summary: at,
      rationale: "",
      proposedBy: "scheduler" as const,
    });
    const { children, dropped } = withoutConflicts([move("a"), move("a"), move("b")]);
    expect(children).toHaveLength(1);
    expect(dropped.map((d) => d.summary)).toEqual(["b"]);
  });
});

describe("crew notes", () => {
  it("names the room once when the role already carries it", () => {
    expect(movedText("Hall support, Main Auditorium", "Main Auditorium", "Sat, 24 Oct, 3:45 PM")).toBe(
      "Your shift moved: Hall support, Main Auditorium, now Sat, 24 Oct, 3:45 PM. Reply OK to confirm.",
    );
    expect(movedText("Registration desk", "Foyer", "Sat, 24 Oct, 9:00 AM")).toBe(
      "Your shift moved: Registration desk is now at Foyer, Sat, 24 Oct, 9:00 AM. Reply OK to confirm.",
    );
  });

  it("tells a released volunteer what they were released from", () => {
    expect(releasedText("Hall support, Main Auditorium", "Sat, 24 Oct, 3:45 PM")).toBe(
      "You're released from Hall support, Main Auditorium at Sat, 24 Oct, 3:45 PM. Crew Chief may reassign you soon.",
    );
  });
});

describe("released crew", () => {
  it("tells crew on a cancelled session's empty slot that they are released", async () => {
    const s = scenario();
    const asg = s.w.shiftAssignments.find((x) => x.shiftId === s.evalsShift.id)!;
    asg.shiftId = s.keynoteShift.id; // someone was on the keynote's hall shift
    const b = (await composeBundle(
      worldServices(s.w),
      {
        change: { type: "cancel", sessionId: s.keynote.id, reason: "Speaker cancelled" },
        state: { sessions: s.w.sessions, rooms: s.w.rooms },
        options: [{ id: "opt-gap", label: "Leave the slot empty", actions: [], metrics: {} as never }],
      },
      "opt-gap",
      "Leave it.",
    )) as unknown as Bundle;
    const note = b.payload.children.find(
      (c) => c.kind === "comms.send_direct" && (c.payload.recipient as { id: string }).id === asg.volunteerId,
    );
    expect(note?.payload.channels).toContain("in_app");
    expect(Object.values(note!.payload.bodyByChannel as Record<string, string>)[0]).toMatch(
      /^You're released from .+ at Sat, 24 Oct, .+\. Crew Chief may reassign you soon\.$/,
    );
  });
});
