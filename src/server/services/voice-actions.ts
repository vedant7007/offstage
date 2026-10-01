/**
 * What the voice Commander can answer from data and do by proposing. Answers are SQL over this event; actions open a
 * real agent run (so the Live Stage lights up and the glass box shows it) and go through actions.propose() with the
 * normal tier. Nothing here approves: a T2 or T3 proposal waits for a tap, and the turn says so.
 */
import { and, asc, eq, inArray, lt, notInArray, sql } from "drizzle-orm";
import type { AgentName, ProposeResult, RiskTier, UserActor, VoiceEvent } from "@/contracts";
import type { Args } from "@/agents/commander/voice";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { formatDayShort, formatTime, istDateKey, istToUtc, nowUtc } from "@/lib/time";
import { actions } from "@/server/actions";
import { requirePermission } from "@/server/authz";
import { dbTraceStore } from "@/server/services/agent-runtime";
import { loadWorld } from "@/server/services/world";
import { detectClashes, isValid, type ScheduleAction } from "@/solvers/schedule";

export type Say = (text: string, kind?: "filler" | "answer" | "narration") => VoiceEvent;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const list = (xs: string[]) =>
  xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
const CHANNEL_WORDS: Record<string, string> = {
  in_app: "in-app",
  email: "email",
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  sms: "SMS",
};
export const channelWords = (cs: string[]) => list(cs.map((c) => CHANNEL_WORDS[c] ?? c));

/** Memory the follow-ups need: who "them" is. */
export type Entities = { unconfirmedSpeakerIds?: string[]; lastProposalId?: string };

export async function firstName(actor: UserActor, client: Db = defaultDb): Promise<string> {
  const [u] = await client.select({ name: t.users.name }).from(t.users).where(eq(t.users.id, actor.userId));
  return (u?.name ?? "").split(" ")[0] || "there";
}

/** "Is there anything I need to take care of?": approvals, overdue tasks, open incidents, budget and speakers at risk. */
export async function* attention(
  actor: UserActor,
  say: Say,
  client: Db = defaultDb,
): AsyncGenerator<VoiceEvent> {
  requirePermission(actor, "event.read", { eventId: actor.eventId });
  const eventId = actor.eventId;
  const now = nowUtc();
  const [pending, overdue, incidents, budget, speakers] = await Promise.all([
    client
      .select({ tier: t.proposals.riskTier, agent: t.proposals.proposerAgent, summary: t.proposals.summary })
      .from(t.proposals)
      .where(
        and(
          eq(t.proposals.eventId, eventId),
          eq(t.proposals.status, "pending"),
          sql`${t.proposals.parentId} is null`,
        ),
      )
      .orderBy(asc(t.proposals.createdAt)),
    client
      .select({ title: t.tasks.title, owner: t.volunteers.name })
      .from(t.tasks)
      .leftJoin(t.volunteers, eq(t.volunteers.id, t.tasks.assigneeVolunteerId))
      .where(
        and(
          eq(t.tasks.eventId, eventId),
          inArray(t.tasks.status, ["open", "in_progress"]),
          lt(t.tasks.dueAt, now),
        ),
      ),
    client
      .select({ title: t.incidents.title, severity: t.incidents.severity })
      .from(t.incidents)
      .where(and(eq(t.incidents.eventId, eventId), notInArray(t.incidents.status, ["resolved", "closed"]))),
    client.execute(sql`select c.name, c.cap_inr as cap, coalesce(sum(l.amount_inr) filter (where l.type = 'expense'
        and l.status in ('paid', 'committed')), 0) as spent
      from ${t.budgetCategories} c left join ${t.ledgerEntries} l on l.category_id = c.id
      where c.event_id = ${eventId} group by c.id, c.name, c.cap_inr`) as unknown as Promise<
      { name: string; cap: number; spent: number }[]
    >,
    client
      .select({ name: t.speakers.name })
      .from(t.speakers)
      .where(and(eq(t.speakers.eventId, eventId), notInArray(t.speakers.status, ["confirmed", "declined"]))),
  ]);
  const hot = budget.filter((c) => Number(c.cap) > 0 && Number(c.spent) / Number(c.cap) >= 0.9);
  const lines: string[] = [];
  if (pending.length) {
    const byTier = (x: RiskTier) => pending.filter((p) => p.tier === x).length;
    const two = byTier("T3");
    const first = pending[0]!;
    lines.push(
      `${plural(pending.length, "proposal")} ${pending.length === 1 ? "is" : "are"} waiting for approval${two ? `, ${two} of them ${two === 1 ? "needs" : "need"} two approvals` : ""}. The oldest is from ${(first.agent ?? "a teammate").replace(/_/g, " ")}: ${first.summary.replace(/\.$/, "")}.`,
    );
  }
  if (overdue.length)
    lines.push(
      `${plural(overdue.length, "task")} ${overdue.length === 1 ? "is" : "are"} overdue: ${list(overdue.slice(0, 2).map((o) => `${o.title.replace(/\.$/, "")}${o.owner ? `, with ${o.owner}` : ""}`))}.`,
    );
  if (incidents.length)
    lines.push(
      `${plural(incidents.length, "incident")} ${incidents.length === 1 ? "is" : "are"} still open: ${incidents[0]!.title.replace(/\.$/, "")}.`,
    );
  if (hot.length)
    lines.push(
      `${list(hot.map((c) => c.name))} ${hot.length === 1 ? "is" : "are"} at ${Math.round((Number(hot[0]!.spent) / Number(hot[0]!.cap)) * 100)} percent of budget.`,
    );
  if (speakers.length)
    lines.push(
      `${plural(speakers.length, "speaker")} still ${speakers.length === 1 ? "hasn't" : "haven't"} confirmed.`,
    );
  if (!lines.length) {
    yield say("Nothing needs you right now. No approvals waiting, no overdue tasks and no open incidents.");
    return;
  }
  yield say(`${plural(lines.length, "thing")} ${lines.length === 1 ? "needs" : "need"} your attention.`);
  for (const l of lines) yield say(l);
}

