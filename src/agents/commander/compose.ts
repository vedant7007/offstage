// Commander composition: one solver option becomes one plan.bundle carrying every consequence of the change.
// Schedule moves, the crew that follows them, an announcement per affected segment, and a schedule note in
// the knowledge base. Everything here is deterministic; the model only chose the option and wrote the why.

import type { BundleChild, Channel, Ripple } from "@/agents/runtime/contracts";
import type { ReadServices } from "@/agents/runtime/services";
import type { AgentProposal } from "@/agents/runtime/types";
import { announcement, plannedChange, template, type Change as HeraldChange } from "@/agents/herald/tools";
import { checkAssignment, type CrewAssignment, type CrewState } from "@/solvers/crew";
import type { Change, Option, ScheduleAction, ScheduleState } from "@/solvers/schedule";
import { formatDayShort, formatTime } from "@/lib/time";
import { shortName } from "@/lib/format";

export type PlanInput = { change: Change | null; state: ScheduleState; options: Option[] };
type Child = Omit<BundleChild, "rationale"> & { rationale: string };

const ms = (iso: string) => Date.parse(iso);
const overlaps = (a: { startsAt: string; endsAt: string }, b: { startsAt: string; endsAt: string }) =>
  ms(a.startsAt) < ms(b.endsAt) && ms(b.startsAt) < ms(a.endsAt);
const when = (iso: string) => `${formatDayShort(iso)}, ${formatTime(iso)}`;
const ACTIVE = new Set(["assigned", "checked_in"]);

/** What a volunteer reads when their shift moves. Seeded role names often already carry the room. */
export const movedText = (role: string, room: string, at: string) =>
  role.includes(room)
    ? `Your shift moved: ${role}, now ${at}. Reply OK to confirm.`
    : `Your shift moved: ${role} is now at ${room}, ${at}. Reply OK to confirm.`;

export const releasedText = (role: string, at: string) =>
  `You're released from ${role} at ${at}. Crew Chief may reassign you soon.`;

/** A direct note to one volunteer. The outbox sends for real only to allowlisted addresses; every other
 * row goes to the mock driver. */
function crewNote(
  v: { telegramLinked: boolean; phoneMasked?: string } | undefined,
  volunteerId: string,
  subject: string,
  body: string,
  summary: string,
): Child {
  const channels: Channel[] = [
    "in_app",
    ...(v?.telegramLinked ? (["telegram"] as const) : []),
    ...(v?.phoneMasked ? (["whatsapp"] as const) : []),
  ];
  return {
    kind: "comms.send_direct",
    payload: {
      recipient: { type: "volunteer", id: volunteerId },
      channels,
      subject,
      bodyByChannel: Object.fromEntries(channels.map((c) => [c, body])),
      category: "change",
    },
    summary: summary.slice(0, 120),
    rationale: "A volunteer learns about their own shift change directly.",
    proposedBy: "crew_chief",
  };
}

