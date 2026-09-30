import { afterEach, describe, expect, it } from "vitest";
import { demoInboxAllowed, isPersonaEmail } from "@/server/channels/demo-inbox";

const saved = { mode: process.env.DEMO_MODE, list: process.env.DEMO_REAL_RECIPIENTS };
afterEach(() => {
  process.env.DEMO_MODE = saved.mode;
  process.env.DEMO_REAL_RECIPIENTS = saved.list;
});

describe("demo inbox eligibility", () => {
  it("allows seeded personas and allowlisted emails, only in demo mode", () => {
    process.env.DEMO_MODE = "true";
    process.env.DEMO_REAL_RECIPIENTS = "+919876543210, Team.Member@Example.com";
    expect(demoInboxAllowed("sneha@sutradhar.test")).toBe(true);
    expect(isPersonaEmail("SNEHA@sutradhar.test")).toBe(true);
    expect(demoInboxAllowed("team.member@example.com")).toBe(true);
    expect(isPersonaEmail("team.member@example.com")).toBe(false);
    expect(demoInboxAllowed("someone.else@example.com")).toBe(false);

    process.env.DEMO_MODE = "false";
    expect(demoInboxAllowed("sneha@sutradhar.test")).toBe(false);
    expect(demoInboxAllowed("team.member@example.com")).toBe(false);
  });
});
