import { describe, expect, it, vi } from "vitest";
import { FILLER, ruleIntent, ruleRoute, sentences } from "@/agents/commander/voice";
import { narrateProposal } from "@/server/services/voice-turn";
import { CASES } from "../../voice/cases";

// voice-turn.ts imports the db client, which throws without DATABASE_URL; narrateProposal never touches it.
vi.mock("@/db/client", () => ({ db: {} }));

describe("ruleIntent", () => {
  // "unknown" and "blocked" go through the model and the guard, not the rules.
  for (const c of CASES.filter(
    (c) => typeof c.intent === "string" && c.intent !== "unknown" && c.intent !== "blocked",
  )) {
    it(`routes case ${c.id}: ${c.say}`, () => expect(ruleIntent(c.say)).toBe(c.intent));
  }

  const extra: [string, string][] = [
    ["what's happening today", "briefing"],
    ["how many people registered", "registrations"],
    ["our keynote speaker cancelled", "speaker_cancel"],
    ["the mic in the main auditorium is not working", "projector_voice_note"],
    ["catering budget is blown", "budget_breach"],
    ["our volunteer Ravi is missing", "volunteer_noshow"],
    ["suppose it rains", "whatif"],
    ["give me the final report", "closeout"],
    ["go ahead and approve", "approve"],
    ["Lunch kahan milega", "lunch_confusion"],
  ];
  for (const [say, intent] of extra) {
    it(`routes "${say}" to ${intent}`, () => expect(ruleIntent(say)).toBe(intent));
  }

  for (const say of ["book me a flight to Goa", "tell me a joke"]) {
    it(`returns null for "${say}"`, () => expect(ruleIntent(say)).toBeNull());
  }
});

describe("approve safety", () => {
  it("routes a polite approve and never hints it is done", () => {
    expect(ruleIntent("please approve it")).toBe("approve");
    expect(FILLER.approve).toBeUndefined();
  });
});

describe("sentences", () => {
  it("splits on terminal punctuation", () => {
    expect(sentences("One. Two? Three!")).toEqual(["One.", "Two?", "Three!"]);
  });
  it("caps at max", () => {
    expect(sentences("A. B. C. D. E.", 2)).toEqual(["A.", "B."]);
  });
  it("keeps a trailing fragment", () => {
    expect(sentences("Done. And then")).toEqual(["Done.", "And then"]);
  });
});

describe("narrateProposal", () => {
  it("reads a plan bundle from its payload", () => {
    const p = {
      kind: "plan.bundle",
      proposedBy: { kind: "agent", agent: "commander" },
      summary: "Move Evaluating LLM apps to 4:00 PM",
      payload: {
        options: [{}, {}, {}],
        children: [
          { kind: "crew.assign_shift" },
          { kind: "crew.assign_shift" },
          { kind: "comms.send_announcement" },
          { kind: "comms.send_direct" },
          { kind: "kb.publish_update" },
        ],
      },
    };
    const text = narrateProposal(p as never, []).join(" ");
    for (const s of ["3 options", "2 volunteers", "1 announcement", "direct message", "Helpdesk"]) {
      expect(text).toContain(s);
    }
  });

  it("reads a single proposal as one line led by the agent", () => {
    const p = {
      kind: "comms.send_announcement",
      proposedBy: { kind: "agent", agent: "herald" },
      summary: "Tell attendees lunch is in Hall B.",
      payload: {},
    };
    const lines = narrateProposal(p as never, []);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatch(/^Herald proposes: /);
  });
});

describe("voice actions routing", () => {
  it("keeps whisper's misspelling of remind on the reminder path", () => {
    expect(ruleRoute("Remynd Abhinav about the speaker list.")).toMatchObject({
      intent: "remind_member",
      args: { person: "Abhinav" },
    });
  });
  it("reads the session and the time out of a move", () => {
    expect(ruleRoute("Move the LLM talk to 4pm.")).toMatchObject({
      intent: "move_session",
      args: { session: "LLM talk", time: "4pm" },
    });
  });
  it("is an announcement, not lunch confusion, when it starts with send an announcement", () => {
    expect(ruleRoute("Send an announcement: lunch is moved to 1 PM")?.intent).toBe("announce");
  });
});