/** "And tomorrow?": the next day's sessions, from the schedule. */
export async function* tomorrow(
  actor: UserActor,
  say: Say,
  client: Db = defaultDb,
): AsyncGenerator<VoiceEvent> {
  requirePermission(actor, "event.read", { eventId: actor.eventId });
  const day = istDateKey(new Date(nowUtc().getTime() + 24 * 3600_000));
  const rows = await client
    .select({
      title: t.sessions.title,
      startsAt: t.sessions.startsAt,
      room: t.rooms.name,
      kind: t.sessions.kind,
    })
    .from(t.sessions)
    .leftJoin(t.rooms, eq(t.rooms.id, t.sessions.roomId))
    .where(
      and(
        eq(t.sessions.eventId, actor.eventId),
        sql`${t.sessions.status} <> 'cancelled'`,
        sql`(${t.sessions.startsAt} at time zone 'Asia/Kolkata')::date = ${day}::date`,
      ),
    )
    .orderBy(asc(t.sessions.startsAt));
  const talks = rows.filter((r) => r.kind !== "meal" && r.kind !== "break");
  if (!talks.length) {
    yield say(`Nothing is scheduled for tomorrow, ${formatDayShort(istToUtc(`${day}T12:00`))}.`);
    return;
  }
  const first = talks[0]!;
  const last = talks.at(-1)!;
  yield say(
    `Tomorrow, ${formatDayShort(first.startsAt)}, has ${plural(talks.length, "session")} from ${formatTime(first.startsAt)} to ${formatTime(last.startsAt)}.`,
  );
  yield say(`It opens with ${first.title}${first.room ? ` in ${first.room}` : ""}.`);
  if (talks[1]) yield say(`Then ${talks[1].title} at ${formatTime(talks[1].startsAt)}.`);
}

export async function unconfirmedSpeakers(actor: UserActor, client: Db = defaultDb) {
  return client
    .select({ id: t.speakers.id, name: t.speakers.name, status: t.speakers.status })
    .from(t.speakers)
    .where(
      and(eq(t.speakers.eventId, actor.eventId), notInArray(t.speakers.status, ["confirmed", "declined"])),
    )
    .orderBy(asc(t.speakers.name));
}

