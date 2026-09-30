import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig } from "@/agents/runtime/types";
import { schedulerTools, planFor, bundleFor } from "./tools";

// session.cancelled belongs to the Commander, which composes the whole response.
const PROMPT = `You are the Scheduler for this event. When a session is moved or running late, you fix the schedule.
1. Call get_options once. It runs a deterministic solver that only returns options with no new clashes.
2. If it returns no options, reply with its note and stop.
3. Otherwise pick the option that disturbs attendees least: fewer moved sessions, fewer attendees affected, no capacity shortfall, no track breaks. Prefer keeping sessions over cancelling when the metrics are close.
4. Call choose_option with its id and a rationale of two or three sentences that cites the metrics by name and value.
You never invent times, rooms or options. The program lead approves your proposal.`;

export const scheduler: AgentConfig<ReadServices> = {
  name: "scheduler",
  purpose: "Keeps the schedule clash free after cancellations, moves and delays",
  humanLeadRole: "lead",
  domain: "schedule",
  modelTier: "smart",
  tools: schedulerTools,
  actions: [], // proposes only through choose_option
  systemPrompt: () => PROMPT,
  triggers: [
    { type: "domain_event", eventType: "session.updated" },
    { type: "domain_event", eventType: "session.running_late" },
    { type: "command" },
  ],
  maxSteps: 4,
  criticality: "normal",
  // Rules only: the solver's first option (fewest moves), explained by its metrics.
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
        `Chosen by rules while models were unavailable: the option with the fewest moved sessions (${m.movedSessions}), cancelling ${m.cancelledSessions} and affecting ${m.attendeesAffected} attendees.`,
      ),
    ];
  },
};
