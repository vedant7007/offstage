// Commander intake: the organizer describes the event in their own words, the Commander asks only for what is
// still missing, then builds the plan (dated milestones, budget split, agent org chart, risks) from the event
// type's template. The plan is code; the model only helps read free text, and the rules read it without one.

import { z } from "zod";
import { EventBrief, EventType, type AgentName, type Role } from "@/contracts";
import type { PipelineIO } from "@/agents/runtime/types";
import { draft } from "@/agents/runtime/wording";
import { formatDate, istDateKey } from "@/lib/time";
import { templateFor } from "@/templates";

export const REQUIRED = ["name", "type", "dates", "expectedAttendance", "budgetInr", "venue"] as const;
type Field = (typeof REQUIRED)[number];

const TYPE_WORDS: [RegExp, EventType][] = [
  [/hackathon|hack night|buildathon/, "hackathon"],
  [/\bfest\b|tech fest|techfest/, "tech_fest"],
  [/workshop|bootcamp|masterclass/, "workshop"],
  [/conference|summit|symposium/, "conference"],
  [/cultural|dance|music night|concert/, "cultural_night"],
  [/charity|blood donation|donation drive|fundraiser|raktdaan/, "charity_drive"],
  [/marathon|\brun\b|walkathon/, "marathon"],
  [/launch/, "product_launch"],
  [/wedding|reception|sangeet/, "wedding"],
  [/meetup|community/, "community_meetup"],
  [/school|annual day|sports day/, "school_function"],
];
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** "3 lakh", "50k", "2,00,000" to rupees. */
export function rupees(s: string): number | undefined {
  const m = /(\d[\d,]*(?:\.\d+)?)\s*(k|thousand|lakh|lakhs|lac|l|cr|crore)?\b/i.exec(s);
  if (!m) return undefined;
  const unit = m[2]?.toLowerCase();
  const mult =
    unit === "k" || unit === "thousand"
      ? 1e3
      : unit?.startsWith("l")
        ? 1e5
        : unit?.startsWith("cr")
          ? 1e7
          : 1;
  return Math.round(Number(m[1]!.replace(/,/g, "")) * mult);
}

/** "24 Oct", "24-25 October 2026", "2026-10-24": ISO dates, the next occurrence when no year is given. */
export function datesIn(text: string, now: string): string[] {
  const iso = [...text.matchAll(/\b(20\d\d-\d\d-\d\d)\b/g)].map((m) => m[1]!);
  if (iso.length) return iso;
  const m =
    /\b(\d{1,2})(?:st|nd|rd|th)?(?:\s*(?:-|to|and|&)\s*(\d{1,2})(?:st|nd|rd|th)?)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?(?:\s*,?\s*(20\d\d))?/i.exec(
      text,
    );
  if (!m) return [];
  const month = MONTHS.indexOf(m[3]!.toLowerCase().slice(0, 3)) + 1;
  const today = istDateKey(now);
  const pad = (n: number) => String(n).padStart(2, "0");
  let year = m[4] ? Number(m[4]) : Number(today.slice(0, 4));
  const first = Number(m[1]);
  if (!m[4] && `${year}-${pad(month)}-${pad(first)}` < today) year++;
  const last = m[2] ? Number(m[2]) : first;
  const out: string[] = [];
  for (let d = first; d <= last && out.length < 14; d++) out.push(`${year}-${pad(month)}-${pad(d)}`);
  return out;
}

