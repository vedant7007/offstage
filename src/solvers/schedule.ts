// Schedule solver. Pure and deterministic: the Scheduler agent ranks and explains these options,
// it never invents its own. Every option returned here is checked to add no new clash.

import type { Room, Session } from "@/agents/runtime/contracts";
import { formatTime } from "@/lib/time";

export type SolverSession = Pick<
  Session,
  | "id"
  | "title"
  | "roomId"
  | "trackId"
  | "kind"
  | "startsAt"
  | "endsAt"
  | "capacity"
  | "registeredCount"
  | "speakerIds"
  | "status"
>;
export type SolverRoom = Pick<Room, "id" | "name" | "capacity">;
/** Who chose which sessions, by registration id only. */
export type SessionChoice = { registrationId: string; sessionIds: string[] };

export type Clash =
  | { type: "room_double_booked"; roomId: string; sessionIds: [string, string] }
  | { type: "speaker_double_booked"; speakerId: string; sessionIds: [string, string] }
  | { type: "over_capacity"; sessionId: string; roomId: string; capacity: number; registered: number }
  | { type: "attendee_overlap"; sessionIds: [string, string]; attendees: number };

export type ScheduleState = { sessions: SolverSession[]; rooms: SolverRoom[]; choices?: SessionChoice[] };

export type Change =
  /** `alreadyCancelled`: the session is off already (a speaker dropped out); plan only how to use the gap. */
  | { type: "cancel"; sessionId: string; reason: string; alreadyCancelled?: boolean }
  | { type: "move"; sessionId: string; notBefore?: string }
  | { type: "delay"; sessionId: string; minutes: number }
  | { type: "room_loss"; roomId: string };

export type Constraints = {
  /** The day's usable window; options never leave it. */
  dayStart: string;
  dayEnd: string;
  /** Windows no talk may overlap (lunch). Meals and breaks are exempt. */
  protectedWindows?: { start: string; end: string }[];
  /** Candidate start times are multiples of this many minutes from dayStart. */
  slotMinutes?: number;
};

export type ScheduleAction =
  | {
      kind: "schedule.cancel_session";
      payload: { sessionId: string; reason: string; notifyAttendees: boolean };
    }
  | {
      kind: "schedule.move_session";
      payload: { sessionId: string; newStartsAt: string; newEndsAt: string; newRoomId?: string };
    };

export type Option = {
  id: string;
  label: string;
  actions: ScheduleAction[];
  metrics: {
    movedSessions: number;
    cancelledSessions: number;
    roomChanges: number;
    minutesShifted: number;
    attendeesAffected: number;
    capacityShortfall: number;
    trackBreaks: number;
  };
};

const ms = (iso: string) => Date.parse(iso);
const iso = (t: number) => new Date(t).toISOString();
const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) =>
  ms(a.startsAt) < ms(b.endsAt) && ms(b.startsAt) < ms(a.endsAt);
const live = (s: SolverSession) => s.status !== "cancelled";
const EXEMPT = new Set(["meal", "break"]);

export function detectClashes(state: ScheduleState): Clash[] {
  const sessions = state.sessions.filter(live).sort((a, b) => a.id.localeCompare(b.id));
  const rooms = new Map(state.rooms.map((r) => [r.id, r]));
  const clashes: Clash[] = [];
  for (let i = 0; i < sessions.length; i++) {
    const a = sessions[i]!;
    for (let j = i + 1; j < sessions.length; j++) {
      const b = sessions[j]!;
      if (!overlaps(a, b)) continue;
      if (a.roomId === b.roomId)
        clashes.push({ type: "room_double_booked", roomId: a.roomId, sessionIds: [a.id, b.id] });
      for (const sp of a.speakerIds)
        if (b.speakerIds.includes(sp))
          clashes.push({ type: "speaker_double_booked", speakerId: sp, sessionIds: [a.id, b.id] });
      const both = (state.choices ?? []).filter(
        (c) => c.sessionIds.includes(a.id) && c.sessionIds.includes(b.id),
      ).length;
      if (both) clashes.push({ type: "attendee_overlap", sessionIds: [a.id, b.id], attendees: both });
    }
    const cap = Math.min(a.capacity, rooms.get(a.roomId)?.capacity ?? a.capacity);
    if (a.registeredCount > cap && !EXEMPT.has(a.kind))
      clashes.push({
        type: "over_capacity",
        sessionId: a.id,
        roomId: a.roomId,
        capacity: cap,
        registered: a.registeredCount,
      });
  }
  return clashes;
}