/** Crew follows the sessions: people on a moved session's shift go to the shift covering its new slot. */
async function crewMoves(services: ReadServices, plan: PlanInput, actions: ScheduleAction[]) {
  const [shifts, assignments, volunteers, availability] = await Promise.all([
    services.shifts(),
    services.shiftAssignments(),
    services.volunteers(),
    services.availability(),
  ]);
  let state: CrewState = { volunteers, shifts, assignments, availability };
  const planned: CrewAssignment[] = [];
  const children: Child[] = [];
  const moved: Ripple["volunteers"] = [];
  const name = (id: string) => volunteers.find((v) => v.id === id)?.name ?? "A volunteer";
  const roomName = (id: string) => plan.state.rooms.find((r) => r.id === id)?.name ?? "the venue";
  const cancelledId = plan.change?.type === "cancel" ? plan.change.sessionId : undefined;
  const filledSlots = new Set<string>();

  for (const a of actions) {
    if (a.kind !== "schedule.move_session") continue;
    const s = plan.state.sessions.find((x) => x.id === a.payload.sessionId)!;
    const slot = { startsAt: a.payload.newStartsAt, endsAt: a.payload.newEndsAt };
    const room = a.payload.newRoomId ?? s.roomId;
    const target =
      shifts.find((x) => x.sessionId === cancelledId && x.roomId === room && overlaps(x, slot)) ??
      shifts.find((x) => x.roomId === room && x.sessionId !== s.id && overlaps(x, slot));
    if (!target) continue;
    filledSlots.add(target.id);
    for (const from of shifts.filter((x) => x.sessionId === s.id && x.id !== target.id)) {
      for (const asg of state.assignments.filter((z) => z.shiftId === from.id && ACTIVE.has(z.status))) {
        const without: CrewState = { ...state, assignments: state.assignments.filter((z) => z !== asg) };
        if (checkAssignment(without, target.id, asg.volunteerId, planned).length) continue; // rules say no: leave them
        state = without;
        planned.push({ shiftId: target.id, volunteerId: asg.volunteerId, status: "assigned" });
        const who = name(asg.volunteerId);
        children.push(
          {
            kind: "crew.unassign_shift",
            payload: {
              shiftId: from.id,
              volunteerId: asg.volunteerId,
              reason: `"${s.title}" moved to ${when(slot.startsAt)}`,
            },
            summary: `${who} leaves ${from.role}`.slice(0, 120),
            rationale: `The session this shift served has moved.`,
            proposedBy: "crew_chief",
          },
          {
            kind: "crew.assign_shift",
            payload: { shiftId: target.id, volunteerId: asg.volunteerId },
            summary: `${who} covers ${target.role}`.slice(0, 120),
            rationale: `Follows "${s.title}" to its new slot; crew rules checked.`,
            proposedBy: "crew_chief",
          },
        );
        children.push(
          crewNote(
            volunteers.find((x) => x.id === asg.volunteerId),
            asg.volunteerId,
            "Your shift moved",
            movedText(target.role, roomName(target.roomId ?? room), when(target.startsAt)),
            `Tell ${who} about the shift move`,
          ),
        );
        moved.push({
          id: asg.volunteerId,
          displayName: shortName(who),
          change: `${from.role} to ${target.role}`.slice(0, 200),
        });
      }
    }
  }

  // A cancelled session whose slot nobody fills frees its crew.
  if (cancelledId)
    for (const x of shifts.filter((y) => y.sessionId === cancelledId && !filledSlots.has(y.id)))
      for (const asg of state.assignments.filter((z) => z.shiftId === x.id && ACTIVE.has(z.status))) {
        const who = name(asg.volunteerId);
        children.push({
          kind: "crew.unassign_shift",
          payload: { shiftId: x.id, volunteerId: asg.volunteerId, reason: "The session was cancelled" },
          summary: `${who} is released from ${x.role}`.slice(0, 120),
          rationale: "The session this shift served is cancelled.",
          proposedBy: "crew_chief",
        });
        children.push(
          crewNote(
            volunteers.find((v) => v.id === asg.volunteerId),
            asg.volunteerId,
            "You are released from a shift",
            releasedText(x.role, when(x.startsAt)),
            `Tell ${who} they are released`,
          ),
        );
        moved.push({
          id: asg.volunteerId,
          displayName: shortName(who),
          change: `Released from ${x.role}`.slice(0, 200),
        });
      }
  return { children, volunteers: moved };
}

/** One announcement per affected segment, from templates that state every fact. */
async function announcements(services: ReadServices, plan: PlanInput, actions: ScheduleAction[]) {
  const children: Child[] = [];
  const out: Ripple["announcements"] = [];
  const add = (c: HeraldChange, draft: { title: string; body: string }) => {
    const p = announcement(c, draft);
    children.push({
      kind: "comms.send_announcement",
      payload: p.payload,
      summary: p.summary,
      rationale: p.rationale,
      proposedBy: "herald",
    });
    out.push({
      segment: { type: "session", ref: c.sessionId },
      channels: c.channels,
      recipients: c.attendees,
    });
  };

  const change = plan.change;
  if (change?.type === "cancel") {
    const cancel: ScheduleAction = {
      kind: "schedule.cancel_session",
      payload: { sessionId: change.sessionId, reason: change.reason, notifyAttendees: true },
    };
    const c = await plannedChange(services, cancel);
    if (c) {
      const draft = template(c);
      const s = plan.state.sessions.find((x) => x.id === change.sessionId)!;
      // The session moved into the cancelled one's slot: same start, same room.
      const fillerSession = actions
        .filter((a) => a.kind === "schedule.move_session" && a.payload.newStartsAt === s.startsAt)
        .map((a) => ({ a, x: plan.state.sessions.find((y) => y.id === a.payload.sessionId)! }))
        .find(
          ({ a, x }) => a.kind === "schedule.move_session" && (a.payload.newRoomId ?? x.roomId) === s.roomId,
        )?.x;
      if (fillerSession)
        draft.body += ` In its place, "${fillerSession.title}" starts at ${formatTime(s.startsAt)} in ${c.before.room}.`;
      add(c, draft);
    }
  }
  for (const a of actions) {
    if (a.kind !== "schedule.move_session") continue;
    const c = await plannedChange(services, a);
    if (c) add(c, template(c));
  }
  return { children, announcements: out };
}

