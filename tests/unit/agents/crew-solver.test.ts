import { describe, expect, it } from "vitest";
import {
  assignCrew,
  checkAssignment,
  hoursOf,
  replacementFor,
  type CrewShift,
  type CrewState,
  type CrewVolunteer,
} from "@/solvers/crew";

const t = (hhmm: string) => new Date(`2026-10-24T${hhmm}:00+05:30`).toISOString();
const shift = (
  id: string,
  from: string,
  to: string,
  requiredCount: number,
  skills: string[] = [],
): CrewShift => ({
  id,
  role: id,
  startsAt: t(from),
  endsAt: t(to),
  requiredCount,
  skills,
});
const vol = (id: string, skills: string[], maxHours: number, active = true): CrewVolunteer => ({
  id,
  name: id,
  skills,
  maxHours,
  active,
});

const base: CrewState = {
  volunteers: [
    vol("ravi", ["av", "tech"], 6),
    vol("meera", ["registration"], 8),
    vol("arjun", ["av"], 4),
    vol("zoya", ["av"], 8, false),
    vol("kiran", [], 8),
  ],
  shifts: [
    shift("reg-am", "08:30", "10:30", 2),
    shift("av-204", "10:30", "12:30", 1, ["av"]),
    shift("av-aud", "12:30", "14:30", 1, ["av"]),
    shift("reg-pm", "13:00", "15:00", 1),
  ],
  assignments: [],
};

describe("checkAssignment", () => {
  it("refuses missing skills, inactive people, overlaps and max hours", () => {
    expect(checkAssignment(base, "av-204", "meera")).toEqual(["missing_skill"]);
    expect(checkAssignment(base, "av-204", "zoya")).toEqual(["inactive"]);
    const busy = {
      ...base,
      assignments: [{ shiftId: "av-aud", volunteerId: "kiran", status: "assigned" as const }],
    };
    expect(checkAssignment(busy, "reg-pm", "kiran")).toContain("overlap");
    const tired = {
      ...base,
      assignments: [{ shiftId: "av-204", volunteerId: "arjun", status: "assigned" as const }],
    };
    expect(checkAssignment(tired, "reg-am", "arjun")).toEqual([]); // 2h + 2h is exactly his 4h max
    expect(
      checkAssignment(
        {
          ...tired,
          assignments: [
            ...tired.assignments,
            { shiftId: "reg-am", volunteerId: "arjun", status: "assigned" },
          ],
        },
        "av-aud",
        "arjun",
      ),
    ).toContain("max_hours");
  });

  it("requires a 30 minute break after 4 hours of continuous work", () => {
    const s: CrewState = {
      ...base,
      shifts: [
        shift("a", "08:30", "12:30", 1),
        shift("b", "12:45", "13:45", 1),
        shift("c", "13:00", "14:00", 1),
      ],
      assignments: [{ shiftId: "a", volunteerId: "kiran", status: "assigned" }],
    };
    expect(checkAssignment(s, "b", "kiran")).toEqual(["needs_break"]); // 15 minute gap
    expect(checkAssignment(s, "c", "kiran")).toEqual([]); // 30 minute gap
  });

  it("respects availability windows when a volunteer has them", () => {
    const s = { ...base, availability: [{ volunteerId: "kiran", start: t("08:00"), end: t("12:00") }] };
    expect(checkAssignment(s, "reg-am", "kiran")).toEqual([]);
    expect(checkAssignment(s, "reg-pm", "kiran")).toEqual(["unavailable"]);
  });
});

describe("assignCrew", () => {
  it("fills every seat it legally can, spreads hours, and explains the rest", () => {
    const { assignments, unfilled } = assignCrew(base);
    expect(assignments).toHaveLength(5);
    // Replay in order: every planned assignment was allowed at the time it was made.
    const replay: CrewState = { ...base, assignments: [] };
    for (const a of assignments) {
      expect(checkAssignment(replay, a.shiftId, a.volunteerId), `${a.volunteerId} on ${a.shiftId}`).toEqual(
        [],
      );
      replay.assignments.push({ ...a, status: "assigned" });
    }
    const load = base.volunteers.map((v) => hoursOf(replay, v.id));
    expect(Math.max(...load)).toBeLessThanOrEqual(4);
    expect(unfilled).toEqual([]);

    const tight = { ...base, shifts: [...base.shifts, shift("av-late", "15:00", "17:00", 3, ["av"])] };
    const res = assignCrew(tight);
    const late = res.unfilled.find((u) => u.shiftId === "av-late")!;
    expect(late.missing).toBeGreaterThan(0);
    expect(late.refusals.missing_skill).toBe(2); // meera and kiran
    expect(late.refusals.inactive).toBe(1); // zoya
  });

  it("is deterministic", () => {
    expect(assignCrew(base)).toEqual(assignCrew(base));
  });
});

describe("replacementFor", () => {
  it("ranks allowed replacements for a no-show, fewest hours first, never the no-show", () => {
    const s: CrewState = {
      ...base,
      assignments: [
        { shiftId: "av-204", volunteerId: "arjun", status: "missed" },
        { shiftId: "reg-am", volunteerId: "ravi", status: "assigned" },
      ],
    };
    const picks = replacementFor(s, "av-204", "arjun");
    expect(picks.map((p) => p.volunteerId)).toEqual(["ravi"]); // the only other active av volunteer
    expect(picks[0]!.hours).toBe(2);
    expect(
      replacementFor({ ...s, volunteers: s.volunteers.filter((v) => v.id !== "ravi") }, "av-204", "arjun"),
    ).toEqual([]);
  });
});