/** Open a real run for the agent that owns the action, propose through the engine, close the run. */
async function proposeAs(
  agent: AgentName,
  actor: UserActor,
  input: Record<string, unknown> & { kind: string },
  key: string,
  client: Db,
): Promise<ProposeResult> {
  const trace = dbTraceStore(client);
  const started = nowUtc();
  const runId = await trace.startRun({
    eventId: actor.eventId,
    agent,
    trigger: { type: "command", ref: key.slice(0, 200) },
    status: "running",
    simulation: false,
    modelTier: "fast",
    startedAt: started.toISOString(),
    stepCount: 0,
    proposalIds: [],
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
  });
  const res = await actions.propose(
    { kind: "agent", agent, runId, eventId: actor.eventId },
    { ...input, idempotencyKey: key },
    client,
  );
  const ok = res.status === "created" || res.status === "duplicate";
  await trace.finishRun(runId, {
    status: ok ? "succeeded" : "failed",
    finishedAt: nowUtc().toISOString(),
    proposalIds: ok ? [res.proposal.id] : [],
    latencyMs: nowUtc().getTime() - started.getTime(),
    ...(ok ? {} : { error: "The proposal was not accepted" }),
  });
  return res;
}

/** What to say once a proposal exists; returns the proposal to open, if it waits for a person. */
function* proposed(res: ProposeResult, say: Say, ask: string): Generator<VoiceEvent, string | undefined> {
  if (res.status !== "created" && res.status !== "duplicate") {
    const why =
      "issues" in res && Array.isArray(res.issues)
        ? (res.issues[0] as { message?: string })?.message
        : undefined;
    yield say(`I couldn't set that up${why ? `: ${why.replace(/\.$/, "")}` : ""}.`);
    return undefined;
  }
  const p = res.proposal;
  if (p.status === "executed") {
    const channels = (p.payload as { channels?: string[] }).channels ?? [];
    yield say(
      `Done. Sent to ${plural(p.impact.people, "person", "people")}${channels.length ? ` on ${channelWords(channels)}` : ""}.`,
    );
    return undefined;
  }
  yield say(
    `Proposed. It reaches ${plural(p.impact.people, "person", "people")}. ${p.riskTier === "T3" ? "It needs two approvals, yours and the faculty approver's. " : ""}${ask}`,
  );
  yield { type: "open", proposalId: p.id, tier: p.riskTier };
  return p.id;
}

const ATTENDEE_CHANNELS = ["in_app", "email", "telegram", "whatsapp"] as const;
const CREW_CHANNELS = ["in_app", "telegram", "whatsapp"] as const;
const body = (channels: readonly string[], text: string) =>
  Object.fromEntries(channels.map((c) => [c, text]));
const titleOf = (m: string) => {
  const s = m.replace(/[.!?]+$/, "").trim();
  return (s.length > 60 ? `${s.slice(0, 57).trimEnd()}...` : s).replace(/^./, (c) => c.toUpperCase());
};
const sentence = (m: string) => {
  const s = m.trim().replace(/^./, (c) => c.toUpperCase());
  return /[.!?]$/.test(s) ? s : `${s}.`;
};

export async function* announce(
  actor: UserActor,
  args: Args,
  turnId: string,
  say: Say,
  audience: "all" | "volunteers",
  client: Db = defaultDb,
): AsyncGenerator<VoiceEvent, string | undefined> {
  const message = (args.message ?? "").trim();
  if (message.length < 3) {
    yield say(`What should the ${audience === "all" ? "announcement" : "message"} say?`);
    return undefined;
  }
  const channels = audience === "all" ? ATTENDEE_CHANNELS : CREW_CHANNELS;
  const res = await proposeAs(
    "herald",
    actor,
    {
      kind: "comms.send_announcement",
      payload: {
        title: titleOf(message),
        segment: { type: audience },
        channels: [...channels],
        bodyByChannel: body(channels, sentence(message)),
        category: "info",
        public: false,
      },
      summary: `${audience === "all" ? "Announce" : "Tell all volunteers"}: ${titleOf(message)}`.slice(
        0,
        120,
      ),
      rationale: "Asked for by the event head through the voice Commander.",
      evidence: [],
    },
    `voice:${turnId}:announce`,
    client,
  );
  return yield* proposed(res, say, "Ready. Tap approve to send.");
}

