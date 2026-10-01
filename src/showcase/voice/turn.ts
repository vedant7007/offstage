// The voice Commander in the showcase: the same VoiceEvents as /api/agents/voice/turn, made in the browser from the
// recorded fixtures. Same phrase rules, same guard heuristics, same wording as src/server/services/voice-turn.ts.
// Nothing is approved, sent or stored: approvals stay a human tap, actions are drafts.

import type { ActionProposal, EndpointName, RiskTier, VoiceEvent, VoiceIntent, VoiceStep } from "@/contracts";
import { heuristics } from "@/ai/guard/heuristics";
import {
  CAPABILITIES,
  FILLER,
  approvalLine,
  narrateProposal,
  plural,
  ruleRoute,
  sentences,
  who,
  type Args,
  type HistoryTurn,
  type Intent,
} from "@/agents/commander/voice-rules";
import { api, type ApiResponse } from "@/lib/api-client";
import { formatInr } from "@/lib/format";
import { formatDayShort, formatTime, istDateKey } from "@/lib/time";
import { responseKey, type KeyArgs } from "@/showcase/key";

export type ShowcaseIntent = Intent | "queue_spike";
/** Per conversation: the last turns (for "and tomorrow?", "remind them") and a question waiting for its answer. */
export type Memory = { turns: HistoryTurn[]; ask?: "announce" | "message_volunteers" };
export type Routed = {
  intent: VoiceIntent;
  args: Args;
  by: "rules" | "guard";
  /** "Show me the pending items": list them rather than the whole attention summary. */
  pending?: boolean;
};

type ScenarioName = Exclude<
  Extract<ShowcaseIntent, `${string}_${string}`>,
  "briefing_tomorrow" | "remind_unconfirmed" | "message_volunteers" | "remind_member" | "move_session"
>;
const SCENARIO_FILES: Record<ScenarioName, () => Promise<{ default: unknown }>> = {
  speaker_cancel: () => import("@/showcase/fixtures/scenarios/speaker_cancel.json"),
  lunch_confusion: () => import("@/showcase/fixtures/scenarios/lunch_confusion.json"),
  volunteer_noshow: () => import("@/showcase/fixtures/scenarios/volunteer_noshow.json"),
  queue_spike: () => import("@/showcase/fixtures/scenarios/queue_spike.json"),
  budget_breach: () => import("@/showcase/fixtures/scenarios/budget_breach.json"),
  projector_voice_note: () => import("@/showcase/fixtures/scenarios/projector_voice_note.json"),
};
const isScenario = (i: string): i is ScenarioName => i in SCENARIO_FILES;

// After the shared rules miss: a few keywords, so "run the speaker cancel scenario" or "pending items" still land.
const KEYWORDS: [RegExp, VoiceIntent, Partial<Routed>?][] = [
  [/\bline at the\b|\bdesk\b.*\b(crowd|rush|line)\b/, "queue_spike"],
  [/\bspeaker\b.*\bcancel/, "speaker_cancel"],
  [/\bno[- ]?show\b|\bvolunteer\b.*\bmissing\b/, "volunteer_noshow"],
  [/\bprojector\b|\bvoice note\b/, "projector_voice_note"],
  [/\bbudget\b|\bcatering\b/, "budget_breach"],
  [/\blunch\b|\bfood\b/, "lunch_confusion"],
  [
    /\bpending\b|\bapprovals?\b|\bwaiting for (my |your )?(approval|sign[- ]?off)\b/,
    "attention",
    { pending: true },
  ],
  [/\bwhat can you do\b|\bhelp me\b|^help\b/, "smalltalk", { args: { reply: CAPABILITIES } }],
  [/\b(thanks|thank you|how are you|joke|cool|great|nice|awesome|a break|good job|well done)\b/, "smalltalk"],
];

