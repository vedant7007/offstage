/**
 * Showcase helpdesk: the same contract as POST /api/agents/chat, answered in the browser. BM25 over the
 * recorded knowledge base plus the live schedule (so a moved session answers with its new time). Below
 * the score threshold it escalates with the real helpdesk's words; injection attempts get the real
 * guard's calm refusal.
 */
import type { ChatRequest, ChatResult, MyScheduleResponse } from "@/contracts/api";
import { formatDayShort, formatTime } from "@/lib/time";
import kb from "./fixtures/kb.json";

type Lang = "en" | "hi" | "hinglish";
type Doc = { text: string; answer: string; citation: { ref: string; label: string } };

// Same words as src/agents/helpdesk/answer.ts.
const HINGLISH =
  /\b(kya|hai|hain|kahan|kaha|milega|milegi|kab|nahi|nahin|mera|meri|mujhe|kaise|kitne|baje|aur|kaun|kyun|hoga|chahiye|dusre|walon)\b/i;
const detect = (t: string): Lang => (/[ऀ-ॿ]/.test(t) ? "hi" : HINGLISH.test(t) ? "hinglish" : "en");
const NOT_SURE: Record<Lang, string> = {
  en: "I'm not sure about that, I've passed it to the team. Someone will reply soon.",
  hinglish:
    "Iske baare mein mujhe pakka nahi pata, maine aapka sawaal team ko bhej diya hai. Jaldi reply aayega.",
  hi: "मुझे इसके बारे में पक्की जानकारी नहीं है, मैंने आपका सवाल टीम को भेज दिया है। जल्दी जवाब मिलेगा।",
};
const BLOCKED: Record<Lang, string> = {
  en: "I can only help with questions about this event.",
  hinglish: "Main sirf is event ke baare mein sawaalon mein madad kar sakta hoon.",
  hi: "मैं केवल इस इवेंट से जुड़े सवालों में मदद कर सकता हूँ।",
};

// The strongest rules of src/ai/guard: instruction overrides, prompt extraction, role changes, data grabs.
const INJECTION = [
  /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|your|system)\b.{0,20}\b(instructions?|prompts?|rules?|messages?|directions?)/i,
  /\b(instructions?|rules?|prompt)\b.{0,20}\b(bhool|bhul|ignore|chhod|chod)\b/i,
  /\b(pichl[ae]|pehl[ae])\b.{0,30}\b(bhool|bhul|ignore)/i,
  /\byou are (now|no longer)\b|\bfrom now on,? you\b|\bnew (persona|role|instructions?)\b/i,
  /\b(system|developer|hidden|initial|original)\s+(prompt|message|instructions?)\b/i,
  /\b(reveal|print|show|repeat|output|batao|dikhao)\b.{0,30}\b(your|the|apna|apne)\b.{0,20}\b(prompt|instructions?|rules|config)/i,
  /\b(jailbreak|DAN mode|developer mode|god mode|sudo mode|no restrictions|unfiltered)\b/i,
  /<\/?(system|assistant|untrusted[\w-]*)>|\[\/?(INST|SYS)\]|<\|im_(start|end)\|>/i,
  /\b(make|set|mark|upgrade|promote)\s+(me|my account|this user)\b.{0,30}\b(admin|organi[sz]er|owner|lead|faculty|approver|vip)\b/i,
  /\b(list|show|give|share|tell)\b.{0,40}\b(all|other|every|another)\b.{0,30}\b(attendees?|participants?|users?|registrations?|people)('s)?\b.{0,30}\b(emails?|phones?|numbers?|details|data|names|contacts?)/i,
];

