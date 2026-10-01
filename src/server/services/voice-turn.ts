/**
 * One voice (or typed) turn with the Commander. Yields VoiceEvents: the intent, sentences to speak (a filler first
 * for slow work), the plan, delegate, execute and approve steps, and the proposal to open for approval.
 *
 * Safety: the text is screened by the same guard as every other untrusted input (a block is audited as
 * `voice.input_blocked`); facts come from the console's own services; scenarios run only in demo mode; and
 * "approve" never approves: it opens the card and asks for a tap, so tiers and two-person rules are unchanged.
 */
import { randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { ActionProposal, UserActor, VoiceEvent, VoiceStep } from "@/contracts";
import { screen } from "@/ai/guard";
import { endRun } from "@/ai/router/budget";
import {
  FILLER,
  SAY_AGAIN,
  SCENARIOS,
  THINKING,
  route,
  ruleRoute,
  sentences,
  type Args,
  type HistoryTurn,
  type Intent,
  type Route,
  type Scenario,
} from "@/agents/commander/voice";
import {
  announce,
  attention,
  firstName,
  moveSession,
  remindMember,
  remindUnconfirmed,
  sentLine,
  tomorrow,
  unconfirmedSpeakers,
  type Entities,
} from "@/server/services/voice-actions";
import { closeoutRulesSummary } from "@/agents/chronicler/logic";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { logger } from "@/lib/logger";
import { formatInr } from "@/lib/format";
import { demoModeOn } from "@/server/auth/demo-persona";
import { requirePermission } from "@/server/authz";
import { audit, subscribe, subscribeRuns, type Notice, type RunNotice } from "@/server/events/bus";
import { generateBriefing, latestBriefing } from "@/server/services/briefings";
import { getCloseout } from "@/server/services/closeout";
import { getMetrics } from "@/server/services/overview";
import { getProposalDetail } from "@/server/services/proposals";
import { runWhatIf } from "@/server/services/whatif";

const log = logger.child({ module: "voice" });

// Conversation memory: the last 10 turns per person and event, so "and tomorrow?" and "remind them" make sense.
// ponytail: in process memory, one web process; a restart forgets, which only costs a follow-up its context.
type Memory = { turns: HistoryTurn[]; entities: Entities; at: number };
const mem = globalThis as typeof globalThis & { __sutradharVoiceMemory?: Map<string, Memory> };
const memories = (mem.__sutradharVoiceMemory ??= new Map<string, Memory>());
const MEMORY_TURNS = 10;
const MEMORY_IDLE_MS = 2 * 3600_000;
function memoryOf(actor: UserActor): Memory {
  const key = `${actor.eventId}:${actor.userId}`;
  let m = memories.get(key);
  if (!m || Date.now() - m.at > MEMORY_IDLE_MS)
    memories.set(key, (m = { turns: [], entities: {}, at: Date.now() }));
  m.at = Date.now();
  return m;
}
/** Waiting for the organiser's tap after a voice proposal, to say what was sent. */
const APPROVAL_WAIT_MS = 120_000;
const WATCH_MS = 45_000;
const QUIET_MS = 5_000;
const NAME: Record<string, string> = {
  commander: "Commander",
  scheduler: "Scheduler",
  crew_chief: "Crew Chief",
  herald: "Herald",
  helpdesk: "Helpdesk",
  radar: "Radar",
  finance: "Finance",
  logistics: "Logistics",
  speaker_liaison: "Speaker Liaison",
  registrar: "Registrar",
  planner: "Planner",
  sponsorship: "Sponsorship",
  marketing: "Marketing",
  chronicler: "Chronicler",
};
const who = (a: string) => NAME[a] ?? a.replace(/_/g, " ");
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
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const approvalLine = (tier: string) =>
  tier === "T3"
    ? "This needs two approvals, yours and the faculty approver's. I've opened it. Tap approve to confirm."
    : "This needs your approval. I've opened it. Tap approve to confirm.";

/** How a plan or proposal reads out loud, from its own payload. */
export function narrateProposal(p: ActionProposal, children: ActionProposal[]): string[] {
  const agent = p.proposedBy.kind === "agent" ? who(p.proposedBy.agent) : "Someone";
  if (p.kind !== "plan.bundle") return [`${agent} proposes: ${p.summary.replace(/\.$/, "")}.`];
  const payload = p.payload as { options?: unknown[]; children?: { kind: string; proposedBy?: string }[] };
  const kids = children.length
    ? children.map((c) => ({ kind: c.kind }))
    : (payload.children ?? []).map((c) => ({ kind: c.kind }));
  const count = (k: string) => kids.filter((c) => c.kind === k).length;
  const out: string[] = [];
  const options = payload.options?.length ?? 0;
  out.push(
    options > 1
      ? `The Scheduler found ${options} options and the Commander picked one: ${p.summary.replace(/\.$/, "")}.`
      : `The Commander's plan: ${p.summary.replace(/\.$/, "")}.`,
  );
  const moved = count("crew.assign_shift");
  if (moved) out.push(`Crew Chief moved ${plural(moved, "volunteer")} to follow it.`);
  const notes = count("comms.send_announcement");
  if (notes) out.push(`Herald drafted ${plural(notes, "announcement")} for the people affected.`);
  if (count("comms.send_direct")) out.push("The speaker and the volunteers get a direct message too.");
  if (count("kb.publish_update")) out.push("And the Helpdesk will answer with the new times.");
  return out;
}

/** An async queue fed by the event bus while a scenario plays out. */
function busQueue(eventId: string) {
  const items: ({ k: "run"; n: RunNotice } | { k: "event"; n: Notice })[] = [];
  let wake: (() => void) | null = null;
  const push = (x: (typeof items)[number]) => {
    items.push(x);
    wake?.();
  };
  const offRuns = subscribeRuns(eventId, (n) => push({ k: "run", n }));
  const offEvents = subscribe(eventId, (n) => push({ k: "event", n }));
  return {
    async next(ms: number) {
      if (!items.length) await new Promise<void>((r) => ((wake = r), setTimeout(r, ms)));
      wake = null;
      return items.shift();
    },
    close() {
      offRuns();
      offEvents();
    },
  };
}

async function* scenario(actor: UserActor, s: Scenario, client: Db): AsyncGenerator<VoiceEvent> {
  if (!demoModeOn()) {
    yield say(
      "Scenarios run only in demo mode. At a real event the report comes from the field and I plan from there.",
    );
    return;
  }
  const q = busQueue(actor.eventId);
  try {
    const { runScenario } = await import("@/db/demo/trigger");
    await runScenario(s, client);
    yield stage("plan", "active", "Reading the situation", ["agent:commander"]);
    const woke = new Set<string>();
    const narrated = new Set<string>();
    let running = 0;
    let lastActivity = Date.now();
    const end = Date.now() + WATCH_MS;
    while (Date.now() < end) {
      const item = await q.next(500);
      if (!item) {
        if (woke.size && running <= 0 && Date.now() - lastActivity > QUIET_MS) break;
        continue;
      }
      lastActivity = Date.now();
      if (item.k === "run") {
        const { agent, phase, stepKind } = item.n;
        if (phase === "started") {
          running++;
          if (!woke.has(agent)) {
            woke.add(agent);
            if (woke.size === 1) yield stage("plan", "done", `${who(agent)} is planning`, [`agent:${agent}`]);
            else {
              yield stage("delegate", "active", `${who(agent)} is on it`, [`agent:${agent}`]);
              if (woke.size <= 3) yield say(`${who(agent)} is on it.`, "narration");
            }
          }
        } else if (phase === "finished") running--;
        else if (stepKind === "propose")
          yield stage("execute", "active", `${who(agent)} is proposing`, [`agent:${agent}`]);
        continue;
      }
      if (!item.n.type.startsWith("proposal.")) continue;
      const [ev] = await client
        .select({ entityId: t.domainEvents.entityId })
        .from(t.domainEvents)
        .where(eq(t.domainEvents.id, item.n.id));
      if (!ev) continue;
      const d = await getProposalDetail(actor, ev.entityId, client).catch(() => null);
      if (!d || d.proposal.parentId) continue;
      const p = d.proposal;
      const key = `${p.id}:${p.status}`;
      if (narrated.has(key)) continue;
      narrated.add(key);
      if (p.status === "pending" && (p.riskTier === "T2" || p.riskTier === "T3")) {
        yield stage("delegate", "done", "Steps assigned", []);
        for (const line of narrateProposal(p, d.children)) yield say(line, "narration");
        yield stage("execute", "done", "Ready to run once approved", []);
        yield stage("approve", "active", `${p.riskTier}: waiting for approval`, ["gate:head"]);
        yield say(approvalLine(p.riskTier), "narration");
        yield { type: "open", proposalId: p.id, tier: p.riskTier };
        return; // one decision at a time: the organiser now has something to approve
      }
      if (p.status === "executed") {
        yield stage("execute", "done", p.summary, []);
        yield say(`Done: ${p.summary.replace(/\.$/, "")}.`, "narration");
      }
    }
    if (!narrated.size) yield say("The agents looked and nothing needs a decision from you right now.");
  } finally {
    q.close();
  }
}

async function* answer(
  actor: UserActor,
  intent: Intent,
  text: string,
  args: Args,
  ctx: { turnId: string; memory: Memory; opened: (id: string) => void },
  client: Db,
): AsyncGenerator<VoiceEvent> {
  switch (intent) {
    case "greeting":
      yield say(`Hi ${await firstName(actor, client)}. Want today's briefing, or what needs your attention?`);
      return;
    case "smalltalk":
      yield say(args.reply?.trim() || "Sure. When you're ready, ask me what needs your attention.");
      return;
    case "attention":
      yield* attention(actor, say, client);
      return;
    case "briefing_tomorrow":
      yield* tomorrow(actor, say, client);
      return;
    case "unconfirmed": {
      const s = await unconfirmedSpeakers(actor, client);
      ctx.memory.entities.unconfirmedSpeakerIds = s.map((x) => x.id);
      if (!s.length) yield say("Every speaker has confirmed.");
      else {
        yield say(
          `${s.length === 1 ? "One speaker hasn't" : `${s.length} speakers haven't`} confirmed: ${s
            .slice(0, 4)
            .map((x) => x.name)
            .join(", ")}.`,
        );
        yield say("Want me to remind them?");
      }
      return;
    }
    case "remind_unconfirmed": {
      const id = yield* remindUnconfirmed(
        actor,
        ctx.memory.entities.unconfirmedSpeakerIds,
        ctx.turnId,
        say,
        client,
      );
      if (id) ctx.opened(id);
      return;
    }
    case "announce":
    case "message_volunteers": {
      const id = yield* announce(
        actor,
        args,
        ctx.turnId,
        say,
        intent === "announce" ? "all" : "volunteers",
        client,
      );
      if (id) ctx.opened(id);
      return;
    }
    case "remind_member": {
      const id = yield* remindMember(actor, args, ctx.turnId, say, client);
      if (id) ctx.opened(id);
      return;
    }
    case "move_session": {
      const id = yield* moveSession(actor, args, ctx.turnId, say, client);
      if (id) ctx.opened(id);
      return;
    }
    case "briefing": {
      requirePermission(actor, "event.read", { eventId: actor.eventId });
      const b =
        (await latestBriefing(actor, {}, client)) ??
        (await generateBriefing(actor, undefined, client).catch(() => null));
      if (!b) {
        yield say("There is no briefing for today yet.");
        return;
      }
      for (const s of b.sections.slice(0, 3)) for (const line of sentences(s.narrative, 2)) yield say(line);
      return;
    }
    case "registrations": {
      requirePermission(actor, "event.read", { eventId: actor.eventId });
      const m = await getMetrics(actor.eventId);
      const r = m.registrations;
      yield say(
        `${r.confirmed} people are confirmed${r.target ? ` against a target of ${r.target}` : ""}, with ${r.waitlisted} on the waitlist.`,
      );
      yield say(
        `${m.checkins.count} have checked in so far, that's ${Math.round(m.checkins.rate * 100)} percent, and ${m.checkins.lastTenMinutes} in the last ten minutes.`,
      );
      if (r.cancelled) yield say(`${r.cancelled} registrations were cancelled.`);
      return;
    }
    case "whatif": {
      const w = await runWhatIf(actor, text, client);
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
      const r = await getCloseout(actor, client);
      const text = r.summary?.text ?? closeoutRulesSummary(r);
      for (const line of sentences(text, 4)) yield say(line);
      yield say(
        `The budget used is ${formatInr(r.budget.spentInr)} of ${formatInr(r.budget.capInr)}. The full report is on the Close-out page.`,
      );
      return;
    }
    case "approve": {
      requirePermission(actor, "proposal.read", { eventId: actor.eventId });
      const [p] = await client
        .select({ id: t.proposals.id, tier: t.proposals.riskTier, summary: t.proposals.summary })
        .from(t.proposals)
        .where(
          and(
            eq(t.proposals.eventId, actor.eventId),
            eq(t.proposals.status, "pending"),
            isNull(t.proposals.parentId),
          ),
        )
        .orderBy(desc(t.proposals.createdAt))
        .limit(1);
      if (!p) {
        yield say("There is nothing waiting for approval.");
        return;
      }
      yield stage("approve", "active", `${p.tier}: waiting for approval`, ["gate:head"]);
      yield { type: "open", proposalId: p.id, tier: p.tier as ActionProposal["riskTier"] };
      yield say(
        `I won't approve by voice. I've opened "${p.summary.replace(/\.$/, "")}". Tap approve to confirm.`,
      );
      return;
    }
    case "unknown":
      // One line, never the whole capabilities list.
      yield say(
        args.reply?.trim() || `${SAY_AGAIN} You can ask what's on today or what needs your attention.`,
      );
      return;
    default:
      if ((SCENARIOS as Intent[]).includes(intent)) yield* scenario(actor, intent as Scenario, client);
  }
}

export async function* voiceTurn(
  actor: UserActor,
  input: { turnId: string; text: string; via: "voice" | "keyboard" },
  client: Db = defaultDb,
): AsyncGenerator<VoiceEvent> {
  requirePermission(actor, "agents.command", { eventId: actor.eventId });
  const runId = `voice:${input.turnId}:${randomUUID().slice(0, 8)}`;
  const t0 = performance.now();
  const memory = memoryOf(actor);
  let routed: Route | null = null;
  const said: string[] = [];
  let opened: string | undefined;
  try {
    // The guard and the intent run side by side; nothing is said or done before the guard's verdict. Rules answer
    // at once; the model (with the conversation) only when they miss, and "Let me think." covers a slow model.
    const instant = ruleRoute(input.text, memory.turns);
    const routing = instant ? Promise.resolve(instant) : route(input.text, memory.turns, runId);
    const verdict = await screen(input.text, { source: "voice", runId });
    if (verdict.verdict === "block") {
      await audit(client, {
        eventId: actor.eventId,
        actor,
        action: "voice.input_blocked",
        entity: "voice_turns",
        entityId: input.turnId,
        after: { via: input.via, by: verdict.by, reasons: verdict.reasons.slice(0, 3) },
      });
      yield { type: "intent", intent: "blocked", by: "guard", ms: Math.round(performance.now() - t0) };
      yield say("I can only help with running this event, and that request is outside it. I've logged it.");
      return;
    }
    const slow = Symbol("slow");
    const first = await Promise.race([
      routing,
      new Promise<typeof slow>((r) => setTimeout(() => r(slow), 350)),
    ]);
    if (first === slow) yield say(THINKING, "filler");
    routed = first === slow ? await routing : first;
    yield { type: "intent", intent: routed.intent, by: routed.by, ms: Math.round(performance.now() - t0) };
    const filler = FILLER[routed.intent];
    if (filler) yield say(filler, "filler");
    const ctx = { turnId: input.turnId, memory, opened: (id: string) => (opened = id) };
    for await (const e of answer(actor, routed.intent, input.text, routed.args, ctx, client)) {
      if (e.type === "say" && e.kind !== "filler") said.push(e.text);
      yield e;
    }
    // A proposal made by voice: wait for the tap in the console, then say what was sent.
    if (opened) {
      memory.entities.lastProposalId = opened;
      const end = Date.now() + APPROVAL_WAIT_MS;
      const q = busQueue(actor.eventId);
      try {
        while (Date.now() < end) {
          const item = await q.next(1000);
          if (!item || item.k !== "event" || !/^proposal\.(executed|rejected)$/.test(item.n.type)) continue;
          const line = await sentLine(opened, client);
          if (line) {
            yield stage("approve", "done", "Approved and run", ["gate:head"]);
            yield say(line, "narration");
            said.push(line);
            break;
          }
        }
      } finally {
        q.close();
      }
    }
  } catch (err) {
    log.warn({ err, intent: "voice" }, "voice turn failed");
    yield say("Something went wrong on my side. The console still works; try the same thing there.");
  } finally {
    endRun(runId);
    if (routed) {
      memory.turns.push({
        you: input.text.slice(0, 300),
        intent: routed.intent,
        said: said.join(" ").slice(0, 300),
      });
      if (memory.turns.length > MEMORY_TURNS) memory.turns.splice(0, memory.turns.length - MEMORY_TURNS);
    }
  }
}
