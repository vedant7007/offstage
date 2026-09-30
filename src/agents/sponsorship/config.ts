// Sponsorship: a daily sweep of the prospect list. Code picks prospects whose follow-up is due; the model
// drafts the mail from our own facts only. Drafts go to the sponsorship lead: nothing is ever sent from here.

import { z } from "zod";
import type { SponsorProspect } from "@/contracts";
import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig, AgentProposal, PipelineIO, RunContext } from "@/agents/runtime/types";
import { draft, onlyGivenNumbers } from "@/agents/runtime/wording";
import { formatInr } from "@/lib/format";
import { formatDate } from "@/lib/time";

type Ctx = RunContext<ReadServices>;
type IO = Pick<PipelineIO, "runId" | "onAttempt" | "critical"> | null;

/** Open prospects whose follow-up time has come, most overdue first. */
export function dueFollowUps(prospects: SponsorProspect[], now: string): SponsorProspect[] {
  return prospects
    .filter((p) => p.stage !== "confirmed" && p.stage !== "declined")
    .filter((p) => p.nextFollowUpAt !== undefined && p.nextFollowUpAt <= now)
    .sort((a, b) => a.nextFollowUpAt!.localeCompare(b.nextFollowUpAt!));
}

const Mail = z.object({
  subject: z.string().max(200),
  body: z.string().max(3000).describe("The mail body without greeting or sign-off, 3 short paragraphs"),
});

async function plan(ctx: Ctx, io: IO): Promise<AgentProposal[]> {
  const now = ctx.services.now();
  const due = dueFollowUps(await ctx.services.sponsors(), now);
  if (!due.length) return [];
  const [event, regs] = await Promise.all([
    ctx.services.event(),
    ctx.services.registrations({ limit: 100_000 }),
  ]);
  const confirmed = regs.filter((r) => r.status === "confirmed").length;
  const out: AgentProposal[] = [];
  for (const p of due) {
    const ask = p.askInr ? formatInr(p.askInr) : undefined;
    const facts = [
      `Event: ${event.name}, ${formatDate(event.startsAt)} to ${formatDate(event.endsAt)}, ${event.venue.name}, ${event.venue.city}.`,
      event.tagline ? `Tagline: ${event.tagline}.` : "",
      `${confirmed} confirmed registrations.`,
      `Sponsor: ${p.name}. Stage: ${p.stage}.${p.tier ? ` Tier offered: ${p.tier}.` : ""}${ask ? ` Ask: ${ask}.` : ""}`,
      `Why they fit: ${p.fitReason}`,
    ]
      .filter(Boolean)
      .join("\n");
    const words = io
      ? await draft(io, {
          schema: Mail,
          instructions: `Write a short, warm follow-up mail from the ${event.name} organising team to ${p.name} (stage: ${p.stage}). Ask for a reply or a short call. Do not promise anything not in the facts.`,
          facts,
        })
      : null;
    const ok = words && onlyGivenNumbers(`${words.subject}\n${words.body}`, facts);
    const subject = ok ? words.subject : `${event.name}: following up`;
    const body = ok
      ? words.body
      : `Following up on our note about ${event.name} (${formatDate(event.startsAt)}, ${event.venue.city}). ${confirmed} students have confirmed so far.\n\n${p.fitReason}\n\nCould we find 15 minutes this week to talk about partnering${ask ? ` at ${ask}` : ""}?`;
    const greeting = p.contactName ? `Hi ${p.contactName},` : `Hello ${p.name} team,`;
    out.push({
      kind: "sponsor.outreach.draft",
      payload: {
        prospectId: p.id,
        subject: subject.slice(0, 200),
        body: `${greeting}\n\n${body}\n\nRegards,\nThe ${event.name} team`.slice(0, 6000),
      },
      summary: `Follow-up draft for ${p.name}`.slice(0, 120),
      rationale: `Follow-up was due ${formatDate(p.nextFollowUpAt!)}; ${p.name} is at stage "${p.stage}". Draft only: the lead reviews and sends it.`,
      evidence: [{ type: "row", ref: `sponsor_prospects/${p.id}`, label: p.name.slice(0, 160) }],
      dedupeKey: `outreach:${p.id}:${p.nextFollowUpAt}`,
    });
  }
  return out;
}

export const sponsorship: AgentConfig<ReadServices> = {
  name: "sponsorship",
  purpose: "Drafts sponsor follow-up mails when they are due. Drafts only, never sends",
  humanLeadRole: "lead",
  domain: "sponsorship",
  modelTier: "fast",
  tools: [],
  actions: ["sponsor.outreach.draft"],
  systemPrompt: () => "",
  triggers: [{ type: "schedule", name: "followups", cron: "0 10 * * *" }],
  maxSteps: 1,
  criticality: "normal",
  pipeline: async (ctx, io) => {
    const proposals = await plan(ctx, io);
    for (const p of proposals) await ctx.propose(p);
    return { text: proposals.length ? `Drafted ${proposals.length} follow-ups.` : "No follow-ups due." };
  },
  fallback: (ctx) => plan(ctx, null),
};
