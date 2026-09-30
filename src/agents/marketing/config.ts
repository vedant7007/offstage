// Marketing: a daily funnel check. When registrations are 20% or more behind the day's target, code works
// out which colleges and departments are thin and suggests where to push; the model writes one post draft
// from event facts. Drafts only: the marketing lead posts.

import { z } from "zod";
import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig, AgentProposal, PipelineIO, RunContext } from "@/agents/runtime/types";
import { draft, onlyGivenNumbers } from "@/agents/runtime/wording";
import { formatPercent } from "@/lib/format";
import { formatDate } from "@/lib/time";
import { BEHIND_RATIO, latestGap, underRepresented } from "./logic";

type Ctx = RunContext<ReadServices>;
type IO = Pick<PipelineIO, "runId" | "onAttempt" | "critical"> | null;

const Post = z.object({
  body: z.string().max(1200).describe("An Instagram caption, 3 to 5 short lines, no hashtags"),
});

async function plan(ctx: Ctx, io: IO): Promise<AgentProposal[]> {
  const [event, { funnel }] = await Promise.all([ctx.services.event(), ctx.services.marketing()]);
  if (ctx.services.now() >= event.endsAt) return [];
  const gap = latestGap(funnel);
  if (!gap || gap.behind < BEHIND_RATIO) return [];
  const { snapshot: s } = gap;
  const regs = await ctx.services.registrations({ limit: 100_000 });
  const pct = formatPercent(gap.behind);
  const thin = [
    ...underRepresented(regs, "college", 3).map((g) => ({
      ...g,
      action: "Ask the student coordinator to share the registration link",
    })),
    ...underRepresented(regs, "department", 2).map((g) => ({
      ...g,
      action: "Get department class groups to share the post",
    })),
  ];
  const evidence = [
    {
      type: "metric" as const,
      ref: `live:funnel/${s.date}`,
      label: `${s.registrations} of ${s.target} target on ${formatDate(`${s.date}T12:00:00+05:30`)}`,
    },
  ];
  const out: AgentProposal[] = [];
  if (thin.length)
    out.push({
      kind: "marketing.push.suggest",
      payload: {
        target: s.target,
        actual: s.registrations,
        suggestions: thin.map((g) => ({
          action: g.action,
          segment: g.name.slice(0, 200),
          reason: `${g.count} registrations, ${formatPercent(g.share)} of the total.`,
        })),
      },
      summary: `${pct} behind target: push ${thin.length} groups`.slice(0, 120),
      rationale: `${s.registrations} registrations against a target of ${s.target}, ${pct} behind. These groups have fewer than an equal share.`,
      evidence,
      dedupeKey: `push:${s.date}`,
    });

  const facts = [
    `Event: ${event.name}${event.tagline ? `, "${event.tagline}"` : ""}.`,
    `When: ${formatDate(event.startsAt)} to ${formatDate(event.endsAt)}. Where: ${event.venue.name}, ${event.venue.city}.`,
    `Registration is open.`,
    event.description.slice(0, 600),
  ].join("\n");
  const words = io
    ? await draft(io, {
        schema: Post,
        instructions: `Write an upbeat Instagram caption that gets students to register for ${event.name}. End with a call to register.`,
        facts,
      })
    : null;
  const body =
    words && onlyGivenNumbers(words.body, facts)
      ? words.body
      : `${event.name} is on ${formatDate(event.startsAt)} at ${event.venue.name}, ${event.venue.city}.${event.tagline ? `\n${event.tagline}` : ""}\nRegistration is open. Grab your spot today.`;
  const hashtags = [event.slug, event.type].map((t) => `#${t.replace(/[^a-z0-9]/gi, "")}`);
  out.push({
    kind: "marketing.post.draft",
    payload: { platform: "instagram", body, hashtags },
    summary: `Instagram post to lift registrations (${pct} behind)`.slice(0, 120),
    rationale: `Registrations are ${pct} behind the day's target. A fresh post goes out with the push.`,
    evidence,
    dedupeKey: `post:${s.date}`,
  });
  return out;
}

export const marketing: AgentConfig<ReadServices> = {
  name: "marketing",
  purpose: "Checks the registration funnel against target and suggests where to push. Drafts only",
  humanLeadRole: "lead",
  domain: "marketing",
  modelTier: "fast",
  tools: [],
  actions: ["marketing.push.suggest", "marketing.post.draft"],
  systemPrompt: () => "",
  triggers: [{ type: "schedule", name: "funnel", cron: "0 11 * * *" }],
  maxSteps: 1,
  criticality: "normal",
  pipeline: async (ctx, io) => {
    const proposals = await plan(ctx, io);
    for (const p of proposals) await ctx.propose(p);
    return { text: proposals.length ? `Proposed ${proposals.length} actions.` : "Funnel on target." };
  },
  fallback: (ctx) => plan(ctx, null),
};
