// Chronicler: after the event (or when an organizer asks), code counts attendance, sessions, incidents,
// helpdesk load, volunteer hours and money, and proposes the final report with those numbers. Each resolved
// incident becomes a playbook lesson. The model only words the summary and lessons, and a wording that
// brings numbers of its own is dropped for the template.

import { z } from "zod";
import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig, AgentProposal, PipelineIO, RunContext } from "@/agents/runtime/types";
import { draft, onlyGivenNumbers } from "@/agents/runtime/wording";
import { formatInr, formatPercent } from "@/lib/format";
import { lessonIncidents, minutesToResolve, reportFacts, type ReportFacts } from "./logic";

type Ctx = RunContext<ReadServices>;
type IO = Pick<PipelineIO, "runId" | "onAttempt" | "critical"> | null;

/** Lessons per run, so a messy event does not flood the playbook queue. */
const MAX_LESSONS = 10;

export function factLines(f: ReportFacts): string[] {
  const rate = f.confirmed ? ` (${formatPercent(f.attended / f.confirmed)})` : "";
  return [
    `${f.attended} of ${f.confirmed} confirmed attendees checked in${rate}.`,
    `${f.sessionsDone} of ${f.sessionsTotal} sessions done, ${f.sessionsCancelled} cancelled.`,
    `${f.incidents} incidents, ${f.incidentsResolved} resolved.`,
    `${f.helpdeskQuestions} helpdesk questions during the event; ${f.escalations} passed to a person, ${f.escalationsOpen} still open.`,
    `${f.volunteers} volunteers served ${f.volunteerHours} hours.`,
    `Money in ${formatInr(f.moneyInInr)}, money out ${formatInr(f.moneyOutInr)}.`,
  ];
}

const Summary = z.object({
  summary: z.string().max(560).describe("Three plain sentences for the event head"),
});
const Lesson = z.object({
  title: z.string().max(160),
  lesson: z.string().max(600).describe("What to do differently next time, two sentences"),
});

async function reportPlan(ctx: Ctx, io: IO, key: string): Promise<AgentProposal> {
  const s = ctx.services;
  const event = await s.event();
  const [registrations, checkins, sessions, incidents, questions, escalations, volunteers, { ledger }] =
    await Promise.all([
      s.registrations({ limit: 100_000 }),
      s.checkins(),
      s.sessions(),
      s.incidents(),
      s.helpdeskQuestions(event.startsAt),
      s.escalations(),
      s.volunteers(),
      s.budget(),
    ]);
  const f = reportFacts({
    registrations,
    checkins,
    sessions,
    incidents,
    helpdeskQuestions: questions.length,
    escalations,
    volunteers,
    ledger,
  });
  const lines = factLines(f);
  const facts = lines.join("\n");
  const words = io
    ? await draft(io, {
        schema: Summary,
        instructions: `Summarise how ${event.name} went for the event head, in three plain sentences. Use the numbers exactly as given.`,
        facts,
      })
    : null;
  return {
    kind: "report.generate",
    payload: { kind: "final" },
    summary: `Final report for ${event.name}`.slice(0, 120),
    rationale: (words && onlyGivenNumbers(words.summary, facts) ? words.summary : facts).slice(0, 600),
    evidence: [
      { type: "metric", ref: "live:attendance", label: lines[0]!.slice(0, 160) },
      { type: "metric", ref: "live:sessions", label: lines[1]!.slice(0, 160) },
      { type: "metric", ref: "live:incidents", label: lines[2]!.slice(0, 160) },
      { type: "metric", ref: "live:helpdesk_questions", label: lines[3]!.slice(0, 160) },
      { type: "metric", ref: "live:volunteer_hours", label: lines[4]!.slice(0, 160) },
      { type: "metric", ref: "live:ledger", label: lines[5]!.slice(0, 160) },
    ],
    dedupeKey: key,
  };
}

async function lessonPlans(ctx: Ctx, io: IO): Promise<AgentProposal[]> {
  const [event, incidents] = await Promise.all([ctx.services.event(), ctx.services.incidents()]);
  const out: AgentProposal[] = [];
  for (const i of lessonIncidents(incidents).slice(0, MAX_LESSONS)) {
    const mins = minutesToResolve(i);
    const facts = `Incident: ${i.title}. Category: ${i.category}. Severity: ${i.severity}.${mins !== null ? ` Resolved in ${mins} minutes.` : ""}`;
    const words = io
      ? await draft(io, {
          schema: Lesson,
          instructions: "Turn this resolved incident into a short lesson for organisers of the next event.",
          facts,
          // Descriptions can carry voice-note transcripts: data, not instructions.
          untrusted: i.description,
        })
      : null;
    const ok = words && onlyGivenNumbers(`${words.title}\n${words.lesson}`, facts);
    out.push({
      kind: "playbook.add_lesson",
      payload: {
        eventType: event.type,
        title: (ok ? words.title : i.title).slice(0, 160),
        lesson: ok
          ? words.lesson
          : `${i.title} (${i.category}, ${i.severity})${mins !== null ? ` took ${mins} minutes to resolve` : " was resolved"}. Plan for it next time.`,
        evidenceRefs: [`row:incidents/${i.id}`],
        tags: [i.category],
      },
      summary: `Lesson: ${i.title}`.slice(0, 120),
      rationale: "Resolved incidents become lessons so the next event starts smarter.",
      evidence: [{ type: "row", ref: `incidents/${i.id}`, label: i.title.slice(0, 160) }],
      dedupeKey: `lesson:${i.id}`,
    });
  }
  return out;
}

async function plan(ctx: Ctx, io: IO): Promise<AgentProposal[]> {
  const command = ctx.trigger.type === "command" || ctx.trigger.type === "manual";
  if (!command) {
    // The nightly tick only reports once the event is over, and only once.
    const event = await ctx.services.event();
    if (ctx.services.now() < event.endsAt) return [];
  }
  // An organizer's command is a fresh request; the scheduled report is made once.
  const key = command ? `report:final:${ctx.trigger.ref ?? ctx.services.now()}` : "report:final";
  return [await reportPlan(ctx, io, key), ...(await lessonPlans(ctx, io))];
}

export const chronicler: AgentConfig<ReadServices> = {
  name: "chronicler",
  purpose: "Writes the final report from real numbers and saves lessons from resolved incidents",
  humanLeadRole: "owner",
  domain: "post_event",
  modelTier: "fast",
  tools: [],
  actions: ["report.generate", "playbook.add_lesson"],
  systemPrompt: () => "",
  triggers: [{ type: "command" }, { type: "schedule", name: "wrap_up", cron: "0 21 * * *" }],
  maxSteps: 1,
  criticality: "normal",
  pipeline: async (ctx, io) => {
    const proposals = await plan(ctx, io);
    for (const p of proposals) await ctx.propose(p);
    return {
      text: proposals.length ? `Proposed ${proposals.length} actions.` : "The event is not over yet.",
    };
  },
  fallback: (ctx) => plan(ctx, null),
};