/** What the rules can read from one message. */
export function readByRules(text: string, now: string): Partial<EventBrief> {
  const t = text.toLowerCase();
  const out: Partial<EventBrief> = {};
  const type = TYPE_WORDS.find(([re]) => re.test(t))?.[1];
  if (type) out.type = type;
  const people =
    /(\d[\d,]*)\s*(?:\+\s*)?(people|attendees|participants|students|guests|registrations|runners|donors)/i.exec(
      text,
    );
  if (people) out.expectedAttendance = Number(people[1]!.replace(/,/g, ""));
  const budget =
    /(?:budget|₹|rs\.?|inr)[^\d]{0,20}(\d[\d,.]*\s*(?:k|thousand|lakh|lakhs|lac|l|cr|crore)?)/i.exec(text);
  const money = budget ? rupees(budget[1]!) : undefined;
  if (money) out.budgetInr = money;
  const dates = datesIn(text, now);
  if (dates.length) out.dates = dates;
  // A quoted name is taken whole ("Build with LLMs"); otherwise the words after "called" up to a preposition.
  const name =
    /["“]([^"”]{3,60})["”]/.exec(text) ??
    /(?:called|named|name is)\s+([A-Z][\w&' -]{2,60}?)(?:[.,]|\s+(?:on|at|in|for)\b|$)/.exec(text);
  if (name) out.name = name[1]!.trim();
  const venue =
    /\b(?:at|venue is|venue:)\s+(?:the\s+)?([A-Z][\w&',. -]{3,100}?)(?:\s+on\b|\s+for\b|\s+from\b|[.;]|$)/.exec(
      text,
    );
  if (venue) out.venue = venue[1]!.trim().replace(/[,.]$/, "");
  return out;
}

const ModelBrief = z.object({
  name: z.string().max(160).optional(),
  type: EventType.optional(),
  dates: z
    .array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/))
    .max(14)
    .optional(),
  venue: z.string().max(300).optional(),
  expectedAttendance: z.int().nonnegative().optional(),
  budgetInr: z.number().nonnegative().optional(),
  food: z.boolean().optional(),
  speakersCount: z.int().nonnegative().optional(),
  volunteersAvailable: z.int().nonnegative().optional(),
  sponsorsExpected: z.boolean().optional(),
});

/**
 * What one message adds to the brief. Rules read explicit statements and may correct earlier answers; the
 * model only fills fields that are still empty (a short answer like "80k" must not rename the event).
 */
export async function readBrief(
  text: string,
  now: string,
  io: Pick<PipelineIO, "runId" | "onAttempt" | "critical"> | null,
  known: Partial<EventBrief> = {},
): Promise<Partial<EventBrief>> {
  const rules = readByRules(text, now);
  const model = io
    ? await draft(io, {
        schema: ModelBrief,
        instructions: `Read what the organizer says about their event. Fill only fields they actually state. Today is ${istDateKey(now)}; dates as YYYY-MM-DD.`,
        facts: `Event types: ${EventType.options.join(", ")}.`,
        untrusted: text,
      })
    : null;
  const fill = Object.fromEntries(
    Object.entries(model ?? {}).filter(
      ([k, v]) => v !== undefined && known[k as keyof EventBrief] === undefined,
    ),
  );
  const merged: Partial<EventBrief> = { ...fill, ...rules };
  const parsed = EventBrief.partial().safeParse(merged);
  return parsed.success ? parsed.data : rules;
}

export const missing = (b: Partial<EventBrief>): Field[] =>
  REQUIRED.filter((f) => (f === "dates" ? !b.dates?.length : b[f] === undefined || b[f] === ""));

const QUESTIONS: Record<Field, { text: string; choices?: string[] }> = {
  name: { text: "What is the event called?" },
  type: {
    text: "What kind of event is it?",
    choices: ["Hackathon", "Workshop", "Conference", "Tech fest", "Cultural night", "Charity drive", "Other"],
  },
  dates: { text: "Which dates? For example: 24 to 25 October." },
  expectedAttendance: { text: "How many people do you expect?" },
  budgetInr: { text: "What is the total budget, in rupees? For example: 3 lakh." },
  venue: { text: "Where is it happening? The venue name is enough." },
};

export const questionsFor = (fields: Field[]) => fields.slice(0, 3).map((id) => ({ id, ...QUESTIONS[id] }));

/** Short answers to a question ("Workshop", "300") read in the context of what was asked. */
export function readAnswer(text: string, asked: string[], now: string): Partial<EventBrief> {
  const out = readByRules(text, now);
  const t = text.trim();
  if (asked.includes("name") && !out.name && asked.length === 1) out.name = t.slice(0, 160);
  if (asked.includes("venue") && !out.venue && asked.length === 1) out.venue = t.slice(0, 300);
  if (asked.includes("type") && !out.type) {
    const choice = t.toLowerCase().replace(/\s+/g, "_");
    if ((EventType.options as string[]).includes(choice)) out.type = choice as EventType;
  }
  if (asked.includes("expectedAttendance") && out.expectedAttendance === undefined && /^\d[\d,]*$/.test(t))
    out.expectedAttendance = Number(t.replace(/,/g, ""));
  if (asked.includes("budgetInr") && out.budgetInr === undefined) {
    const r = rupees(t);
    if (r) out.budgetInr = r;
  }
  return out;
}

export type TeamDefault = { agent: AgentName; humanLeadRole: Role; purpose: string };

/** The plan.create payload for a complete brief. Every date and number is computed here. */
export function planFromBrief(b: EventBrief, now: string, team: TeamDefault[]) {
  const tpl = templateFor(b.type!);
  const first = [...b.dates!].sort()[0]!;
  const today = istDateKey(now);
  const due = (days: number) => {
    const d = istDateKey(new Date(Date.parse(`${first}T12:00:00+05:30`) - days * 86_400_000));
    return d < today ? today : d;
  };
  const total = b.budgetInr!;
  const categories = tpl.budget.map((c) => ({
    key: c.key,
    name: c.name,
    capInr: Math.round((total * c.pct) / 100 / 1000) * 1000,
  }));
  const leadTimeDays = Math.round(
    (Date.parse(`${first}T00:00:00+05:30`) - Date.parse(`${today}T00:00:00+05:30`)) / 86_400_000,
  );
  const risks = [
    ...(leadTimeDays < 21
      ? [
          {
            title: `Only ${leadTimeDays} days to go`,
            likelihood: "high" as const,
            impact: "high" as const,
            mitigation: "Cut scope to the critical milestones and approve in daily batches.",
            domain: "planning" as const,
          },
        ]
      : []),
    ...(b.expectedAttendance! > 200 && b.food !== false
      ? [
          {
            title: "Food counts drift from registrations",
            likelihood: "medium" as const,
            impact: "high" as const,
            mitigation:
              "Logistics recounts from registrations; the final count goes to the caterer 3 days before.",
            domain: "logistics" as const,
          },
        ]
      : []),
    {
      title: "A speaker or key guest drops out",
      likelihood: "medium" as const,
      impact: "medium" as const,
      mitigation: "The Commander proposes a replan with the schedule solver and tells everyone affected.",
      domain: "schedule" as const,
    },
    {
      title: "Crowd at the entrance",
      likelihood: "medium" as const,
      impact: "medium" as const,
      mitigation: "Radar watches check-ins and proposes a second desk.",
      domain: "ops" as const,
    },
  ];
  return {
    title: `${b.name} plan`.slice(0, 160),
    summary: `${b.name}, ${b.dates!.length} day${b.dates!.length > 1 ? "s" : ""} from ${formatDate(`${first}T12:00:00+05:30`)} at ${b.venue}, for about ${b.expectedAttendance} people.`,
    milestones: tpl.milestones.map((m) => ({
      title: m.title,
      domain: m.domain,
      dueOn: due(m.daysBefore),
      ownerRole: (m.domain === "planning" ? "owner" : "lead") as Role,
      dependsOn: [],
      critical: m.critical,
    })),
    budget: { totalInr: categories.reduce((a, c) => a + c.capInr, 0), categories },
    risks,
    agentTeam: team.map((a) => ({
      agent: a.agent,
      enabled: !tpl.agentsOff.includes(a.agent),
      humanLeadRole: a.humanLeadRole,
      mandate: a.purpose.slice(0, 200),
    })),
  };
}