/** Which intent a line reaches in the showcase, or "blocked" when the guard's heuristics refuse it. */
export function showcaseRoute(text: string, memory: Memory = { turns: [] }): Routed {
  if (heuristics(text).verdict === "block") return { intent: "blocked", args: {}, by: "guard" };
  // The question asked last turn ("What should the announcement say?"): these words are the answer.
  if (memory.ask) return { intent: memory.ask, args: { message: text.trim() }, by: "rules" };
  // The shared rules read "registration desk" as registrations; a queue there is the queue spike scenario.
  if (/\bqueue\b/i.test(text)) return { intent: "queue_spike", args: {}, by: "rules" };
  const rule = ruleRoute(text, memory.turns);
  if (rule) return { intent: rule.intent, args: rule.args, by: "rules" };
  const t = text.toLowerCase();
  for (const [re, intent, extra] of KEYWORDS)
    if (re.test(t)) return { intent, args: {}, by: "rules", ...extra };
  return { intent: "unknown", args: {}, by: "rules" };
}

// Reads go through the api client, so they match what the console shows; the recording is the fallback.
type World = {
  eventId: string;
  eventSlug: string;
  demoClock: string;
  responses: Record<string, unknown>;
  whatIfSamples: { scenario: string; response: ApiResponse<"whatIf"> }[];
};
let worldP: Promise<World> | null = null;
const world = () =>
  (worldP ??= import("@/showcase/fixtures/world.json").then((m) => m.default as unknown as World));

async function get<N extends EndpointName>(name: N, args: KeyArgs = {}): Promise<ApiResponse<N>> {
  const w = await world();
  try {
    const call = api.call as unknown as (n: N, a: KeyArgs) => Promise<ApiResponse<N>>;
    return await call(name, args);
  } catch {
    const key = responseKey(name, args);
    const hit = w.responses[key] ?? w.responses[`persona:owner ${key}`];
    if (!hit) throw new Error(`No recorded ${name}`);
    return hit as ApiResponse<N>;
  }
}
const ev = async () => ({ params: { eventId: (await world()).eventId } });

