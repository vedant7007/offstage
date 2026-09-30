import { describe, expect, it } from "vitest";
import {
  detectClashes,
  isValid,
  replanOptions,
  type Constraints,
  type ScheduleAction,
  type ScheduleState,
  type SolverSession,
} from "@/solvers/schedule";

// HackNova day 1 (24 Oct 2026). Times are IST in the helper, stored as UTC.
const t = (hhmm: string) => new Date(`2026-10-24T${hhmm}:00+05:30`).toISOString();
const session = (
  id: string,
  roomId: string,
  from: string,
  to: string,
  registeredCount: number,
  speakerIds: string[],
  extra: Partial<SolverSession> = {},
): SolverSession => ({
  id,
  title: `Session ${id}`,
  roomId,
  kind: "talk",
  startsAt: t(from),
  endsAt: t(to),
  capacity: 400,
  registeredCount,
  speakerIds,
  status: "scheduled",
  ...extra,
});

const rooms = [
  { id: "aud", name: "Main Auditorium", capacity: 400 },
  { id: "lab204", name: "Lab 204", capacity: 60 },
  { id: "lab101", name: "Lab 101", capacity: 80 },
  { id: "sem3", name: "Seminar Hall 3", capacity: 120 },
];
const state: ScheduleState = {
  rooms,
  sessions: [
    session("s1", "aud", "09:30", "10:30", 300, ["sp1"], { kind: "keynote" }),
    session("s2", "lab204", "11:00", "12:30", 95, ["sp2"], { kind: "workshop", trackId: "t-ai" }),
    session("s3", "sem3", "11:00", "12:00", 80, ["sp3"], { trackId: "t-hw" }),
    session("s4", "lab101", "11:30", "12:30", 0, ["sp3"], { kind: "judging" }),
    session("lunch", "aud", "12:30", "14:00", 0, [], { kind: "meal" }),
    session("s5", "sem3", "14:00", "15:00", 70, ["sp4"], { trackId: "t-hw" }),
    session("s6", "sem3", "15:30", "16:30", 60, ["sp5"], { trackId: "t-hw" }),
  ],
};
const k: Constraints = {
  dayStart: t("09:00"),
  dayEnd: t("18:00"),
  protectedWindows: [{ start: t("12:30"), end: t("14:00") }],
};
const inLunch = (a: ScheduleAction) =>
  a.kind === "schedule.move_session" &&
  Date.parse(a.payload.newStartsAt) < Date.parse(t("14:00")) &&
  Date.parse(t("12:30")) < Date.parse(a.payload.newEndsAt);

describe("detectClashes", () => {
  it("finds the seeded over-capacity lab and the speaker who is also judging", () => {
    expect(detectClashes(state)).toEqual([
      { type: "over_capacity", sessionId: "s2", roomId: "lab204", capacity: 60, registered: 95 },
      { type: "speaker_double_booked", speakerId: "sp3", sessionIds: ["s3", "s4"] },
    ]);
  });

  it("counts attendees who chose two overlapping sessions, and ignores cancelled sessions", () => {
    const withChoices = { ...state, choices: [{ registrationId: "r1", sessionIds: ["s2", "s3"] }] };
    expect(detectClashes(withChoices)).toContainEqual({
      type: "attendee_overlap",
      sessionIds: ["s2", "s3"],
      attendees: 1,
    });
    const cancelled = {
      ...state,
      sessions: state.sessions.map((s) => (s.id === "s4" ? { ...s, status: "cancelled" as const } : s)),
    };
    expect(detectClashes(cancelled).some((c) => c.type === "speaker_double_booked")).toBe(false);
  });
});

describe("replanOptions", () => {
  it("offers up to 3 valid options when a speaker cancels, fewest moves first", () => {
    const opts = replanOptions(state, { type: "cancel", sessionId: "s5", reason: "Speaker cancelled" }, k);
    expect(opts.length).toBeGreaterThanOrEqual(2);
    expect(opts.length).toBeLessThanOrEqual(3);
    expect(opts.map((o) => o.id)).toEqual(opts.map((_, i) => `opt-${i + 1}`));
    expect(opts[0]!.actions).toEqual([
      {
        kind: "schedule.cancel_session",
        payload: { sessionId: "s5", reason: "Speaker cancelled", notifyAttendees: true },
      },
    ]);
    expect(opts[0]!.metrics).toMatchObject({ movedSessions: 0, cancelledSessions: 1, attendeesAffected: 70 });
    // Pull the next Hardware track session into the freed 14:00 slot.
    const pull = opts.find((o) => o.actions.length === 2)!;
    expect(pull.actions[1]).toEqual({
      kind: "schedule.move_session",
      payload: { sessionId: "s6", newStartsAt: t("14:00"), newEndsAt: t("15:00") },
    });
    expect(pull.label).toContain("14:00");
    for (const o of opts) {
      expect(isValid(state, o.actions)).toBe(true);
      expect(o.actions.some(inLunch)).toBe(false);
    }
  });

  it("moves a delayed session without landing in lunch, and offers the room-wide shift", () => {
    const opts = replanOptions(state, { type: "delay", sessionId: "s5", minutes: 30 }, k);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.some((o) => o.label.startsWith("Shift Seminar Hall 3 by 30 minutes"))).toBe(true);
    for (const o of opts) {
      expect(isValid(state, o.actions)).toBe(true);
      expect(o.actions.some(inLunch)).toBe(false);
    }
  });

  it("rehomes a lost room's sessions into rooms that fit, fixing the over-capacity lab", () => {
    const [opt] = replanOptions(state, { type: "room_loss", roomId: "lab204" }, k);
    expect(opt!.actions).toEqual([
      {
        kind: "schedule.move_session",
        payload: { sessionId: "s2", newStartsAt: t("11:00"), newEndsAt: t("12:30"), newRoomId: "aud" },
      },
    ]);
    expect(opt!.metrics.capacityShortfall).toBe(0);
  });

  it("is deterministic and only ever returns valid options for any session", () => {
    expect(replanOptions(state, { type: "cancel", sessionId: "s3", reason: "x" }, k)).toEqual(
      replanOptions(state, { type: "cancel", sessionId: "s3", reason: "x" }, k),
    );
    for (const s of state.sessions) {
      for (const change of [
        { type: "cancel" as const, sessionId: s.id, reason: "x" },
        { type: "delay" as const, sessionId: s.id, minutes: 45 },
        { type: "move" as const, sessionId: s.id },
      ]) {
        for (const o of replanOptions(state, change, k))
          expect(isValid(state, o.actions), `${s.id} ${change.type}`).toBe(true);
      }
    }
    expect(replanOptions(state, { type: "cancel", sessionId: "nope", reason: "x" }, k)).toEqual([]);
  });
});
