import { describe, expect, it } from "vitest";
import type { EventBrief } from "@/contracts";
import { datesIn, missing, planFromBrief, readAnswer, readByRules, rupees } from "@/agents/commander/intake";

const NOW = "2026-09-30T06:00:00.000Z";

describe("intake reading", () => {
  it("reads a paragraph the way organizers write it", () => {
    const b = readByRules(
      'We are running a hackathon called "CodeSprint" at MVGR College on 14-15 Nov for 300 students, budget is 3 lakh.',
      NOW,
    );
    expect(b).toMatchObject({
      type: "hackathon",
      name: "CodeSprint",
      venue: "MVGR College",
      expectedAttendance: 300,
      budgetInr: 300_000,
      dates: ["2026-11-14", "2026-11-15"],
    });
    expect(missing(b)).toEqual([]);
  });

  it("rolls a date without a year into the next occurrence, and reads money shorthands", () => {
    expect(datesIn("on 5 Jan", NOW)).toEqual(["2027-01-05"]);
    expect(datesIn("2026-12-01", NOW)).toEqual(["2026-12-01"]);
    expect(rupees("50k")).toBe(50_000);
    expect(rupees("2,00,000")).toBe(200_000);
  });

  it("takes a quoted name whole", () => {
    expect(readByRules('A workshop called "Build with LLMs" at Seminar Hall 2', NOW).name).toBe(
      "Build with LLMs",
    );
    expect(readByRules("It is called Tech Carnival on 3 Dec", NOW).name).toBe("Tech Carnival");
  });

  it("reads short answers in the context of the question", () => {
    expect(readAnswer("Workshop", ["type"], NOW)).toMatchObject({ type: "workshop" });
    expect(readAnswer("450", ["expectedAttendance"], NOW)).toMatchObject({ expectedAttendance: 450 });
    expect(readAnswer("Main Hall, Block C", ["venue"], NOW)).toMatchObject({ venue: "Main Hall, Block C" });
    expect(missing({ name: "X" })).toEqual(["type", "dates", "expectedAttendance", "budgetInr", "venue"]);
  });
});

describe("plan from brief", () => {
  const brief = {
    name: "CodeSprint",
    type: "hackathon",
    dates: ["2026-11-14", "2026-11-15"],
    venue: "MVGR College",
    expectedAttendance: 300,
    budgetInr: 300_000,
  } as EventBrief;
  const team = [
    { agent: "commander", humanLeadRole: "owner", purpose: "Runs the show" },
    { agent: "sponsorship", humanLeadRole: "lead", purpose: "Sponsors" },
  ] as const;

  it("dates milestones back from the first day, splits the budget and keeps the total", () => {
    const p = planFromBrief(brief, NOW, [...team]);
    const venue = p.milestones.find((m) => m.title === "Confirm venue and rooms")!;
    expect(venue.dueOn).toBe("2026-09-30"); // 45 days before is past, so today
    expect(p.milestones.find((m) => m.title === "Send final food count to caterer")!.dueOn).toBe(
      "2026-11-11",
    );
    expect(p.budget.categories.find((c) => c.key === "catering")!.capInr).toBe(105_000);
    expect(p.budget.totalInr).toBe(p.budget.categories.reduce((a, c) => a + c.capInr, 0));
    expect(p.agentTeam.every((a) => a.enabled)).toBe(true);
    expect(p.risks.some((r) => r.title.includes("Food counts"))).toBe(true);
  });

  it("turns agents off by template", () => {
    const p = planFromBrief({ ...brief, type: "workshop" }, NOW, [...team]);
    expect(p.agentTeam.find((a) => a.agent === "sponsorship")!.enabled).toBe(false);
  });
});