const say = (text: string, kind: "filler" | "answer" | "narration" = "answer"): VoiceEvent => ({
  type: "say",
  text: text.slice(0, 600),
  kind,
});
const stage = (
  step: VoiceStep,
  state: "active" | "done",
  label: string,
  nodes: string[] = [],
): VoiceEvent => ({
  type: "stage",
  step,
  state,
  label: label.slice(0, 160),
  nodes: nodes.slice(0, 8),
});
const list = (xs: string[]) =>
  xs.length < 2 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} and ${xs.at(-1)}`;
const clean = (s: string) => s.replace(/\.$/, "");
/** Nothing in the showcase is sent: actions end as drafts that need approval. */
const DRAFT = "It needs your approval before anything goes out. This demo keeps it as a draft.";

function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (ms <= 0 || signal?.aborted) return resolve();
    const t = setTimeout(resolve, ms);
    signal?.addEventListener("abort", () => (clearTimeout(t), resolve()), { once: true });
  });
}

type Proposal = { id: string; kind: string; status: string; riskTier: RiskTier; summary: string };
type Msg = { type: string; run?: { agent: string; status: string }; proposal?: Proposal };
type Recording = {
  phases: { id: string; stream: { t: number; msg: Msg }[]; responses: Record<string, unknown> }[];
};

/** A scenario: the engine plays its recorded timeline; this narrates the same recording at the same pace. */
async function* scenario(s: ScenarioName, pace: number, signal?: AbortSignal): AsyncGenerator<VoiceEvent> {
  await api.call("demoTrigger", { body: { scenario: s } }).catch(() => undefined);
  const rec = (await SCENARIO_FILES[s]()).default as Recording;
  const { eventId } = await world();
  const trigger = rec.phases.find((p) => p.id === "trigger") ?? rec.phases[0]!;
  yield stage("plan", "active", "Reading the situation", ["agent:commander"]);
  const woke = new Set<string>();
  const narrated = new Set<string>();
  let done = 0;
  let clock = 0;
  for (const { t, msg } of trigger.stream) {
    if (msg.type !== "agent_run" && msg.type !== "proposal") continue;
    await wait((t - clock) * pace, signal);
    clock = t;
    if (signal?.aborted) return;
    if (msg.run?.status === "running" && !woke.has(msg.run.agent)) {
      const agent = msg.run.agent;
      woke.add(agent);
      if (woke.size === 1) yield stage("plan", "done", `${who(agent)} is planning`, [`agent:${agent}`]);
      else {
        yield stage("delegate", "active", `${who(agent)} is on it`, [`agent:${agent}`]);
        if (woke.size <= 3) yield say(`${who(agent)} is on it.`, "narration");
      }
      continue;
    }
    const p = msg.proposal;
    if (!p || narrated.has(`${p.id}:${p.status}`)) continue;
    const detail = trigger.responses[
      responseKey("getProposal", { params: { eventId, proposalId: p.id } })
    ] as { proposal: ActionProposal; children: ActionProposal[] } | undefined;
    if (detail?.proposal.parentId) continue;
    narrated.add(`${p.id}:${p.status}`);
    if (p.status === "pending" && (p.riskTier === "T2" || p.riskTier === "T3")) {
      yield stage("delegate", "done", "Steps assigned", []);
      const lines = detail
        ? narrateProposal(detail.proposal, detail.children)
        : [`The plan: ${clean(p.summary)}.`];
      for (const line of lines) yield say(line, "narration");
      yield stage("execute", "done", "Ready to run once approved", []);
      yield stage("approve", "active", `${p.riskTier}: waiting for approval`, ["gate:head"]);
      yield say(approvalLine(p.riskTier), "narration");
      yield { type: "open", proposalId: p.id, tier: p.riskTier };
      return; // one decision at a time
    }
    if (p.status === "executed" && done < 3) {
      done++;
      yield stage("execute", "done", p.summary, []);
      yield say(`Done: ${clean(p.summary)}.`, "narration");
    }
  }
  if (!narrated.size) yield say("The agents looked and nothing needs a decision from you right now.");
}

async function pendingTop() {
  const r = await get("listProposals", { ...(await ev()), query: { limit: 100, status: "pending" } });
  return r.items
    .filter((p) => !p.parentId && p.status === "pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

async function* answer(
  r: Routed,
  text: string,
  memory: Memory,
  pace: number,
  signal?: AbortSignal,
): AsyncGenerator<VoiceEvent> {
  const { intent, args } = r;
  switch (intent) {
    case "blocked":
      // The real server also audits it; the showcase has nowhere to log, so it does not say it did.
      yield say("I can only help with running this event, and that request is outside it.");
      return;
    case "greeting": {
      const me = await get("me").catch(() => null);
      const name = me?.user.name.split(" ")[0];
      yield say(`Hi${name ? ` ${name}` : ""}. Want today's briefing, or what needs your attention?`);
      return;
    }
    case "smalltalk":
      yield say(args.reply?.trim() || "Sure. When you're ready, ask me what needs your attention.");
      return;
    case "attention": {
      const pending = await pendingTop();
      if (r.pending) {
        if (!pending.length) {
          yield say("There is nothing waiting for approval.");
          return;
        }
        yield say(
          `${plural(pending.length, "proposal")} ${pending.length === 1 ? "is" : "are"} waiting for approval.`,
        );
        for (const p of pending.slice(0, 3))
          yield say(
            `${p.riskTier}, from ${who(p.proposedBy.kind === "agent" ? p.proposedBy.agent : "a teammate")}: ${clean(p.summary)}.`,
          );
        yield say("Each one waits for a tap on the Approvals page.");
        return;
      }
      const [ov, co] = await Promise.all([get("overview", await ev()), get("closeout", await ev())]);
      const lines: string[] = [];
      if (pending.length) {
        const two = pending.filter((p) => p.riskTier === "T3").length;
        const first = pending[0]!;
        const from =
          first.proposedBy.kind === "agent" ? first.proposedBy.agent.replace(/_/g, " ") : "a teammate";
        lines.push(
          `${plural(pending.length, "proposal")} ${pending.length === 1 ? "is" : "are"} waiting for approval${two ? `, ${two} of them ${two === 1 ? "needs" : "need"} two approvals` : ""}. The oldest is from ${from}: ${clean(first.summary)}.`,
        );
      }
      const open = ov.metrics.incidentsOpen;
      if (open) lines.push(`${plural(open, "incident")} ${open === 1 ? "is" : "are"} still open.`);
      const hot = co.budget.categories.filter((c) => c.capInr > 0 && c.spentInr / c.capInr >= 0.9);
      if (hot.length)
        lines.push(
          `${list(hot.map((c) => c.name))} ${hot.length === 1 ? "is" : "are"} at ${Math.round((hot[0]!.spentInr / hot[0]!.capInr) * 100)} percent of budget.`,
        );
      if (!lines.length) {
        yield say(
          "Nothing needs you right now. No approvals waiting, no overdue tasks and no open incidents.",
        );
        return;
      }
      yield say(`${plural(lines.length, "thing")} ${lines.length === 1 ? "needs" : "need"} your attention.`);
      for (const l of lines) yield say(l);
      return;
    }
    case "briefing": {
      const b = await get("getBriefing", { query: { eventId: (await world()).eventId } }).catch(() => null);
      if (!b?.briefing) {
        yield say("There is no briefing for today yet.");
        return;
      }
      for (const s of b.briefing.sections.slice(0, 3))
        for (const line of sentences(s.narrative, 2)) yield say(line);
      return;
    }
    case "briefing_tomorrow": {
      const w = await world();
      const pub = await get("publicEvent", { params: { slug: w.eventSlug } });
      const day = istDateKey(new Date(new Date(w.demoClock).getTime() + 24 * 3600_000));
      const rooms = new Map(pub.rooms.map((x) => [x.id, x.name]));
      const talks = pub.sessions
        .filter((x) => x.status !== "cancelled" && istDateKey(x.startsAt) === day)
        .filter((x) => x.kind !== "meal" && x.kind !== "break")
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
      const first = talks[0];
      if (!first) {
        yield say("Nothing is scheduled for tomorrow.");
        return;
      }
      const last = talks.at(-1)!;
      const room = first.roomId ? rooms.get(first.roomId) : undefined;
      yield say(
        `Tomorrow, ${formatDayShort(first.startsAt)}, has ${plural(talks.length, "session")} from ${formatTime(first.startsAt)} to ${formatTime(last.startsAt)}.`,
      );
      yield say(`It opens with ${first.title}${room ? ` in ${room}` : ""}.`);
      if (talks[1]) yield say(`Then ${talks[1].title} at ${formatTime(talks[1].startsAt)}.`);
      return;
    }
    case "registrations": {
      const m = (await get("overview", await ev())).metrics;
      const reg = m.registrations;
      yield say(
        `${reg.confirmed} people are confirmed${reg.target ? ` against a target of ${reg.target}` : ""}, with ${reg.waitlisted} on the waitlist.`,
      );
      yield say(
        `${m.checkins.count} have checked in so far, that's ${Math.round(m.checkins.rate * 100)} percent, and ${m.checkins.lastTenMinutes} in the last ten minutes.`,
      );
      if (reg.cancelled) yield say(`${reg.cancelled} registrations were cancelled.`);
      return;
    }
    // The recording has no speaker statuses: every speaker on the published programme has confirmed.
    case "unconfirmed":
      yield say("Every speaker has confirmed.");
      return;
    case "remind_unconfirmed":
      yield say("Every speaker has confirmed. There is no one to remind.");
      return;
    case "announce":
    case "message_volunteers": {
      const message = (args.message ?? "").trim();
      if (message.length < 3) {
        memory.ask = intent;
        const q = `What should the ${intent === "announce" ? "announcement" : "message"} say?`;
        yield say(q);
        yield { type: "done", costUsd: 0, ms: 0, followUp: q };
        return;
      }
      const people =
        intent === "announce"
          ? `It reaches ${plural((await get("overview", await ev())).metrics.registrations.confirmed, "person", "people")}`
          : "It goes to every volunteer on shift";
      yield say(`Drafted for approval: "${clean(message)}". ${people}. ${DRAFT}`);
      return;
    }
    case "remind_member": {
      const ov = await get("overview", await ev());
      const name = (args.person ?? "").trim().toLowerCase();
      const team = [...new Set(ov.agents.map((a) => a.humanLeadName).filter((n): n is string => !!n))];
      const m =
        team.find((n) => n.toLowerCase() === name) ??
        team.find((n) =>
          n
            .toLowerCase()
            .split(" ")
            .includes(name.split(" ")[0] ?? ""),
        );
      if (!m) {
        yield say(`I couldn't find ${args.person ?? "that person"} on the team.`);
        return;
      }
      const about = (args.message ?? "").replace(/^(about|to|of)\s+/i, "");
      yield say(`Drafted a reminder to ${m}: ${clean(about)}. ${DRAFT}`);
      return;
    }
    case "move_session":
      yield say(
        "I can't move sessions by voice in this demo yet. Try running the speaker cancel scenario: the Scheduler moves one there.",
      );
      return;
    case "whatif": {
      const { whatIfSamples } = await world();
      const words = (s: string) =>
        new Set(
          s
            .toLowerCase()
            .replace(/(\d+)\s*(%|percent)/g, "$1")
            .split(/[^a-z0-9]+/)
            .filter((x) => x.length > 1 && !["what", "if", "the", "a", "up", "show", "come"].includes(x)),
        );
      const asked = words(text);
      const scored = whatIfSamples
        .map((s) => ({ s, n: [...words(s.scenario)].filter((x) => asked.has(x)).length }))
        .sort((a, b) => b.n - a.n);
      const best = scored[0];
      if (!best?.n) {
        yield say(
          `In this demo I can simulate ${list(whatIfSamples.map((s) => `"${s.scenario}"`))}. Ask one of those.`,
        );
        return;
      }
      const w = best.s.response;
      const impacts = w.impacts.filter((i) => i.summary).slice(0, 3);
      if (!impacts.length) yield say("I simulated it and nothing breaks.");
      for (const i of impacts) for (const line of sentences(i.summary, 2)) yield say(line);
      if (w.recommendations.length)
        yield say(
          `The agents have ${plural(w.recommendations.length, "recommendation")}; they are on the What if page.`,
        );
      yield say("Nothing in the real event changed.");
      return;
    }
    case "closeout": {
      const c = await get("closeout", await ev());
      for (const line of sentences(c.summary?.text ?? "", 4)) yield say(line);
      yield say(
        `The budget used is ${formatInr(c.budget.spentInr)} of ${formatInr(c.budget.capInr)}. The full report is on the Close-out page.`,
      );
      return;
    }
    case "approve": {
      const p = (await pendingTop()).at(-1);
      if (!p) {
        yield say("There is nothing waiting for approval.");
        return;
      }
      yield stage("approve", "active", `${p.riskTier}: waiting for approval`, ["gate:head"]);
      yield { type: "open", proposalId: p.id, tier: p.riskTier };
      yield say(`I won't approve by voice. I've opened "${clean(p.summary)}". Tap approve to confirm.`);
      return;
    }
    default:
      if (isScenario(intent)) {
        yield* scenario(intent, pace, signal);
        return;
      }
      yield say(
        "I can't do that yet. Try asking what's on today, how registrations are going, or say: run the speaker cancel scenario.",
      );
  }
}

