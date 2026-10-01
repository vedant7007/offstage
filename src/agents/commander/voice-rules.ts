// The voice Commander's pure parts: the intents, the instant phrase rules, the spoken fillers and the sentence
// splitter. No model and no server imports, so the browser (the showcase voice) can use them too.

import type { ActionProposal } from "@/contracts";

export const INTENTS = [
  "greeting",
  "smalltalk",
  "attention",
  "briefing",
  "briefing_tomorrow",
  "registrations",
  "unconfirmed",
  "remind_unconfirmed",
  "announce",
  "message_volunteers",
  "remind_member",
  "move_session",
  "speaker_cancel",
  "lunch_confusion",
  "projector_voice_note",
  "budget_breach",
  "volunteer_noshow",
  "whatif",
  "closeout",
  "approve",
  "unknown",
] as const;
export type Intent = (typeof INTENTS)[number];
export type Scenario = Extract<
  Intent,
  "speaker_cancel" | "lunch_confusion" | "projector_voice_note" | "budget_breach" | "volunteer_noshow"
>;
export const SCENARIOS: Scenario[] = [
  "speaker_cancel",
  "lunch_confusion",
  "projector_voice_note",
  "budget_breach",
  "volunteer_noshow",
];

/** What an intent needs from the words: the message to send, who, which session, what time. */
export type Args = { message?: string; person?: string; session?: string; time?: string; reply?: string };
export type Route = { intent: Intent; args: Args; by: "rules" | "model" };
/** The last turns, oldest first, as the classifier sees them. */
export type HistoryTurn = { you: string; intent: Intent; said: string };

const after = (text: string, re: RegExp) =>
  text
    .replace(re, "")
    .replace(/^[\s:,-]+/, "")
    .trim();

/**
 * Instant routes for phrasings we know. Order matters: actions first ("send an announcement: lunch is moved"
 * is an announcement, not lunch confusion), then questions, then the scenarios.
 */