const STOP = new Set(
  [
    "a an the is are am was were be do does did i me my you your we our it its of to in on at for from and",
    "or what whats when where which who how can could will would there this that time get any please",
    // Hinglish question words (the HINGLISH list above), so "lunch kahan milega" searches for lunch.
    "kya hai hain kahan kaha milega milegi kab nahi nahin mera meri mujhe kaise kitne baje aur kaun kyun hoga chahiye",
  ]
    .join(" ")
    .split(" "),
);
export const tokens = (s: string) =>
  s
    .toLowerCase()
    .replace(/['’]s\b/g, "")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 1 && !STOP.has(w))
    .map((w) => (w.length > 3 && !w.endsWith("ss") ? w.replace(/s$/, "") : w));

/**
 * Okapi BM25, k1 1.2, b 0.75. Returns the best document: [index, score, share of the query terms it has].
 */
export function bm25(docs: string[][], query: string[]): [number, number, number] {
  const N = docs.length;
  const avg = docs.reduce((n, d) => n + d.length, 0) / (N || 1);
  const df = new Map<string, number>();
  for (const d of docs) for (const w of new Set(d)) df.set(w, (df.get(w) ?? 0) + 1);
  const terms = new Set(query);
  let best: [number, number, number] = [-1, 0, 0];
  docs.forEach((d, i) => {
    let score = 0;
    let hits = 0;
    for (const q of terms) {
      const tf = d.filter((w) => w === q).length;
      if (!tf) continue;
      hits++;
      const n = df.get(q) ?? 0;
      const idf = Math.log(1 + (N - n + 0.5) / (n + 0.5));
      score += (idf * tf * 2.2) / (tf + 1.2 * (0.25 + (0.75 * d.length) / avg));
    }
    if (score > best[1]) best = [i, score, hits / terms.size];
  });
  return best;
}

/**
 * Below these the helpdesk escalates rather than guess: a weak match, or one that covers too little of
 * the question. Tuned on tests/unit/showcase/helpdesk.test.ts.
 */
export const MIN_SCORE = 2.5;
const confident = (score: number, coverage: number) =>
  score >= MIN_SCORE && (coverage > 0.99 || (coverage >= 0.5 && score >= 4));

/** A few everyday words the documents put differently. */
const ALSO: Record<string, string[]> = {
  lunch: ["food", "court"],
  dinner: ["food", "court"],
  breakfast: ["food", "court"],
  khana: ["food", "court"],
  bike: ["two", "wheeler"],
  internet: ["wifi"],
};
const expand = (q: string[]) => [...q, ...q.flatMap((w) => ALSO[w] ?? [])];

const titles = new Map(kb.docs.map((d) => [d.id, d.title]));
const KB_DOCS: Doc[] = kb.chunks.map((c) => {
  const title = titles.get(c.docId) ?? c.docId;
  return {
    text: `${c.heading} ${c.heading} ${c.text}`,
    answer: c.text,
    citation: { ref: `kb:${c.docId}#${c.heading}`, label: c.heading ? `${title}: ${c.heading}` : title },
  };
});

/** Upcoming sessions as documents. A cancelled one names what took its slot. */
function sessionDocs(schedule: MyScheduleResponse | undefined): Doc[] {
  if (!schedule) return [];
  const room = new Map(schedule.rooms.map((r) => [r.id, r.name]));
  const live = schedule.sessions.filter((s) => s.status !== "done");
  return live.map((s) => {
    const where = room.get(s.roomId) ?? "a room to be announced";
    const when = `${formatDayShort(s.startsAt)} at ${formatTime(s.startsAt)}`;
    let answer = `${s.title} is on ${when} in ${where}.`;
    if (s.status === "cancelled") {
      const swap = live.find(
        (x) => x !== s && x.status !== "cancelled" && x.startsAt === s.startsAt && x.roomId === s.roomId,
      );
      answer = `${s.title} is cancelled.${swap ? ` ${swap.title} now runs in its slot, ${when} in ${where}.` : ""}`;
    } else if (s.change && s.change.kind !== "cancelled") answer += ` ${s.change.text}`;
    return {
      text: `${s.title} ${s.title} session talk start ${where} ${s.status}`,
      answer,
      citation: { ref: "live:schedule", label: "Today's schedule" },
    };
  });
}

export function answer(message: string, schedule?: MyScheduleResponse): ChatResult {
  const language = detect(message);
  const ids = { conversationId: crypto.randomUUID(), messageId: crypto.randomUUID() };
  if (INJECTION.some((r) => r.test(message)))
    return {
      ...ids,
      answer: { answer: BLOCKED[language], citations: [], confidence: 1, needsEscalation: false, language },
      blocked: true,
    };
  const docs = [...sessionDocs(schedule), ...KB_DOCS];
  const [i, score, coverage] = bm25(
    docs.map((d) => tokens(d.text)),
    expand(tokens(message)),
  );
  const hit = docs[i];
  if (!hit || !confident(score, coverage))
    return {
      ...ids,
      answer: {
        answer: NOT_SURE[language],
        citations: [],
        confidence: 0,
        needsEscalation: true,
        escalationSummary: message.slice(0, 600),
        language,
      },
      escalationId: crypto.randomUUID(),
      blocked: false,
    };
  return {
    ...ids,
    answer: {
      answer: hit.answer,
      citations: [hit.citation],
      confidence: Math.min(0.95, 0.5 + score / 20),
      needsEscalation: false,
      language,
    },
    blocked: false,
  };
}

export async function* chat(body: ChatRequest, schedule?: MyScheduleResponse) {
  const result = answer(body.message, schedule);
  for (const word of result.answer.answer.split(/(\s+)/)) {
    if (!word) continue;
    await new Promise((r) => setTimeout(r, 12));
    yield { type: "delta" as const, text: word };
  }
  yield { type: "done" as const, result };
}
