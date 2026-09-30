// Herald tools. Facts come from the services; the model only writes the wording, and code checks that the
// wording states those facts and passes moderation before anything is proposed.

import { z } from "zod";
import { moderate } from "@/ai/guard";
import type { Channel } from "@/agents/runtime/contracts";
import type { ReadServices } from "@/agents/runtime/services";
import type { AgentProposal, RunContext, ToolDef } from "@/agents/runtime/types";
import { formatDayShort, formatTime } from "@/lib/time";

type Ctx = RunContext<ReadServices>;

/** Day and time in IST, e.g. { day: "Sat, 24 Oct", time: "2:00 PM" }. */
type Slot = { day: string; time: string; room: string };

export type Change = {
  kind: "cancelled" | "moved";
  sessionId: string;
  title: string;
  before: Slot;
  after?: Slot;
  reason?: string;
  attendees: number;
  channels: Channel[];
};

const ATTENDEE_CHANNELS: Channel[] = ["in_app", "email", "telegram", "whatsapp", "sms"];
const slot = (iso: string, room: string): Slot => ({ day: formatDayShort(iso), time: formatTime(iso), room });
const say = (x: Slot) => `${x.day}, ${x.time}`;

/** The people-facing change behind this trigger, or a reason there is nothing to announce yet. */
export async function changeFor(ctx: Ctx): Promise<Change | { none: string }> {
  const p = (ctx.payload ?? {}) as Record<string, unknown>;
  const [sessions, rooms, event] = await Promise.all([
    ctx.services.sessions(),
    ctx.services.rooms(),
    ctx.services.event(),
  ]);
  const s = sessions.find((x) => x.id === p.sessionId);
  if (!s) return { none: "The trigger names no known session." };
  const room = (id: string) => rooms.find((r) => r.id === id)?.name ?? "the venue";
  const brief = event.brief?.attendeeChannels?.filter((c) => ATTENDEE_CHANNELS.includes(c));
  const channels: Channel[] = brief?.length ? brief : ["in_app", "email"];
  const base = { sessionId: s.id, title: s.title, attendees: s.registeredCount, channels };

  if (ctx.trigger.eventType === "session.cancelled") {
    // Only once it is real: a speaker dropping out is not a cancellation until someone approves it.
    if (s.status !== "cancelled") return { none: "The session is not cancelled yet. Nothing to announce." };
    return {
      ...base,
      kind: "cancelled",
      before: slot(s.startsAt, room(s.roomId)),
      reason: typeof p.reason === "string" ? p.reason : undefined,
    };
  }
  const before = p.before as { startsAt?: string; roomId?: string } | undefined;
  const after = p.after as { startsAt?: string; roomId?: string } | undefined;
  if (!before?.startsAt || !after?.startsAt || !before.roomId || !after.roomId)
    return { none: "The update does not say what changed." };
  if (s.startsAt !== after.startsAt || s.roomId !== after.roomId)
    return { none: "The change is not applied yet." };
  if (before.startsAt === after.startsAt && before.roomId === after.roomId)
    return { none: "Nothing people-facing changed." };
  return {
    ...base,
    kind: "moved",
    before: slot(before.startsAt, room(before.roomId)),
    after: slot(after.startsAt, room(after.roomId)),
  };
}

/** Facts the wording must state, checked in code. */
export function missingFacts(c: Change, text: string): string[] {
  const t = text.toLowerCase();
  const missing: string[] = [];
  if (!t.includes(c.title.toLowerCase().slice(0, 30))) missing.push(`the session title "${c.title}"`);
  if (c.kind === "cancelled" && !/cancel/.test(t)) missing.push("that the session is cancelled");
  if (c.after) {
    const moved = c.after.time !== c.before.time || c.after.day !== c.before.day;
    if (moved && !t.includes(c.after.time.toLowerCase())) missing.push(`the new time ${c.after.time}`);
    if (c.after.room !== c.before.room && !t.includes(c.after.room.toLowerCase()))
      missing.push(`the new room ${c.after.room}`);
  }
  return missing;
}

export function template(c: Change): { title: string; body: string } {
  if (c.kind === "cancelled")
    return {
      title: `Cancelled: ${c.title}`,
      body: `"${c.title}" (${say(c.before)}, ${c.before.room}) is cancelled. You do not need to go to ${c.before.room}. Check the schedule in the app for other sessions.`,
    };
  return {
    title: `Moved: ${c.title}`,
    body: `"${c.title}" has moved. It was ${say(c.before)} in ${c.before.room}. It is now ${say(c.after!)} in ${c.after!.room}. Please go to ${c.after!.room} at the new time.`,
  };
}

export function announcement(c: Change, draft: { title: string; body: string }, note = ""): AgentProposal {
  return {
    kind: "comms.send_announcement",
    payload: {
      title: draft.title.slice(0, 160),
      segment: { type: "session", ref: c.sessionId },
      channels: c.channels,
      bodyByChannel: Object.fromEntries(c.channels.map((ch) => [ch, draft.body])),
      category: "change",
      public: true,
    },
    summary: `Tell ${c.attendees} attendees: ${draft.title}`.slice(0, 120),
    rationale: `"${c.title}" was ${c.kind}. Everyone registered for it needs to know.${note}`.slice(0, 600),
    evidence: [{ type: "row", ref: `sessions/${c.sessionId}`, label: c.title.slice(0, 160) }],
  };
}

export const heraldTools: ToolDef<ReadServices>[] = [
  {
    name: "get_change",
    description: "What changed for attendees, with times in IST, rooms, audience size and channels.",
    input: z.object({}),
    run: (async (_: unknown, ctx: Ctx) => changeFor(ctx)) as never,
  },
  {
    name: "propose_announcement",
    description: "Propose the announcement for approval. Checked for the key facts and moderated first.",
    input: z.object({
      title: z.string().min(1).max(160),
      body: z.string().min(1).max(1000).describe("What changed, then what to do now. Plain words."),
    }),
    run: (async (draft: { title: string; body: string }, ctx: Ctx) => {
      const c = await changeFor(ctx);
      if ("none" in c) return { error: c.none };
      const missing = missingFacts(c, `${draft.title} ${draft.body}`);
      if (missing.length) return { error: `Rewrite it. It must state ${missing.join(", ")}.` };
      const m = moderate(`${draft.title}\n${draft.body}`);
      if (m.verdict !== "allow") return { error: `Rewrite it without: ${m.reasons.join(", ")}.` };
      const res = await ctx.propose(announcement(c, draft));
      return res.status === "invalid" ? { status: "invalid", issues: res.issues } : { status: res.status };
    }) as never,
  },
];
