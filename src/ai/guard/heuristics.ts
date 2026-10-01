// Heuristic input screening: pure, no model and no Node APIs, so the browser (the showcase voice) can use it too.

/** `by` says which screen decided: heuristics, Prompt Guard 2, the fast-tier classifier, or heuristics alone because no model answered. */
export type Verdict = {
  verdict: "allow" | "flag" | "block";
  reasons: string[];
  score: number;
  by: "heuristics" | "prompt_guard" | "classifier" | "heuristics_only";
};

export const BLOCK_AT = 0.8;
export const FLAG_AT = 0.5;
const MAX_CHARS = 4000;

// [pattern, score, reason]. English and Hinglish, since attendees write both.
const RULES: [RegExp, number, string][] = [
  [
    /\b(ignore|disregard|forget|override)\b.{0,40}\b(previous|prior|above|earlier|all|your|system)\b.{0,20}\b(instructions?|prompts?|rules?|messages?|directions?)/i,
    0.95,
    "instruction override",
  ],
  [
    /\b(instructions?|rules?|prompt)\b.{0,20}\b(bhool|bhul|ignore|chhod|chod)\b/i,
    0.95,
    "instruction override (Hinglish)",
  ],
  [/\b(pichl[ae]|pehl[ae])\b.{0,30}\b(bhool|bhul|ignore)/i, 0.95, "instruction override (Hinglish)"],
  [
    /\byou are (now|no longer)\b|\bfrom now on,? you\b|\bnew (persona|role|instructions?)\b/i,
    0.9,
    "role reassignment",
  ],
  [
    /\b(system|developer|hidden|initial|original)\s+(prompt|message|instructions?)\b/i,
    0.9,
    "prompt leak probe",
  ],
  [
    /\b(reveal|print|show|repeat|output|batao|dikhao)\b.{0,30}\b(your|the|apna|apne)\b.{0,20}\b(prompt|instructions?|rules|config)/i,
    0.9,
    "prompt leak probe",
  ],
  [
    /\b(repeat|print|output|copy|echo)\b.{0,30}\b(text|words|everything|content|messages?)\b.{0,20}\b(above|before this|so far|earlier)\b/i,
    0.9,
    "prompt leak probe",
  ],
  [
    /\b(jailbreak|DAN mode|developer mode|god mode|sudo mode|no restrictions|unfiltered)\b/i,
    0.9,
    "jailbreak keyword",
  ],
  [
    /<\/?(system|assistant|untrusted[\w-]*)>|\[\/?(INST|SYS)\]|<\|im_(start|end)\|>/i,
    0.9,
    "chat template injection",
  ],
  [
    /\b(make|set|mark|upgrade|promote)\s+(me|my account|this user)\b.{0,30}\b(admin|organi[sz]er|owner|lead|faculty|approver|vip)\b/i,
    0.9,
    "privilege escalation request",
  ],
  [
    /\b(list|show|give|share|tell)\b.{0,40}\b(all|other|every|another)\b.{0,30}\b(attendees?|participants?|users?|registrations?|people)('s)?\b.{0,30}\b(emails?|phones?|numbers?|details|data|names|contacts?)/i,
    0.85,
    "cross-attendee data request",
  ],
  [
    /\b(mark|set|change|update)\b.{0,30}\b(my|me|his|her|their)\b.{0,30}\b(status|attendance|check-?in|registration)\b.{0,30}\b(to|as)\b/i,
    0.6,
    "status change request",
  ],
  [/\b(pretend|act as|role-?play|imagine you are|behave like)\b/i, 0.55, "role-play request"],
  [/[A-Za-z0-9+/]{120,}={0,2}/, 0.6, "encoded blob"],
];

export function heuristics(text: string): Verdict {
  const reasons: string[] = [];
  let score = 0;
  for (const [re, s, reason] of RULES) {
    if (re.test(text)) {
      reasons.push(reason);
      score = Math.max(score, s);
    }
  }
  if (text.length > MAX_CHARS) {
    reasons.push("excessive length");
    score = Math.max(score, 0.6);
  }
  return { verdict: toVerdict(score), reasons, score, by: "heuristics" };
}

export const toVerdict = (score: number): Verdict["verdict"] =>
  score >= BLOCK_AT ? "block" : score >= FLAG_AT ? "flag" : "allow";