/** The speakers of a moved session hear it from us directly, not from the attendee announcement. */
function speakerNotes(plan: PlanInput, actions: ScheduleAction[]): Child[] {
  const room = (id: string) => plan.state.rooms.find((r) => r.id === id)?.name ?? "the venue";
  const out: Child[] = [];
  for (const a of actions) {
    if (a.kind !== "schedule.move_session") continue;
    const s = plan.state.sessions.find((x) => x.id === a.payload.sessionId)!;
    const where = room(a.payload.newRoomId ?? s.roomId);
    for (const speakerId of s.speakerIds ?? []) {
      const body = `Your session "${s.title}" has moved to ${when(a.payload.newStartsAt)} in ${where}. Everything else stays the same. Reply here if the new time does not work for you.`;
      out.push({
        kind: "comms.send_direct",
        payload: {
          recipient: { type: "speaker", id: speakerId },
          channels: ["email"],
          subject: `Your session moved to ${formatTime(a.payload.newStartsAt)}`,
          bodyByChannel: { email: body },
          category: "change",
        },
        summary: `Tell the speaker of "${s.title}" about the move`.slice(0, 120),
        rationale: "A speaker learns about their own session's move directly.",
        proposedBy: "speaker_liaison",
      });
    }
  }
  return out;
}

function scheduleNote(plan: PlanInput, actions: ScheduleAction[]): Child | undefined {
  const byId = new Map(plan.state.sessions.map((s) => [s.id, s]));
  const room = (id: string) => plan.state.rooms.find((r) => r.id === id)?.name ?? "the venue";
  const lines: string[] = [];
  if (plan.change?.type === "cancel") {
    const s = byId.get(plan.change.sessionId)!;
    lines.push(`- "${s.title}" (${when(s.startsAt)}, ${room(s.roomId)}) is cancelled.`);
  }
  for (const a of actions)
    if (a.kind === "schedule.move_session") {
      const s = byId.get(a.payload.sessionId)!;
      lines.push(
        `- "${s.title}" moved from ${when(s.startsAt)} in ${room(s.roomId)} to ${when(a.payload.newStartsAt)} in ${room(a.payload.newRoomId ?? s.roomId)}.`,
      );
    }
  if (!lines.length) return undefined;
  return {
    kind: "kb.publish_update",
    payload: {
      title: "Schedule changes",
      kind: "schedule",
      bodyMarkdown: `# Schedule changes\n\n${lines.join("\n")}\n`,
      reason: "Keep helpdesk answers in step with the approved schedule",
      public: true,
    },
    summary: "Add the change to the schedule notes the helpdesk cites",
    rationale: "So attendee questions about these sessions get the new facts with a citation.",
    proposedBy: "helpdesk",
  };
}

/** Keeps the first child per target; a later child that would set the same thing differently is dropped. */
export function withoutConflicts(children: Child[]): { children: Child[]; dropped: Child[] } {
  const keyOf = (c: Child) => {
    const p = c.payload as Record<string, unknown>;
    if (c.kind.startsWith("schedule.")) return `session:${String(p.sessionId)}`;
    if (c.kind === "crew.assign_shift" || c.kind === "crew.unassign_shift")
      return `${c.kind}:${String(p.shiftId)}:${String(p.volunteerId)}`;
    return undefined;
  };
  const seen = new Map<string, string>();
  const kept: Child[] = [];
  const dropped: Child[] = [];
  for (const c of children) {
    const k = keyOf(c);
    const body = JSON.stringify(c.payload);
    if (k && seen.has(k)) {
      if (seen.get(k) !== body) dropped.push(c);
      continue;
    }
    if (k) seen.set(k, body);
    kept.push(c);
  }
  return { children: kept, dropped };
}