const clashKey = (c: Clash) => JSON.stringify(c.type === "attendee_overlap" ? { ...c, attendees: 0 } : c);

/** Applies actions to a copy of the state. Room capacity follows the new room. */
export function apply(state: ScheduleState, actions: ScheduleAction[]): ScheduleState {
  const rooms = new Map(state.rooms.map((r) => [r.id, r]));
  const sessions = state.sessions.map((s) => ({ ...s }));
  for (const a of actions) {
    const s = sessions.find((x) => x.id === a.payload.sessionId);
    if (!s) continue;
    if (a.kind === "schedule.cancel_session") s.status = "cancelled";
    else {
      s.startsAt = a.payload.newStartsAt;
      s.endsAt = a.payload.newEndsAt;
      if (a.payload.newRoomId) {
        s.roomId = a.payload.newRoomId;
        s.capacity = rooms.get(a.payload.newRoomId)?.capacity ?? s.capacity;
      }
    }
  }
  return { ...state, sessions };
}

/** True when the actions add no clash that was not already there. */
export function isValid(before: ScheduleState, actions: ScheduleAction[]): boolean {
  const had = new Set(detectClashes(before).map(clashKey));
  return detectClashes(apply(before, actions)).every((c) => had.has(clashKey(c)));
}

function metrics(state: ScheduleState, actions: ScheduleAction[]): Option["metrics"] {
  const byId = new Map(state.sessions.map((s) => [s.id, s]));
  const after = apply(state, actions);
  const m: Option["metrics"] = {
    movedSessions: 0,
    cancelledSessions: 0,
    roomChanges: 0,
    minutesShifted: 0,
    attendeesAffected: 0,
    capacityShortfall: 0,
    trackBreaks: 0,
  };
  for (const a of actions) {
    const s = byId.get(a.payload.sessionId)!;
    m.attendeesAffected += s.registeredCount;
    if (a.kind === "schedule.cancel_session") m.cancelledSessions++;
    else {
      m.movedSessions++;
      m.minutesShifted += Math.abs(ms(a.payload.newStartsAt) - ms(s.startsAt)) / 60_000;
      if (a.payload.newRoomId && a.payload.newRoomId !== s.roomId) {
        m.roomChanges++;
        // A track normally lives in one room; moving a track session to a room that track does not use breaks continuity.
        const trackRooms = new Set(
          state.sessions.filter((x) => x.trackId && x.trackId === s.trackId).map((x) => x.roomId),
        );
        if (s.trackId && !trackRooms.has(a.payload.newRoomId)) m.trackBreaks++;
      }
    }
  }
  // Only seats this option leaves short; a shortfall that exists either way is not its cost.
  const short = (st: ScheduleState) =>
    detectClashes(st).reduce((n, c) => (c.type === "over_capacity" ? n + c.registered - c.capacity : n), 0);
  m.capacityShortfall = Math.max(0, short(after) - short(state));
  return m;
}

