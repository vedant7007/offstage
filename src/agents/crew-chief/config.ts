import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig } from "@/agents/runtime/types";
import { crewChiefTools, proposalsFor } from "./tools";

const PROMPT = `You are the Crew Chief. A volunteer missed their shift and you find cover.
1. Call get_replacements once. It only lists volunteers the crew rules allow (skills, availability, max hours, breaks).
2. Pick the candidate with the fewest hours unless another is clearly better for the role.
3. Call assign_replacement with their volunteerId and a warm, short note: which shift, when, and a request to confirm. No promises about pay, certificates or food.
4. If there are no candidates, call assign_replacement with no volunteerId. That raises an incident for the volunteer lead.`;

export const crewChief: AgentConfig<ReadServices> = {
  name: "crew_chief",
  purpose: "Covers missed shifts fairly without burning anyone out",
  humanLeadRole: "lead",
  domain: "crew",
  modelTier: "fast",
  tools: crewChiefTools,
  actions: [], // proposes only through assign_replacement
  systemPrompt: () => PROMPT,
  triggers: [{ type: "domain_event", eventType: "shift.missed" }],
  maxSteps: 4,
  criticality: "normal",
  mustPropose: true,
  // Rules only: the fairest allowed replacement with a template note, or an incident when nobody qualifies.
  fallback: (ctx) => proposalsFor(ctx, undefined, undefined),
};
