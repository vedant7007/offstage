// Radar: watches the floor. Code detects a confusion spike, a check-in queue or a voice-note problem; the
// model only words the incident and the notice. One situation gives one set of proposals, however many
// events report it (dedupe keys per time bucket, and an open incident on the same thing stops a repeat).

import { z } from "zod";
import { isEmergencyCategory, type Incident, type Volunteer } from "@/contracts";
import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig, AgentProposal, PipelineIO, RunContext } from "@/agents/runtime/types";
import { draft } from "@/agents/runtime/wording";
import {
  CONFUSION_WINDOW_MIN,
  QUEUE_WINDOW_MIN,
  bucket,
  classify,
  confusion,
  queueSpike,
  roomIn,
} from "./detect";

type Ctx = RunContext<ReadServices>;
type IO = Pick<PipelineIO, "runId" | "onAttempt" | "critical"> | null;

const minutesAgo = (now: string, m: number) => new Date(Date.parse(now) - m * 60_000).toISOString();
/** An unresolved incident on the same thing raised in the last half hour: the situation is already known. */
const recentIncident = (incidents: Incident[], now: string, category: string, marker: string) =>
  incidents.some(
    (i) =>
      i.status !== "resolved" &&
      i.category === category &&
      i.title.includes(marker) &&
      i.createdAt >= minutesAgo(now, 30),
  );

/** Active volunteers with the skill who are not on a shift right now, fewest hours first. */
async function freeWith(ctx: Ctx, skill: string, n: number): Promise<Volunteer[]> {
  const now = ctx.services.now();
  const [vols, shifts, assigns] = await Promise.all([
    ctx.services.volunteers(),
    ctx.services.shifts(),
    ctx.services.shiftAssignments(),
  ]);
  const onNow = new Set(
    assigns
      .filter((a) => a.status === "assigned" || a.status === "checked_in")
      .filter((a) => {
        const s = shifts.find((x) => x.id === a.shiftId);
        return s && s.startsAt <= now && s.endsAt > now;
      })
      .map((a) => a.volunteerId),
  );
  return vols
    .filter((v) => v.active && v.skills.includes(skill) && !onNow.has(v.id))
    .sort((a, b) => a.hoursServed - b.hoursServed)
    .slice(0, n);
}

const Notice = z.object({
  incidentTitle: z.string().max(160),
  announcement: z.string().max(600).describe("Two sentences for attendees, only facts from the documents"),
});