/** Earliest valid (room, start) for a session, same room first, then any room that fits the attendees. */
function findSlots(
  state: ScheduleState,
  s: SolverSession,
  k: Constraints,
  notBefore: number,
  excludeRoom?: string,
) {
  const step = (k.slotMinutes ?? 15) * 60_000;
  const dur = ms(s.endsAt) - ms(s.startsAt);
  const start0 = ms(k.dayStart);
  const first = start0 + Math.ceil((Math.max(notBefore, start0) - start0) / step) * step;
  const rooms = state.rooms.filter((r) => r.id !== excludeRoom && r.capacity >= s.registeredCount);
  const found: { action: ScheduleAction; t: number; sameRoom: boolean; capacity: number; roomId: string }[] =
    [];
  for (const room of rooms) {
    for (let t = first; t + dur <= ms(k.dayEnd); t += step) {
      const slot = { startsAt: iso(t), endsAt: iso(t + dur) };
      if (
        !EXEMPT.has(s.kind) &&
        (k.protectedWindows ?? []).some((w) => overlaps(slot, { startsAt: w.start, endsAt: w.end }))
      )
        continue;
      const action: ScheduleAction = {
        kind: "schedule.move_session",
        payload: {
          sessionId: s.id,
          newStartsAt: slot.startsAt,
          newEndsAt: slot.endsAt,
          ...(room.id !== s.roomId ? { newRoomId: room.id } : {}),
        },
      };
      if (t === ms(s.startsAt) && room.id === s.roomId) continue;
      if (isValid(state, [action])) {
        found.push({ action, t, sameRoom: room.id === s.roomId, capacity: room.capacity, roomId: room.id });
        break; // earliest slot in this room
      }
    }
  }
  // Earliest time first, then the same room, then the smallest room that fits.
  return found
    .sort(
      (a, b) =>
        a.t - b.t ||
        Number(b.sameRoom) - Number(a.sameRoom) ||
        a.capacity - b.capacity ||
        a.roomId.localeCompare(b.roomId),
    )
    .slice(0, 2)
    .map((f) => f.action);
}