export async function* remindMember(
  actor: UserActor,
  args: Args,
  turnId: string,
  say: Say,
  client: Db = defaultDb,
): AsyncGenerator<VoiceEvent, string | undefined> {
  const name = (args.person ?? "").trim().toLowerCase();
  const members = await client
    .select({ id: t.users.id, name: t.users.name, role: t.memberships.role })
    .from(t.memberships)
    .innerJoin(t.users, eq(t.users.id, t.memberships.userId))
    .where(
      and(
        eq(t.memberships.eventId, actor.eventId),
        notInArray(t.memberships.role, ["attendee", "sponsor", "viewer"]),
      ),
    );
  const m =
    members.find((x) => x.name.toLowerCase() === name) ??
    members.find((x) => x.name.toLowerCase().split(" ").includes(name.split(" ")[0]!));
  if (!m) {
    yield say(`I couldn't find ${args.person ?? "that person"} on the team.`);
    return undefined;
  }
  const from = await firstName(actor, client);
  const text = sentence(`Reminder from ${from}: ${(args.message ?? "").replace(/^(about|to|of)\s+/i, "")}`);
  const res = await proposeAs(
    "commander",
    actor,
    {
      kind: "comms.send_direct",
      payload: {
        recipient: { type: "user", id: m.id },
        channels: ["in_app", "email"],
        subject: "Reminder",
        bodyByChannel: { in_app: text, email: text },
        category: "info",
      },
      summary: `Remind ${m.name}: ${(args.message ?? "").replace(/^(about|to|of)\s+/i, "")}`.slice(0, 120),
      rationale: "Asked for by the event head through the voice Commander.",
      evidence: [],
    },
    `voice:${turnId}:remind:${m.id}`,
    client,
  );
  return yield* proposed(res, say, `Tap approve to send it to ${m.name.split(" ")[0]}.`);
}

export async function* remindUnconfirmed(
  actor: UserActor,
  ids: string[] | undefined,
  turnId: string,
  say: Say,
  client: Db = defaultDb,
): AsyncGenerator<VoiceEvent, string | undefined> {
  const all = await unconfirmedSpeakers(actor, client);
  const targets = ids?.length ? all.filter((s) => ids.includes(s.id)) : all;
  if (!targets.length) {
    yield say("Every speaker has confirmed. There is no one to remind.");
    return undefined;
  }
  let first: string | undefined;
  for (const s of targets.slice(0, 5)) {
    const text = `Hello ${s.name.split(" ")[0]}, a quick reminder to confirm your session at HackNova. Reply to this email to confirm, or tell us if anything has changed.`;
    const res = await proposeAs(
      "speaker_liaison",
      actor,
      {
        kind: "comms.send_direct",
        payload: {
          recipient: { type: "speaker", id: s.id },
          channels: ["email"],
          subject: "Please confirm your session",
          bodyByChannel: { email: text },
          category: "info",
        },
        summary: `Remind ${s.name} to confirm`.slice(0, 120),
        rationale: "The speaker has not confirmed yet; asked for by the event head.",
        evidence: [{ type: "row", ref: `speakers/${s.id}`, label: s.name.slice(0, 160) }],
      },
      `voice:${turnId}:speaker:${s.id}`,
      client,
    );
    if (res.status === "created" || res.status === "duplicate") first ??= res.proposal.id;
  }
  if (!first) {
    yield say("I couldn't set up the reminders.");
    return undefined;
  }
  yield say(
    `Proposed ${plural(Math.min(5, targets.length), "reminder")} to ${list(targets.slice(0, 5).map((s) => s.name))}. Waiting for your approval. Tap approve to send.`,
  );
  yield { type: "open", proposalId: first, tier: "T2" };
  return first;
}

/** "4 PM", "4:30 pm", "16:00" to HH:MM, or null. */
export function parseClock(s: string): string | null {
  const m = /^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i.exec(s.trim());
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2] ?? 0);
  const ap = m[3]?.toLowerCase();
  if (ap === "pm" && h < 12) h += 12;
  if (ap === "am" && h === 12) h = 0;
  if (!ap && h >= 1 && h <= 7) h += 12; // "move it to 4" at an event means the afternoon
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