async function confusionPlan(ctx: Ctx, io: IO): Promise<AgentProposal[]> {
  const now = ctx.services.now();
  const found = confusion(await ctx.services.helpdeskQuestions(minutesAgo(now, CONFUSION_WINDOW_MIN)));
  if (!found) return [];
  const { topic, questions } = found;
  if (recentIncident(await ctx.services.incidents(), now, "confusion", topic.label)) return [];
  const key = `confusion:${topic.key}:${bucket(now, 30)}`;
  // Several excerpts with their section titles: menus are per day, and "where" often sits in its own section.
  const docs = await ctx.services.searchKb(topic.query, 5);
  const doc = docs[0];
  const today = new Date(now).toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  });
  const dayMonth = new Date(now).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "long",
    timeZone: "Asia/Kolkata",
  });
  const n = questions.length;
  const words = io
    ? await draft(io, {
        schema: Notice,
        instructions: `${n} people asked about ${topic.label} in ${CONFUSION_WINDOW_MIN} minutes. Write a short incident title that includes the words "${topic.label}", and a friendly two-sentence announcement that says where and when, for today only, from the excerpts only.`,
        facts: docs.length
          ? `Today is ${today}.\n${docs.map((d) => `[${d.docTitle}: ${d.section}] ${d.snippet}`).join("\n")}`
          : "No document covers this.",
        untrusted: questions
          .slice(0, 6)
          .map((q) => q.text)
          .join("\n"),
      })
    : null;
  // Template: today's excerpt plus the one that says where.
  const todays = docs.find((d) => d.section.includes(dayMonth));
  const where = docs.find(
    (d) => d !== todays && /\b(served at|is in|located|next to|in block)\b/i.test(d.snippet),
  );
  const template = [where, todays ?? doc]
    .filter(Boolean)
    .map((d) => d!.snippet.slice(0, 300))
    .join(" ");
  const title = words?.incidentTitle.includes(topic.label)
    ? words.incidentTitle
    : `${n} people asked about ${topic.label} in ${CONFUSION_WINDOW_MIN} minutes`;
  const evidence = [
    {
      type: "metric" as const,
      ref: `live:helpdesk_questions/${topic.key}`,
      label: `${n} questions in ${CONFUSION_WINDOW_MIN} min`,
    },
  ];
  const out: AgentProposal[] = [
    {
      kind: "incident.create",
      payload: {
        title,
        category: "confusion",
        severity: "medium",
        source: "radar",
        description: `${n} helpdesk questions about ${topic.label} between ${questions[0]!.at} and ${questions.at(-1)!.at}.`,
        evidenceRefs: questions.slice(0, 10).map((q) => `row:messages/${q.messageId}`),
      },
      summary: title.slice(0, 120),
      rationale: `Confusion Radar: ${n} questions on one topic in ${CONFUSION_WINDOW_MIN} minutes (threshold 8).`,
      evidence,
      dedupeKey: key,
    },
    {
      kind: "crew.create_task",
      payload: {
        title: `Put up signs for ${topic.label}`.slice(0, 160),
        description: `People keep asking about ${topic.label}. Put signs at the entrance, the registration desk and the stairs.`,
        skill: "runner",
        priority: "high",
      },
      summary: `Signs for ${topic.label}`.slice(0, 120),
      rationale: `Signs stop the same question at the source.`,
      evidence,
      dedupeKey: key,
    },
  ];
  // The notice only answers from a document; without one, people get signs and the helpdesk escalates.
  if (doc) {
    const body = words?.announcement || `About ${topic.label}: ${template}`;
    out.push({
      kind: "comms.send_announcement",
      payload: {
        title: `About ${topic.label}`.slice(0, 160),
        segment: { type: "all" },
        channels: ["in_app"],
        bodyByChannel: { in_app: body },
        category: "info",
        public: true,
      },
      summary: `Tell everyone about ${topic.label}`.slice(0, 120),
      rationale: `${n} people asked in ${CONFUSION_WINDOW_MIN} minutes; the answer is in "${doc.docTitle}".`,
      evidence: [
        ...evidence,
        ...[todays ?? doc, where]
          .filter((d): d is NonNullable<typeof d> => !!d)
          .map((d) => ({
            type: "kb" as const,
            ref: `kb:${d.docId}#${d.section}`,
            label: `${d.docTitle}: ${d.section}`.slice(0, 160),
          })),
      ],
      dedupeKey: key,
    });
  }
  return out;
}

async function queuePlan(ctx: Ctx): Promise<AgentProposal[]> {
  // Measured up to the check-in that woke Radar, not up to now: the worker may reach it minutes later.
  const now = (ctx.payload as { deviceTime?: string } | undefined)?.deviceTime ?? ctx.services.now();
  const recent = await ctx.services.checkins(minutesAgo(now, QUEUE_WINDOW_MIN));
  const spike = queueSpike(recent.filter((c) => c.serverTime <= now));
  if (!spike) return [];
  if (recentIncident(await ctx.services.incidents(), now, "queue", "registration desk")) return [];
  const key = `queue:${bucket(now, 30)}`;
  const helpers = await freeWith(ctx, "registration_desk", 2);
  const helpersToo = helpers.length < 2 ? await freeWith(ctx, "helpdesk", 2 - helpers.length) : [];
  const evidence = [
    {
      type: "metric" as const,
      ref: "live:checkins_5min",
      label: `${spike.count} check-ins in ${QUEUE_WINDOW_MIN} min`,
    },
  ];
  return [
    {
      kind: "incident.create",
      payload: {
        title: `Queue at the registration desk: ${spike.count} check-ins in ${QUEUE_WINDOW_MIN} minutes`,
        category: "queue",
        severity: "medium",
        source: "radar",
        description: `${spike.count} check-ins in the last ${QUEUE_WINDOW_MIN} minutes. One desk cannot keep up.`,
        evidenceRefs: [],
      },
      summary: `Registration desk queue (${spike.count} in ${QUEUE_WINDOW_MIN} min)`,
      rationale: `Check-ins crossed ${QUEUE_WINDOW_MIN}-minute threshold of 30.`,
      evidence,
      dedupeKey: key,
    },
    ...[...helpers, ...helpersToo].map((v): AgentProposal => ({
      kind: "crew.create_task",
      payload: {
        title: "Open a second registration desk",
        description:
          "Set up a second scanning desk next to the first and scan tickets until the queue clears.",
        assigneeVolunteerId: v.id,
        priority: "high",
      },
      summary: `${v.name} opens a second registration desk`.slice(0, 120),
      rationale: `${v.name} has the right skills and is not on a shift right now.`,
      evidence: [...evidence, { type: "row", ref: `volunteers/${v.id}`, label: v.name }],
      dedupeKey: key,
    })),
  ];
}

