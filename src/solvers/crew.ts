// Crew solver. Pure and deterministic: fills shifts fairly, finds no-show replacements, and refuses any
// assignment that breaks a rule (skills, availability, overlap, max hours, a 30 minute break after 4 hours).

import type { Shift, ShiftAssignment, Volunteer } from "@/agents/runtime/contracts";

export type CrewVolunteer = Pick<Volunteer, "id" | "name" | "skills" | "maxHours" | "active">;
export type CrewShift = Pick<Shift, "id" | "role" | "startsAt" | "endsAt" | "requiredCount" | "skills">;
export type CrewAssignment = Pick<ShiftAssignment, "shiftId" | "volunteerId" | "status">;
/** When a volunteer said they can work. A volunteer with no windows is treated as always available. */
export type AvailabilityWindow = { volunteerId: string; start: string; end: string };

export type CrewState = {
  volunteers: CrewVolunteer[];
  shifts: CrewShift[];
  assignments: CrewAssignment[];
  availability?: AvailabilityWindow[];
};

export type Refusal =
  "inactive" | "missing_skill" | "unavailable" | "overlap" | "max_hours" | "needs_break" | "already_on_shift";

export const MAX_CONTINUOUS_MINUTES = 240;
export const MIN_BREAK_MINUTES = 30;

const ms = (iso: string) => Date.parse(iso);
const hours = (s: CrewShift) => (ms(s.endsAt) - ms(s.startsAt)) / 3_600_000;
const ACTIVE = new Set(["assigned", "checked_in", "done"]);

function shiftsOf(state: CrewState, volunteerId: string, extra: CrewAssignment[] = []): CrewShift[] {
  const byId = new Map(state.shifts.map((s) => [s.id, s]));
  return [...state.assignments, ...extra]
    .filter((a) => a.volunteerId === volunteerId && ACTIVE.has(a.status))
    .map((a) => byId.get(a.shiftId))
    .filter((s): s is CrewShift => Boolean(s));
}

export function hoursOf(state: CrewState, volunteerId: string, extra: CrewAssignment[] = []): number {
  return shiftsOf(state, volunteerId, extra).reduce((sum, s) => sum + hours(s), 0);
}

/** Longest stretch of work where gaps shorter than the minimum break do not count as rest. */
function longestStretchMinutes(shifts: CrewShift[]): number {
  const sorted = [...shifts].sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
  let longest = 0;
  let blockStart = 0;
  let blockEnd = -Infinity;
  for (const s of sorted) {
    if (ms(s.startsAt) - blockEnd >= MIN_BREAK_MINUTES * 60_000) blockStart = ms(s.startsAt);
    blockEnd = Math.max(blockEnd, ms(s.endsAt));
    longest = Math.max(longest, (blockEnd - blockStart) / 60_000);
  }
  return longest;
}

/** Every rule this assignment would break; empty means allowed. */
export function checkAssignment(
  state: CrewState,
  shiftId: string,
  volunteerId: string,
  planned: CrewAssignment[] = [],
): Refusal[] {
  const v = state.volunteers.find((x) => x.id === volunteerId);
  const shift = state.shifts.find((x) => x.id === shiftId);
  if (!v || !shift) return ["inactive"];
  const reasons: Refusal[] = [];
  const mine = shiftsOf(state, volunteerId, planned);
  if (!v.active) reasons.push("inactive");
  if (mine.some((s) => s.id === shiftId)) reasons.push("already_on_shift");
  if (!shift.skills.every((sk) => v.skills.includes(sk))) reasons.push("missing_skill");
  const windows = (state.availability ?? []).filter((w) => w.volunteerId === volunteerId);
  if (
    windows.length &&
    !windows.some((w) => ms(w.start) <= ms(shift.startsAt) && ms(shift.endsAt) <= ms(w.end))
  )
    reasons.push("unavailable");
  if (
    mine.some(
      (s) => s.id !== shiftId && ms(s.startsAt) < ms(shift.endsAt) && ms(shift.startsAt) < ms(s.endsAt),
    )
  )
    reasons.push("overlap");
  if (hoursOf(state, volunteerId, planned) + hours(shift) > v.maxHours) reasons.push("max_hours");
  if (longestStretchMinutes([...mine.filter((s) => s.id !== shiftId), shift]) > MAX_CONTINUOUS_MINUTES)
    reasons.push("needs_break");
  return reasons;
}

/** Allowed volunteers for a shift, fairest first: fewest hours, then fewest extra skills, then id. */
export function candidates(
  state: CrewState,
  shiftId: string,
  planned: CrewAssignment[] = [],
  exclude: string[] = [],
) {
  const shift = state.shifts.find((s) => s.id === shiftId);
  if (!shift) return [];
  return state.volunteers
    .filter((v) => !exclude.includes(v.id) && checkAssignment(state, shiftId, v.id, planned).length === 0)
    .map((v) => ({
      volunteerId: v.id,
      hours: hoursOf(state, v.id, planned),
      spareSkills: v.skills.length - shift.skills.length,
    }))
    .sort(
      (a, b) =>
        a.hours - b.hours || a.spareSkills - b.spareSkills || a.volunteerId.localeCompare(b.volunteerId),
    );
}

export type Unfilled = { shiftId: string; missing: number; refusals: Partial<Record<Refusal, number>> };

/** Fills open seats on every shift, earliest shift first. Explains every seat it could not fill. */
export function assignCrew(state: CrewState): {
  assignments: { shiftId: string; volunteerId: string }[];
  unfilled: Unfilled[];
} {
  const planned: CrewAssignment[] = [];
  const unfilled: Unfilled[] = [];
  const shifts = [...state.shifts].sort(
    (a, b) => ms(a.startsAt) - ms(b.startsAt) || a.id.localeCompare(b.id),
  );
  for (const shift of shifts) {
    const filled = [...state.assignments, ...planned].filter(
      (a) => a.shiftId === shift.id && ACTIVE.has(a.status),
    ).length;
    let open = shift.requiredCount - filled;
    while (open > 0) {
      const [best] = candidates(state, shift.id, planned);
      if (!best) break;
      planned.push({ shiftId: shift.id, volunteerId: best.volunteerId, status: "assigned" });
      open--;
    }
    if (open > 0) {
      const refusals: Unfilled["refusals"] = {};
      for (const v of state.volunteers)
        for (const r of checkAssignment(state, shift.id, v.id, planned)) refusals[r] = (refusals[r] ?? 0) + 1;
      unfilled.push({ shiftId: shift.id, missing: open, refusals });
    }
  }
  return { assignments: planned.map(({ shiftId, volunteerId }) => ({ shiftId, volunteerId })), unfilled };
}

/** Best replacements for a no-show, up to 3, never the person who missed it. */
export function replacementFor(state: CrewState, shiftId: string, missedVolunteerId: string) {
  // The missed assignment no longer counts toward anyone's load.
  const without: CrewState = {
    ...state,
    assignments: state.assignments.filter(
      (a) => !(a.shiftId === shiftId && a.volunteerId === missedVolunteerId),
    ),
  };
  return candidates(without, shiftId, [], [missedVolunteerId]).slice(0, 3);
}