/** Up to 3 valid options for a change, fewest moved sessions first. */
export function replanOptions(state: ScheduleState, change: Change, k: Constraints): Option[] {
  const byId = new Map(state.sessions.map((s) => [s.id, s]));
  const roomName = (id?: string) => state.rooms.find((r) => r.id === id)?.name ?? id ?? "";
  const moveLabel = (a: ScheduleAction) =>
    a.kind === "schedule.move_session"
      ? `move "${byId.get(a.payload.sessionId)!.title}" to ${formatTime(a.payload.newStartsAt)}${a.payload.newRoomId ? ` in ${roomName(a.payload.newRoomId)}` : ""}`
      : `cancel "${byId.get(a.payload.sessionId)!.title}"`;
  const candidates: { label: string; actions: ScheduleAction[] }[] = [];

  if (change.type === "cancel") {
    const s = byId.get(change.sessionId);
    if (!s) return [];
    const cancel: ScheduleAction = {
      kind: "schedule.cancel_session",
      payload: { sessionId: s.id, reason: change.reason, notifyAttendees: true },
    };
    if (!change.alreadyCancelled)
      candidates.push({ label: `Cancel "${s.title}" and leave the slot free`, actions: [cancel] });
    const lead: ScheduleAction[] = change.alreadyCancelled ? [] : [cancel];
    // Fill the freed slot: the next session of the same track (or room), and the best-attended later
    // session that day that fits the freed room. Each becomes its own option.
    const cap = state.rooms.find((r) => r.id === s.roomId)?.capacity ?? 0;
    const later = state.sessions
      .filter(live)
      .filter(
        (x) =>
          x.id !== s.id &&
          !EXEMPT.has(x.kind) &&
          ms(x.startsAt) >= ms(s.endsAt) &&
          ms(x.endsAt) <= ms(k.dayEnd) &&
          x.registeredCount <= cap,
      )
      .sort((a, b) => ms(a.startsAt) - ms(b.startsAt));
    const sameLine = later.find((x) => (s.trackId ? x.trackId === s.trackId : x.roomId === s.roomId));
    const busiest = [...later].sort((a, b) => b.registeredCount - a.registeredCount)[0];
    for (const next of [...new Set([sameLine, busiest].filter((x): x is SolverSession => Boolean(x)))]) {
      const dur = ms(next.endsAt) - ms(next.startsAt);
      const pull: ScheduleAction = {
        kind: "schedule.move_session",
        payload: {
          sessionId: next.id,
          newStartsAt: s.startsAt,
          newEndsAt: iso(ms(s.startsAt) + dur),
          ...(next.roomId !== s.roomId ? { newRoomId: s.roomId } : {}),
        },
      };
      const verb = change.alreadyCancelled ? "Fill the slot" : `Cancel "${s.title}"`;
      candidates.push({ label: `${verb} and ${moveLabel(pull)}`, actions: [...lead, pull] });
    }
    if (!change.alreadyCancelled) {
      // Keep the session: its best later slot the same day, in case the speaker can still come.
      // One slot only, so the menu shows three different strategies rather than two variants of one.
      const [slot] = findSlots(state, s, k, ms(s.endsAt));
      if (slot) candidates.push({ label: `Keep the session: ${moveLabel(slot)}`, actions: [slot] });
    }
  } else if (change.type === "move" || change.type === "delay") {
    const s = byId.get(change.sessionId);
    if (!s) return [];
    const notBefore =
      change.type === "delay" ? ms(s.startsAt) + change.minutes * 60_000 : ms(change.notBefore ?? s.startsAt);
    for (const slot of findSlots(state, s, k, notBefore)) {
      const label = moveLabel(slot);
      // Standalone option: starts a sentence, so it is capitalised (inside other labels it stays lowercase).
      candidates.push({ label: label.charAt(0).toUpperCase() + label.slice(1), actions: [slot] });
    }
    if (change.type === "delay") {
      // Shift the room's following sessions by the same minutes, as one option.
      const chain = state.sessions
        .filter(live)
        .filter((x) => x.roomId === s.roomId && ms(x.startsAt) >= ms(s.startsAt))
        .map<ScheduleAction>((x) => ({
          kind: "schedule.move_session",
          payload: {
            sessionId: x.id,
            newStartsAt: iso(ms(x.startsAt) + change.minutes * 60_000),
            newEndsAt: iso(ms(x.endsAt) + change.minutes * 60_000),
          },
        }));
      const inDay = chain.every(
        (a) => a.kind === "schedule.move_session" && ms(a.payload.newEndsAt) <= ms(k.dayEnd),
      );
      if (inDay)
        candidates.push({
          label: `Shift ${roomName(s.roomId)} by ${change.minutes} minutes from "${s.title}" on`,
          actions: chain,
        });
    }
  } else {
    // Room lost: rehome each of its sessions at the same time if possible, else the earliest valid slot.
    const moved: ScheduleAction[] = [];
    let working = state;
    for (const s of state.sessions.filter(live).filter((x) => x.roomId === change.roomId)) {
      const same = findSlots(
        { ...working, sessions: working.sessions },
        { ...s },
        { ...k, dayStart: s.startsAt },
        ms(s.startsAt),
        change.roomId,
      )[0];
      if (!same) return [];
      moved.push(same);
      working = apply(working, [same]);
    }
    candidates.push({
      label: `Rehome ${moved.length} sessions from ${roomName(change.roomId)}`,
      actions: moved,
    });
  }

  return candidates
    .filter((c) => c.actions.length && isValid(state, c.actions))
    .map((c, i) => ({
      id: `opt-${i + 1}`,
      label: c.label.slice(0, 120),
      actions: c.actions,
      metrics: metrics(state, c.actions),
    }))
    .sort(
      (a, b) =>
        a.metrics.movedSessions - b.metrics.movedSessions ||
        a.metrics.minutesShifted - b.metrics.minutesShifted,
    )
    .slice(0, 3)
    .map((o, i) => ({ ...o, id: `opt-${i + 1}` }));
}