const Report = z.object({
  title: z.string().max(160).describe("What is wrong and where, in English"),
  description: z.string().max(600).describe("The report in plain English"),
});

async function voicePlan(ctx: Ctx, io: IO): Promise<AgentProposal[]> {
  const p = (ctx.payload ?? {}) as { transcript?: string; fromVolunteerId?: string };
  const transcript = p.transcript?.trim();
  if (!transcript) return [];
  const room = roomIn(transcript, await ctx.services.rooms());
  const { category, skill } = classify(transcript);
  const emergency = isEmergencyCategory(category);
  // Emergencies skip the model: no wording step can delay or soften the alert.
  const words =
    io && !emergency
      ? await draft(io, {
          schema: Report,
          instructions:
            "A volunteer sent a voice note (transcribed, may be Hinglish). Turn it into an incident title and description in English.",
          facts: `Room: ${room?.name ?? "not named"}. Category: ${category}.`,
          untrusted: transcript,
        })
      : null;
  const what = emergency
    ? `Emergency (${category}) reported`
    : category === "av"
      ? "AV problem"
      : "Problem reported";
  const title = words?.title || `${what}${room ? ` in ${room.name}` : ""}`;
  const key = `voice:${category}:${room?.id ?? "none"}:${bucket(ctx.services.now(), 30)}`;
  const evidence = [
    { type: "row" as const, ref: `volunteers/${p.fromVolunteerId ?? "unknown"}`, label: "Voice note" },
  ];
  const out: AgentProposal[] = [
    {
      kind: "incident.create",
      payload: {
        title: title.slice(0, 160),
        category,
        severity: emergency ? "critical" : "high",
        source: "voice_note",
        description: `${words?.description ?? "Voice note from a volunteer."}\nTranscript: ${transcript.slice(0, 1000)}`,
        ...(room ? { roomId: room.id } : {}),
        evidenceRefs: [],
      },
      summary: title.slice(0, 120),
      rationale: `Voice note from a volunteer${room ? ` about ${room.name}` : ""}.`,
      evidence,
      dedupeKey: key,
    },
  ];
  // Emergencies go to people only: the incident alerts the leads, Radar assigns nobody.
  if (emergency) return out;
  const [fixer] = await freeWith(ctx, skill, 1);
  out.push({
    kind: "crew.create_task",
    payload: {
      title: `Fix: ${title}`.slice(0, 160),
      description: transcript.slice(0, 1000),
      ...(fixer ? { assigneeVolunteerId: fixer.id } : { skill }),
      ...(room ? { roomId: room.id } : {}),
      priority: "urgent",
    },
    summary:
      `${fixer ? fixer.name : `Someone with ${skill}`} goes to ${room?.name ?? "the reported place"}`.slice(
        0,
        120,
      ),
    rationale: fixer
      ? `${fixer.name} has the ${skill} skill and is not on a shift right now.`
      : `Nobody with ${skill} is free; the task waits for the first one.`,
    evidence,
    dedupeKey: key,
  });
  return out;
}

async function plan(ctx: Ctx, io: IO): Promise<AgentProposal[]> {
  switch (ctx.trigger.eventType) {
    case "helpdesk.message":
      return confusionPlan(ctx, io);
    case "registration.checked_in":
      return queuePlan(ctx);
    case "voice_note.received":
      return voicePlan(ctx, io);
    default:
      return [];
  }
}

export const radar: AgentConfig<ReadServices> = {
  name: "radar",
  purpose: "Spots confusion spikes, queues and floor problems, and raises incidents with fixes",
  humanLeadRole: "lead",
  domain: "ops",
  modelTier: "fast",
  tools: [],
  actions: ["incident.create", "crew.create_task", "comms.send_announcement"],
  systemPrompt: () => "",
  triggers: [
    { type: "domain_event", eventType: "helpdesk.message" },
    { type: "domain_event", eventType: "registration.checked_in" },
    { type: "domain_event", eventType: "voice_note.received" },
  ],
  maxSteps: 1,
  criticality: "normal",
  pipeline: async (ctx, io) => {
    const proposals = await plan(ctx, io);
    for (const p of proposals) await ctx.propose(p);
    return { text: proposals.length ? `Proposed ${proposals.length} actions.` : "Nothing unusual." };
  },
  fallback: (ctx) => plan(ctx, null),
};