const SHOWCASE_FILLER: Partial<Record<VoiceIntent, string>> = {
  ...FILLER,
  queue_spike: "On it. Asking Radar to look at the registration desk.",
};

/**
 * One showcase turn. `pace` scales the recorded scenario timing (1 = as recorded, 0 = at once for tests).
 * The `done` event carries a `followUp` when Offstage asked a question back.
 */
export async function* showcaseTurn(
  text: string,
  memory: Memory,
  opts: { signal?: AbortSignal; pace?: number } = {},
): AsyncGenerator<VoiceEvent> {
  const t0 = performance.now();
  const r = showcaseRoute(text, memory);
  memory.ask = undefined;
  yield { type: "intent", intent: r.intent, by: r.by, ms: Math.round(performance.now() - t0) };
  const filler = SHOWCASE_FILLER[r.intent];
  if (filler) yield say(filler, "filler");
  const said: string[] = [];
  let asked = false;
  try {
    for await (const e of answer(r, text, memory, opts.pace ?? 1, opts.signal)) {
      if (e.type === "say" && e.kind !== "filler") said.push(e.text);
      if (e.type === "done") asked = true;
      yield e;
    }
  } catch {
    yield say("Something went wrong on my side. The console still works; try the same thing there.");
  }
  if (!asked) yield { type: "done", costUsd: 0, ms: Math.round(performance.now() - t0) };
  if (r.intent !== "blocked") {
    memory.turns.push({
      you: text.slice(0, 300),
      intent: r.intent as Intent,
      said: said.join(" ").slice(0, 300),
    });
    if (memory.turns.length > 10) memory.turns.splice(0, memory.turns.length - 10);
  }
}
