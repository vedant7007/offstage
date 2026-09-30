/** Seeded demo personas and the DEMO_MODE switch. No database imports, so any module can use it. */
import type { DemoPersona } from "@/contracts/api";

/** Login emails of the seeded personas (blueprint Section 11). */
export const PERSONA_EMAILS: Record<DemoPersona, string> = {
  owner: "vedant@sutradhar.test",
  program_lead: "abhinav@sutradhar.test",
  comms_lead: "thanishka@sutradhar.test",
  faculty: "dr.rao@sutradhar.test",
  volunteer: "ravi@sutradhar.test",
  attendee: "sneha@sutradhar.test",
  sponsor: "partners@acme.test",
  viewer: "judge@sutradhar.test",
};

export function demoModeOn(): boolean {
  return process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1";
}
