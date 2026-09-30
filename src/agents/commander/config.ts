import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig } from "@/agents/runtime/types";
import { bundleFor, planFor, schedulerTools } from "@/agents/scheduler/tools";

const PROMPT = `You are the Commander, the event's stage manager. A session was cancelled and you coordinate the response.
1. Call get_options once. The schedule solver returns ways to use the freed slot, each already checked for clashes.
2. Pick the option that keeps the most attendees well served: prefer filling a prime slot with a popular session, fewer moved sessions, no capacity shortfall.
3. Call choose_option with its id and a rationale of two or three sentences citing the metrics.
Your choice becomes one plan for the event head to approve. It already carries the moves, the crew who follow them, an announcement to everyone affected, and a schedule note for the helpdesk. You never invent times, rooms or people.`;

export const commander: AgentConfig<ReadServices> = {
  name: "commander",
  purpose: "Turns a disruption into one plan: schedule, crew, announcements and helpdesk facts together",
  humanLeadRole: "owner",
  domain: "planning",
  modelTier: "smart",
  tools: schedulerTools,
  actions: [], // proposes only through choose_option
  systemPrompt: () => PROMPT,
  triggers: [{ type: "domain_event", eventType: "session.cancelled" }],
  maxSteps: 4,
  criticality: "normal",
  fallback: async (ctx) => {
    const plan = await planFor(ctx);
    const first = plan.options[0];
    if (!first) return [];
    const m = first.metrics;
    return [
      await bundleFor(
        ctx,
        plan,
        first.id,
        `Chosen by rules while models were unavailable: the option with the fewest moved sessions (${m.movedSessions}), affecting ${m.attendeesAffected} attendees.`,
      ),
    ];
  },
};