export function ruleRoute(text: string, history: HistoryTurn[] = []): Route | null {
  const raw = text.trim();
  const t = raw
    .toLowerCase()
    .replace(/[^\p{L}\p{N}':,. ]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const last = history.at(-1)?.intent;
  const r = (intent: Intent, args: Args = {}): Route => ({ intent, args, by: "rules" });

  if (
    /^(please |ok(ay)? |yes,? |haan,? )?(approve|go ahead and approve|approve (it|this|that|the plan))\b/.test(
      t,
    )
  )
    return r("approve");
  if (/^(send|make|post|put out) (an |a )?(announcement|notice|update)\b/.test(t))
    return r("announce", {
      message: after(raw, /^.*?\b(announcement|notice|update)\b(\s*(saying|that|to everyone))?/i),
    });
  if (/^(announce|tell everyone|tell all attendees)\b/.test(t))
    return r("announce", { message: after(raw, /^(announce|tell everyone|tell all attendees)(\s+that)?/i) });
  if (/^(message|tell|ping|notify) (all |the )?volunteers\b/.test(t))
    return r("message_volunteers", { message: after(raw, /^.*?\bvolunteers\b(\s+(that|to))?/i) });
  if (
    /^remi?y?nd (the )?(speakers?|them)\b.*\b(confirm|not confirmed|hasn'?t)/.test(t) ||
    (/^remind them\b/.test(t) && last === "unconfirmed")
  )
    return r("remind_unconfirmed");
  const remind = /^remi?y?nd ([a-z][a-z.]*(?: [a-z][a-z.]*)?) (about|to|of) (.+)$/i.exec(
    raw.replace(/[.!?]+$/, ""),
  );
  if (remind && !/^(the|all|them|everyone)\b/i.test(remind[1]!))
    return r("remind_member", { person: remind[1], message: `${remind[2]} ${remind[3]}` });
  const move = /^(move|shift|push|reschedule) (the )?(.+?) (to|at) (\d{1,2}(:\d{2})?\s*(am|pm)?)\b/i.exec(
    raw,
  );
  if (move) return r("move_session", { session: move[3], time: move[5] });

  if (
    /^(hi|hello|hey|hii+|namaste|good (morning|afternoon|evening))\b[\s,.!a-z]*$/.test(t) &&
    t.split(" ").length <= 4
  )
    return r("greeting");
  if (
    /\b(anything|what) (do )?i (need|have) to (take care of|do|handle)\b|\bwhat'?s pending\b|\banything (urgent|pending)\b|\bwhat should i (do|look at)( now)?\b|\bneeds? my attention\b/.test(
      t,
    )
  )
    return r("attention");
  if (
    /\bwho (hasn'?t|has not|haven'?t) confirmed\b|\bunconfirmed speakers?\b|\bspeakers? (not|yet to) confirm/.test(
      t,
    )
  )
    return r("unconfirmed");
  if (
    /^(and |what about |how about )?tomorrow\b|\b(what'?s|what is) (on|happening) tomorrow\b|\btomorrow'?s (plan|agenda|schedule)\b/.test(
      t,
    )
  )
    return r("briefing_tomorrow");
  if (/^(what if|what happens if|suppose|agar)\b|\bwhat if\b/.test(t)) return r("whatif");
  if (
    /\bhow did (the |our )?(event|it|hacknova|day) go\b|\bclose[- ]?out\b|\bfinal report\b|\bwrap[- ]?up report\b/.test(
      t,
    )
  )
    return r("closeout");
  if (
    /\b(keynote|speaker)\b.*\b(cancel+ed|cancel+ing|cancels|dropped out|pulled out|not coming|can'?t make it|nahi aa)/.test(
      t,
    )
  )
    return r("speaker_cancel");
  if (
    /\bvolunteer\b.*\b(didn'?t|did not|no[- ]?show|not (turn(ed)? up|show(n|ed)? up)|missing|absent|nahi aaya)/.test(
      t,
    )
  )
    return r("volunteer_noshow");
  // Someone (not a speaker, that rule is above) did not turn up: a volunteer shift is the usual case.
  if (/\b(didn'?t|did not|has not|hasn'?t) (show(n|ed)? up|turn(ed)? up|come|arrive[d]?)\b/.test(t))
    return r("volunteer_noshow");
  if (/\bprojector\b|\b(screen|av|mic|microphone)\b.*\b(dead|not working|broken|band)\b/.test(t))
    return r("projector_voice_note");
  if (
    /\bover ?budget\b|\bbudget\b.*\b(over|exceed|breach|blown|cross)|\b(catering|food)\b.*\b(over|budget|exceed)/.test(
      t,
    )
  )
    return r("budget_breach");
  if (/\blunch\b|\bkhana\b|\bfood\b.*\b(where|confus|kahan)/.test(t)) return r("lunch_confusion");
  if (
    /\bregistration|\bsign[- ]?ups?\b|\bhow many (people )?(registered|signed up|are coming|checked in)\b|\bcheck[- ]?ins?\b/.test(
      t,
    )
  )
    return r("registrations");
  if (
    /\bwhat'?s (on|happening) (today|now)\b|\bwhat is (on|happening) today\b|\b(today'?s|daily|morning) (briefing|plan|agenda)\b|\bbriefing\b|\baaj kya\b/.test(
      t,
    )
  )
    return r("briefing");
  return null;
}

/** Back compatible: the intent alone. */
export function ruleIntent(text: string): Intent | null {
  return ruleRoute(text)?.intent ?? null;
}

/** Said at once for slow work, so the first audio never waits on an agent. */
export const FILLER: Partial<Record<Intent, string>> = {
  briefing: "One moment, pulling today's briefing.",
  speaker_cancel: "On it. Waking the Commander and the Scheduler.",
  lunch_confusion: "On it. Asking Radar to look at the helpdesk questions.",
  projector_voice_note: "On it. Logging the incident and finding a tech volunteer.",
  budget_breach: "On it. Asking Finance to check the catering budget.",
  volunteer_noshow: "On it. Waking the Crew Chief.",
  whatif: "Let me simulate that. Nothing in the real event will change.",
  closeout: "Pulling the close-out report.",
  announce: "Drafting it with the Herald.",
  message_volunteers: "Drafting it with the Herald.",
  remind_member: "Drafting the reminder.",
  remind_unconfirmed: "Drafting the reminders with the Speaker Liaison.",
  move_session: "Checking that with the Scheduler.",
};
/** Said when the model takes a while to understand the words. */
export const THINKING = "Let me think.";

/** Said when the words were not caught or not understood: ask again rather than refuse. */
export const SAY_AGAIN = "Sorry, say that again or type it.";

export const CAPABILITIES =
  "I can read today's briefing, tell you how registrations are going, handle a cancelled speaker, lunch confusion, broken equipment, a budget overrun or a missing volunteer, run a what if, and summarise how the event went.";

/** Split model or service text into speakable sentences. */
export function sentences(text: string, max = 4): string[] {
  // A point between digits ("66.9%") is a decimal, not the end of a sentence.
  return (text.match(/(?:[^.!?]|\.(?=\d))+[.!?]+["')\]]?|(?:[^.!?]|\.(?=\d))+$/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, max);
}

/** Numbers read naturally: "two hundred and twenty three" is the TTS's job; we only round and add words. */
export const pctWords = (x: number) => `${Math.round(x)} percent`;

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
export const who = (a: string) => NAME[a] ?? a.replace(/_/g, " ");
export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Said when a proposal waits for a person. */
export const approvalLine = (tier: string) =>
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