const STOP = new Set(["the", "a", "an", "talk", "session", "workshop", "one", "keynote", "panel", "on"]);
export function matchSession<T extends { title: string }>(query: string, sessions: T[]): T | undefined {
  const words = query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !STOP.has(w));
  let best: { s: T; score: number } | undefined;
  for (const s of sessions) {
    const title = s.title.toLowerCase();
    const score = words.filter((w) => title.includes(w)).length;
    if (score && (!best || score > best.score)) best = { s, score };
  }
  return best?.s;
}

export async function* moveSession(
  actor: UserActor,
  args: Args,
  turnId: string,
  say: Say,
  client: Db = defaultDb,
): AsyncGenerator<VoiceEvent, string | undefined> {
  const world = await loadWorld(actor.eventId, client);
  const live = world.sessions.filter((s) => s.status !== "cancelled");
  const s = matchSession(args.session ?? "", live);
  const clock = parseClock(args.time ?? "");
  if (!s || !clock) {
    yield say(
      !s ? "Which session should I move? Say part of its title." : "To what time? For example, 4 PM.",
    );
    return undefined;
  }
  const day = istDateKey(s.startsAt);
  const start = istToUtc(`${day}T${clock}`);
  const end = new Date(start.getTime() + (Date.parse(s.endsAt) - Date.parse(s.startsAt)));
  const action: ScheduleAction = {
    kind: "schedule.move_session",
    payload: { sessionId: s.id, newStartsAt: start.toISOString(), newEndsAt: end.toISOString() },
  };
  // The solver checks it before anything is proposed: no new room, speaker or capacity clash.
  const state = { sessions: live, rooms: world.rooms };
  if (!isValid(state, [action])) {
    const before = new Set(detectClashes(state).map((c) => JSON.stringify(c)));
    const fresh = detectClashes({
      ...state,
      sessions: state.sessions.map((x) =>
        x.id === s.id ? { ...x, startsAt: action.payload.newStartsAt, endsAt: action.payload.newEndsAt } : x,
      ),
    }).filter((c) => !before.has(JSON.stringify(c)));
    const what = fresh[0]?.type.replace(/_/g, " ") ?? "a clash";
    yield say(
      `I can't move ${s.title} to ${formatTime(start)}: the Scheduler found ${what}. Nothing was proposed.`,
    );
    return undefined;
  }
  const res = await proposeAs(
    "scheduler",
    actor,
    {
      kind: "schedule.move_session",
      payload: action.payload,
      summary: `Move "${s.title}" to ${formatTime(start)}`.slice(0, 120),
      rationale: "Asked for by the event head; the schedule solver found no new clash.",
      evidence: [{ type: "row", ref: `sessions/${s.id}`, label: s.title.slice(0, 160) }],
    },
    `voice:${turnId}:move:${s.id}`,
    client,
  );
  yield say(`The Scheduler checked it: ${s.title} at ${formatTime(start)} has no clash.`);
  return yield* proposed(res, say, "Tap approve to move it.");
}

/** After a voice proposal: the approval happens in the console; say what was sent once it runs. */
export async function sentLine(proposalId: string, client: Db = defaultDb): Promise<string | null> {
  const [p] = await client
    .select({
      status: t.proposals.status,
      impact: t.proposals.impact,
      payload: t.proposals.payload,
      kind: t.proposals.kind,
    })
    .from(t.proposals)
    .where(eq(t.proposals.id, proposalId));
  if (!p) return null;
  if (p.status === "rejected") return "That one was rejected, so nothing was sent.";
  if (p.status !== "executed") return null;
  if (p.kind === "schedule.move_session") return "Done. The session has moved.";
  const people = (p.impact as { people?: number }).people ?? 0;
  const asked = (p.payload as { channels?: string[] }).channels ?? [];
  // Only the channels that really carried it: a channel nobody is linked on is skipped, not "sent".
  const used = await client
    .selectDistinct({ channel: t.outbox.channel })
    .from(t.outbox)
    .where(and(eq(t.outbox.proposalId, proposalId), sql`${t.outbox.status} <> 'skipped'`));
  const channels = asked.filter((c) => c === "in_app" || used.some((u) => u.channel === c));
  return `Approved and sent to ${plural(people, "person", "people")}${channels.length ? ` on ${channelWords(channels)}` : ""}.`;
}