export async function composeBundle(
  services: ReadServices,
  plan: PlanInput,
  optionId: string,
  rationale: string,
): Promise<AgentProposal> {
  const option = plan.options.find((o) => o.id === optionId);
  if (!option) throw new Error(`Unknown option ${optionId}`);
  const byId = new Map(plan.state.sessions.map((s) => [s.id, s]));
  const roomName = (id: string) => plan.state.rooms.find((r) => r.id === id)?.name ?? id;

  const schedule: Child[] = option.actions.map((a) => {
    const s = byId.get(a.payload.sessionId)!;
    const summary =
      a.kind === "schedule.cancel_session"
        ? `Cancel "${s.title}"`
        : `Move "${s.title}" to ${formatTime(a.payload.newStartsAt)}${a.payload.newRoomId ? ` in ${roomName(a.payload.newRoomId)}` : ""}`;
    return {
      kind: a.kind,
      payload: a.payload,
      summary: summary.slice(0, 120),
      rationale: option.label,
      proposedBy: "scheduler",
    };
  });
  const crew = await crewMoves(services, plan, option.actions);
  const comms = await announcements(services, plan, option.actions);
  const note = scheduleNote(plan, option.actions);
  const { children, dropped } = withoutConflicts([
    ...schedule,
    ...crew.children,
    ...comms.children,
    ...speakerNotes(plan, option.actions),
    ...(note ? [note] : []),
  ]);

  const touchedIds = [
    ...(plan.change?.type === "cancel" ? [plan.change.sessionId] : []),
    ...option.actions.map((a) => a.payload.sessionId),
  ];
  const touched = [...new Set(touchedIds)].map((id) => byId.get(id)!);
  // Distinct people: someone registered for two touched sessions counts once.
  const people = new Set(
    (await services.sessionChoices(touched.map((s) => s.id))).map((c) => c.registrationId),
  );
  const seen = new Set<string>();
  const sample = (
    await Promise.all(touched.map((s) => services.registrations({ sessionId: s.id, limit: 8 })))
  )
    .flat()
    .filter((r) => !seen.has(r.id) && Boolean(seen.add(r.id)))
    .slice(0, 8)
    .map((r) => ({ registrationId: r.id, displayName: shortName(r.name) }));
  const ripple: Ripple = {
    sessions: touched.map((s) => ({
      id: s.id,
      title: s.title,
      change: (
        schedule.find((c) => (c.payload as { sessionId: string }).sessionId === s.id)?.summary ?? "Cancelled"
      ).slice(0, 200),
    })),
    rooms: [
      ...new Set(
        touched
          .map((s) => s.roomId)
          .concat(
            option.actions.flatMap((a) =>
              a.kind === "schedule.move_session" && a.payload.newRoomId ? [a.payload.newRoomId] : [],
            ),
          ),
      ),
    ].map((id) => ({ id, name: roomName(id) })),
    attendees: { count: people.size || touched.reduce((n, s) => n + s.registeredCount, 0), sample },
    volunteers: crew.volunteers,
    announcements: comms.announcements,
    kbAnswers: note
      ? [{ docId: "schedule-changes", title: "Schedule changes", change: "Adds the approved change" }]
      : [],
  };
  const conflictNote = dropped.length
    ? ` ${dropped.length} conflicting step(s) dropped: ${dropped.map((d) => d.summary).join("; ")}.`
    : "";

  return {
    kind: "plan.bundle",
    payload: {
      title: option.label,
      children,
      ripple,
      options: plan.options.map((o) => ({
        id: o.id,
        label: o.label,
        metrics: o.metrics,
        chosen: o.id === optionId,
      })),
    },
    summary: option.label.slice(0, 120),
    rationale: `${rationale}${conflictNote}`.slice(0, 600),
    evidence: [
      ...touched.map((s) => ({
        type: "row" as const,
        ref: `sessions/${s.id}`,
        label: s.title.slice(0, 160),
      })),
      {
        type: "metric" as const,
        ref: `solver/${option.id}`,
        label: `moved ${option.metrics.movedSessions}, cancelled ${option.metrics.cancelledSessions}, attendees ${option.metrics.attendeesAffected}`,
      },
    ],
  };
}
