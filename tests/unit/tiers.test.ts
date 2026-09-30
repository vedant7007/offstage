import { describe, expect, it } from "vitest";
import { ActionKind, type Impact } from "@/contracts";
import { assignTier, BASE_TIER, CANCEL_T3_ATTENDEES } from "@/server/policy/tiers";

const settings = { t3MoneyThresholdInr: 10_000, broadcastT3Recipients: 200, facultyApproverRequired: false };
const impact = (o: Partial<Impact> = {}): Impact => ({
  people: 0,
  attendees: 0,
  volunteers: 0,
  sessions: 0,
  channels: [],
  reversible: true,
  ...o,
});

describe("base tiers", () => {
  it("has a base tier for every kind", () => {
    for (const k of ActionKind.options) expect(BASE_TIER[k], k).toMatch(/^T[0-3]$/);
  });

  it("maps tiers to required approvals", () => {
    const r = (kind: Parameters<typeof assignTier>[0]["kind"]) =>
      assignTier({ kind, payload: {}, impact: impact() }, settings);
    expect(r("incident.create")).toMatchObject({ riskTier: "T0", requiredApprovals: 0 });
    expect(r("crew.assign_shift")).toMatchObject({ riskTier: "T1", requiredApprovals: 0 });
    expect(r("schedule.move_session")).toMatchObject({ riskTier: "T2", requiredApprovals: 1 });
    expect(r("certificates.issue_batch")).toMatchObject({ riskTier: "T3", requiredApprovals: 2 });
    expect(r("od.generate_list").riskTier).toBe("T3");
  });
});

describe("money", () => {
  it("any expense is at least T2", () => {
    const r = assignTier(
      { kind: "finance.expense.record", payload: { amountInr: 500 }, impact: impact({ moneyInr: 500 }) },
      settings,
    );
    expect(r.riskTier).toBe("T2");
    expect(r.reasons).toContain("Money record");
  });

  it("above the event threshold is T3, at the threshold stays T2", () => {
    expect(
      assignTier(
        { kind: "finance.expense.record", payload: { amountInr: 10_000 }, impact: impact() },
        settings,
      ).riskTier,
    ).toBe("T2");
    expect(
      assignTier(
        { kind: "finance.expense.record", payload: { amountInr: 10_001 }, impact: impact() },
        settings,
      ).riskTier,
    ).toBe("T3");
  });

  it("uses the event's own threshold", () => {
    const r = assignTier(
      { kind: "finance.income.record", payload: { amountInr: 6_000 }, impact: impact() },
      { ...settings, t3MoneyThresholdInr: 5_000 },
    );
    expect(r.riskTier).toBe("T3");
  });
});

describe("messages", () => {
  const base = { kind: "comms.send_announcement" as const };

  it("a segment announcement is T2", () => {
    expect(
      assignTier(
        {
          ...base,
          payload: { category: "change", segment: { type: "session", ref: "s1" } },
          impact: impact({ people: 60 }),
        },
        settings,
      ).riskTier,
    ).toBe("T2");
  });

  it("official notices are T3 and need faculty when the event says so", () => {
    const r = assignTier(
      {
        ...base,
        payload: { category: "official", segment: { type: "session", ref: "s1" } },
        impact: impact({ people: 10 }),
      },
      { ...settings, facultyApproverRequired: true },
    );
    expect(r).toMatchObject({ riskTier: "T3", requiredApprovals: 2, facultyApprovalRequired: true });
    expect(r.reasons).toContain("Official notice");
  });

  it("faculty is only required on T3", () => {
    const r = assignTier(
      {
        ...base,
        payload: { category: "info", segment: { type: "session", ref: "s1" } },
        impact: impact({ people: 10 }),
      },
      { ...settings, facultyApproverRequired: true },
    );
    expect(r).toMatchObject({ riskTier: "T2", facultyApprovalRequired: false });
  });

  it("broadcasts over the recipient threshold are T3", () => {
    expect(
      assignTier(
        { ...base, payload: { category: "info", segment: { type: "all" } }, impact: impact({ people: 200 }) },
        settings,
      ).riskTier,
    ).toBe("T2");
    expect(
      assignTier(
        { ...base, payload: { category: "info", segment: { type: "all" } }, impact: impact({ people: 201 }) },
        settings,
      ).riskTier,
    ).toBe("T3");
  });

  it("emergency messages always need humans at T3", () => {
    expect(
      assignTier(
        {
          ...base,
          payload: { category: "emergency", segment: { type: "session", ref: "s1" } },
          impact: impact({ people: 3 }),
        },
        settings,
      ).riskTier,
    ).toBe("T3");
  });

  it("a direct message to one person is T2", () => {
    expect(
      assignTier(
        { kind: "comms.send_direct", payload: { category: "info" }, impact: impact({ people: 1 }) },
        settings,
      ).riskTier,
    ).toBe("T2");
  });
});

describe("people and reversibility", () => {
  it("cancelling a session with 50 or more attendees is T3", () => {
    const k = "schedule.cancel_session" as const;
    expect(
      assignTier(
        { kind: k, payload: {}, impact: impact({ attendees: CANCEL_T3_ATTENDEES - 1, people: 49 }) },
        settings,
      ).riskTier,
    ).toBe("T2");
    expect(
      assignTier(
        { kind: k, payload: {}, impact: impact({ attendees: CANCEL_T3_ATTENDEES, people: 50 }) },
        settings,
      ).riskTier,
    ).toBe("T3");
  });

  it("a T1 kind that touches several people becomes T2", () => {
    const r = assignTier({ kind: "crew.create_task", payload: {}, impact: impact({ people: 3 }) }, settings);
    expect(r.riskTier).toBe("T2");
  });

  it("a T1 kind that cannot be undone becomes T2", () => {
    expect(
      assignTier(
        { kind: "helpdesk.reply", payload: {}, impact: impact({ people: 1, reversible: false }) },
        settings,
      ).riskTier,
    ).toBe("T2");
  });

  it("promoting a huge waitlist at once is T3", () => {
    expect(
      assignTier(
        {
          kind: "registration.promote_waitlist",
          payload: {},
          impact: impact({ attendees: 250, people: 250 }),
        },
        settings,
      ).riskTier,
    ).toBe("T3");
  });
});

describe("bundles", () => {
  it("take the highest child tier", () => {
    expect(
      assignTier(
        { kind: "plan.bundle", payload: {}, impact: impact(), childTiers: ["T1", "T2", "T0"] },
        settings,
      ),
    ).toMatchObject({ riskTier: "T2", requiredApprovals: 1 });
    expect(
      assignTier({ kind: "plan.bundle", payload: {}, impact: impact(), childTiers: ["T3", "T1"] }, settings),
    ).toMatchObject({ riskTier: "T3", requiredApprovals: 2 });
  });
});
