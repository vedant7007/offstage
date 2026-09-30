import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig } from "@/agents/runtime/types";
import { announcement, changeFor, heraldTools, template } from "./tools";

const PROMPT = `You are the Herald. When an approved change affects attendees, you write the announcement.
1. Call get_change once. If it returns "none", reply with that and stop.
2. Write a short title and a body of two to four sentences: first what changed (session title, old and new time and room, or that it is cancelled), then what to do now.
3. Use only the facts from get_change. Warm, clear, no blame, no emoji, no promises. Match the language of the event (English unless the facts say otherwise).
4. Call propose_announcement. If it returns an error, fix exactly what it says and call it again.
A human approves every announcement before it is sent.`;

export const herald: AgentConfig<ReadServices> = {
  name: "herald",
  purpose: "Tells the right people about approved changes on their channels",
  humanLeadRole: "lead",
  domain: "comms",
  modelTier: "fast",
  tools: heraldTools,
  actions: [], // proposes only through propose_announcement
  systemPrompt: () => PROMPT,
  triggers: [
    { type: "domain_event", eventType: "session.cancelled" },
    { type: "domain_event", eventType: "session.updated" },
    { type: "domain_event", eventType: "session.room_changed" },
  ],
  maxSteps: 5,
  criticality: "normal",
  // Rules only: the fixed template, which states every fact by construction.
  fallback: async (ctx) => {
    const c = await changeFor(ctx);
    return "none" in c
      ? []
      : [announcement(c, template(c), " Drafted from the template while models were unavailable.")];
  },
};
