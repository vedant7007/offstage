// Planner: a daily look at the timeline. Code finds overdue and at-risk milestones (IST dates) and notes them
// on the milestone for its owner; a critical milestone that is overdue also raises an incident. Once per
// milestone, state and due date, however often it runs. Rules only: the notes are templates.

import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig, AgentProposal, RunContext } from "@/agents/runtime/types";
import { formatDate, istDateKey } from "@/lib/time";
import { milestoneRisks } from "./logic";

type Ctx = RunContext<ReadServices>;

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

async function plan(ctx: Ctx): Promise<AgentProposal[]> {
  const today = istDateKey(ctx.services.now());
  const risks = milestoneRisks(await ctx.services.milestones(), today);
  const out: AgentProposal[] = [];
  for (const { milestone: m, state, days } of risks) {
    const due = formatDate(`${m.dueOn}T12:00:00+05:30`);
    const note =
      state === "overdue"
        ? `Overdue by ${plural(days, "day")} (due ${due}). Owner (${m.ownerRole}, ${m.domain}): finish it or set a new date.`
        : m.status === "blocked"
          ? `Blocked with ${plural(days, "day")} to go (due ${due}). Owner: clear the blocker or move the date.`
          : `Not started and due in ${plural(days, "day")} (${due}). Owner: start it today.`;
    const evidence = [{ type: "row" as const, ref: `milestones/${m.id}`, label: m.title.slice(0, 160) }];
    out.push({
      kind: "plan.milestone.update",
      payload: { milestoneId: m.id, notes: note },
      summary: `${state === "overdue" ? "Overdue" : "At risk"}: ${m.title}`.slice(0, 120),
      rationale: note,
      evidence,
      dedupeKey: `milestone:${m.id}:${state}:${m.dueOn}`,
    });
    if (state === "overdue" && m.critical)
      out.push({
        kind: "incident.create",
        payload: {
          title: `Critical milestone overdue: ${m.title}`.slice(0, 160),
          category: "system",
          severity: "high",
          source: "system",
          description: `"${m.title}" was due ${due} and is ${m.status.replace(/_/g, " ")}. It is marked critical.`,
          evidenceRefs: [`row:milestones/${m.id}`],
        },
        summary: `Critical milestone overdue: ${m.title}`.slice(0, 120),
        rationale: "Critical milestones raise an incident when they go overdue.",
        evidence,
        dedupeKey: `milestone-incident:${m.id}:${m.dueOn}`,
      });
  }
  return out;
}

export const planner: AgentConfig<ReadServices> = {
  name: "planner",
  purpose: "Watches the timeline and flags overdue and at-risk milestones to their owners",
  humanLeadRole: "owner",
  domain: "planning",
  modelTier: "fast",
  tools: [],
  actions: ["plan.milestone.update", "incident.create"],
  systemPrompt: () => "",
  triggers: [{ type: "schedule", name: "milestones", cron: "0 9 * * *" }],
  maxSteps: 1,
  criticality: "normal",
  pipeline: async (ctx) => {
    const proposals = await plan(ctx);
    for (const p of proposals) await ctx.propose(p);
    return { text: proposals.length ? `Proposed ${proposals.length} actions.` : "Timeline on track." };
  },
  fallback: plan,
};
