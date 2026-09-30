// Speaker Liaison: every hour, confirmed speakers who have not sent their requirements (AV, travel, stay)
// and speak within 48 hours get a reminder schedule. Rules only, and only the roster (never contact details).

import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig, AgentProposal, RunContext } from "@/agents/runtime/types";
import { formatDateTime } from "@/lib/time";
import { WINDOW_HOURS, pendingRequirements } from "./logic";

type Ctx = RunContext<ReadServices>;

async function plan(ctx: Ctx): Promise<AgentProposal[]> {
  const [roster, sessions] = await Promise.all([ctx.services.speakerRoster(), ctx.services.sessions()]);
  return pendingRequirements(roster, sessions, ctx.services.now()).map(
    ({ speaker, session, offsetsMinutes }): AgentProposal => ({
      kind: "speaker.reminder.schedule",
      payload: { speakerId: speaker.id, sessionId: session.id, offsetsMinutes, channels: ["email"] },
      summary: `Remind ${speaker.name} to send requirements`.slice(0, 120),
      rationale: `${speaker.name} is confirmed for "${session.title}" at ${formatDateTime(session.startsAt)}, within ${WINDOW_HOURS} hours, and has not sent AV, travel or stay requirements.`,
      evidence: [
        { type: "row", ref: `speakers/${speaker.id}`, label: speaker.name.slice(0, 160) },
        { type: "row", ref: `sessions/${session.id}`, label: session.title.slice(0, 160) },
      ],
      dedupeKey: `speaker-reminder:${speaker.id}:${session.id}:${session.startsAt}`,
    }),
  );
}

export const speakerLiaison: AgentConfig<ReadServices> = {
  name: "speaker_liaison",
  purpose: "Reminds confirmed speakers to send their requirements before their session",
  humanLeadRole: "lead",
  domain: "speakers",
  modelTier: "fast",
  tools: [],
  actions: ["speaker.reminder.schedule"],
  systemPrompt: () => "",
  triggers: [{ type: "schedule", name: "requirements", cron: "0 * * * *" }],
  maxSteps: 1,
  criticality: "normal",
  pipeline: async (ctx) => {
    const proposals = await plan(ctx);
    for (const p of proposals) await ctx.propose(p);
    return { text: proposals.length ? `Scheduled ${proposals.length} reminders.` : "All speakers ready." };
  },
  fallback: plan,
};
