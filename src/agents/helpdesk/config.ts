import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig, AgentProposal } from "@/agents/runtime/types";
import { answerQuestion } from "./answer";

type Message = { conversationId: string; messageId: string; text: string; askerRole: string };

function escalation(m: Message, summary: string, suggestedReply?: string): AgentProposal {
  return {
    kind: "helpdesk.escalate",
    payload: {
      conversationId: m.conversationId,
      messageId: m.messageId,
      summary,
      suggestedReply,
      priority: "normal",
    },
    summary: `Question for the team: ${summary}`.slice(0, 120),
    rationale:
      "The helpdesk could not answer from the event documents or live facts, so a person should reply.",
    evidence: [{ type: "row", ref: `messages/${m.messageId}`, label: "Attendee question" }],
  };
}

export const helpdesk: AgentConfig<ReadServices> = {
  name: "helpdesk",
  purpose: "Answers attendee questions with citations, or passes them to a person",
  humanLeadRole: "lead",
  domain: "helpdesk",
  modelTier: "fast",
  tools: [],
  actions: [],
  systemPrompt: () => "",
  triggers: [{ type: "domain_event", eventType: "helpdesk.message" }],
  maxSteps: 1,
  criticality: "critical",
  pipeline: async (ctx, io) => {
    const m = ctx.payload as Message;
    const res = await answerQuestion({
      question: m.text,
      services: ctx.services,
      runId: io.runId,
      onAttempt: io.onAttempt,
      screened: io.guard,
    });
    if (res.answer.needsEscalation)
      await ctx.propose(escalation(m, res.answer.escalationSummary ?? m.text.slice(0, 600)));
    return { text: res.answer.answer, output: res };
  },
  // Models down: escalate so a person answers. Cached FAQ answers still come back from answerQuestion's cache.
  fallback: async (ctx) => {
    const m = ctx.payload as Message;
    return [escalation(m, m.text.slice(0, 600))];
  },
};
