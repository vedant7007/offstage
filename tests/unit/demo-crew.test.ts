import { describe, expect, it } from "vitest";
import { fixtures } from "@/contracts/fixtures";
import { replacementFor, type CrewState } from "@/solvers/crew";

/** The volunteer_noshow demo trigger must hit a shift the crew rules can cover (issue #40). */
describe("volunteer_noshow target", () => {
  const w = fixtures.eventFull();
  const state: CrewState = {
    volunteers: w.volunteers,
    shifts: w.shifts,
    assignments: w.shiftAssignments,
    availability: w.availability,
  };

  it("has at least one legal replacement for the assignment the trigger marks missed", () => {
    const shift = w.shifts.find((s) => s.role === "Lab support, Lab 204")!;
    // Same choice as src/db/demo/trigger.ts: first assigned volunteer by assignment id.
    const target = w.shiftAssignments
      .filter((a) => a.shiftId === shift.id && a.status === "assigned")
      .sort((a, b) => (a.id < b.id ? -1 : 1))[0]!;
    const options = replacementFor(state, shift.id, target.volunteerId);
    expect(options.length).toBeGreaterThan(0);
  });

  it("every day 1 lab or AV support shift has cover for each of its volunteers", () => {
    const labShifts = w.shifts.filter(
      (s) =>
        /^(Lab support|AV,)/.test(s.role) && s.startsAt < "2026-10-24T18:30:00.000Z" && s.startsAt > w.now,
    );
    expect(labShifts.length).toBeGreaterThan(0);
    for (const shift of labShifts) {
      for (const a of w.shiftAssignments.filter((x) => x.shiftId === shift.id)) {
        expect(
          replacementFor(state, shift.id, a.volunteerId).length,
          `${shift.role} / ${a.volunteerId}`,
        ).toBeGreaterThan(0);
      }
    }
  });
});
