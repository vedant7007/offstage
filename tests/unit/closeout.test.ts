import { describe, expect, it } from "vitest";
import { onlyGivenNumbers } from "@/agents/runtime/wording";

import {
  closeoutFactLines as factLines,
  closeoutRulesSummary as rulesSummary,
  type CloseoutFacts,
} from "@/agents/chronicler/logic";

const facts: CloseoutFacts = {
  eventId: "ev",
  eventName: "HackNova 2026",
  attendance: { registered: 360, confirmed: 320, attended: 223, noShows: 97, ratePct: 69.7 },
  sessions: { total: 16, changed: 1, cancelled: 1 },
  messages: [{ channel: "email", real: 0, mock: 334, failed: 0, skipped: 0 }],
  inAppNotifications: 4,
  helpdesk: { questions: 5, blocked: 1, escalations: 1, escalationsOpen: 1 },
  incidents: { total: 2, resolved: 1, open: 1, emergencies: 0 },
  budget: { capInr: 300000, spentInr: 120000, incomeInr: 122000, categories: [] },
  approvals: [],
  certificates: { issued: 0, revoked: 0, byKind: [] },
  odLetters: { lists: 0, students: 0 },
  lessons: [],
};

describe("close-out summary guard", () => {
  it("the template summary only uses numbers that are in the report", () => {
    const lines = factLines(facts);
    expect(onlyGivenNumbers(rulesSummary(facts), lines)).toBe(true);
  });
  it("a summary with an invented number fails the check", () => {
    expect(onlyGivenNumbers("About 250 people attended.", factLines(facts))).toBe(false);
  });
});
