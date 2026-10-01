/**
 * One path into the Helpdesk for every channel (in-app chat now, Telegram and WhatsApp next).
 *
 *   1. Find or open the conversation and store the question.
 *   2. Run the Helpdesk agent inline with the text marked untrusted: the runtime screens it with
 *      the guard before any model sees it, and traces the run for the console timeline.
 *   3. A blocked input gets a calm refusal and an audit row (action `helpdesk.input_blocked`),
 *      so the console can show the attempt. An answer without a source escalates: the agent
 *      proposes `helpdesk.escalate` (T0), which the engine executes inline.
 *   4. Store the reply and return it as a ChatResult.
 *
 * The agent reads only public event data (documents, schedule, rooms, announcements), so one
 * person's question can never surface another person's record.
 * No `helpdesk.message` domain event is published: the worker would answer the same question twice.
 */
import { and, eq } from "drizzle-orm";
import { detectLanguage, type AnswerResult, type Lang } from "@/agents/helpdesk/answer";
import { helpdesk } from "@/agents/helpdesk/config";
import { runAgent } from "@/agents/runtime/run";
import type { Verdict } from "@/ai/guard";
import type { Actor, Channel, HelpdeskAnswer } from "@/contracts";
import type { ChatResult } from "@/contracts/api";
import { db } from "@/db/client";
import * as t from "@/db/schema";
import { audit } from "@/server/events/bus";
import { notFound } from "@/server/http";
import { dbGate, runtimeDepsFor } from "./agent-runtime";

export type AskerRole = "attendee" | "volunteer" | "speaker" | "public";

export interface AskInput {
  eventId: string;
  text: string;
  channel: Channel;
  askerRole: AskerRole;
  /** Who is asking, for the audit row. */
  actor: Actor;
  userId?: string;
  /** In-app: the conversation the page already has. Checked against userId and event. */
  conversationId?: string;
  /** Inbound channels: keyed hash of the chat id or phone, never the raw value. */
  externalRefHash?: string;
}

// The same wording the Helpdesk uses, for the paths where the agent returns no answer.
const BLOCKED: Record<Lang, string> = {
  en: "I can only help with questions about this event.",
  hinglish: "Main sirf is event ke baare mein sawaalon mein madad kar sakta hoon.",
  hi: "मैं केवल इस इवेंट से जुड़े सवालों में मदद कर सकता हूँ।",
};
const PASSED_ON: Record<Lang, string> = {
  en: "I'm not sure about that, I've passed it to the team. Someone will reply soon.",
  hinglish:
    "Iske baare mein mujhe pakka nahi pata, maine aapka sawaal team ko bhej diya hai. Jaldi reply aayega.",
  hi: "मुझे इसके बारे में पक्की जानकारी नहीं है, मैंने आपका सवाल टीम को भेज दिया है। जल्दी जवाब मिलेगा।",
};
const PAUSED: Record<Lang, string> = {
  en: "The helpdesk is paused right now. Please ask at the help desk near the entrance.",
  hinglish: "Helpdesk abhi band hai. Kripya entrance ke paas help desk par poochiye.",
  hi: "हेल्पडेस्क अभी बंद है। कृपया प्रवेश द्वार के पास हेल्प डेस्क पर पूछें।",
};

async function openConversation(input: AskInput): Promise<string> {
  if (input.conversationId) {
    const [c] = await db
      .select({ id: t.conversations.id, userId: t.conversations.userId })
      .from(t.conversations)
      .where(and(eq(t.conversations.id, input.conversationId), eq(t.conversations.eventId, input.eventId)));
    if (!c || c.userId !== (input.userId ?? null)) throw notFound("Conversation not found");
    return c.id;
  }
  if (input.externalRefHash) {
    const [c] = await db
      .select({ id: t.conversations.id })
      .from(t.conversations)
      .where(
        and(
          eq(t.conversations.eventId, input.eventId),
          eq(t.conversations.externalRefHash, input.externalRefHash),
          eq(t.conversations.channel, input.channel),
        ),
      )
      .limit(1);
    if (c) return c.id;
  }
  const [row] = await db
    .insert(t.conversations)
    .values({
      eventId: input.eventId,
      channel: input.channel,
      userId: input.userId ?? null,
      askerRole: input.askerRole,
      externalRefHash: input.externalRefHash ?? null,
    })
    .returning({ id: t.conversations.id });
  return row!.id;
}

const SMALL_TALK =
  /^(ok|okay|okk+|k|thanks|thank you|thank u|thx|ty|hi|hello|hey|hii+|good morning|good evening|cool|great|nice|shukriya|dhanyavaad)[\s!.?]*$/i;
export const SMALL_TALK_REPLY = "Anytime. Ask me about the schedule, food, venue or your ticket.";
export const isSmallTalk = (text: string) => SMALL_TALK.test(text.trim());

export async function askHelpdesk(input: AskInput): Promise<ChatResult> {
  const language = detectLanguage(input.text);
  const conversationId = await openConversation(input);
  const [question] = await db
    .insert(t.messages)
    .values({ eventId: input.eventId, conversationId, role: "user", body: input.text, language })
    .returning({ id: t.messages.id });
  const messageId = question!.id;

  let answer: HelpdeskAnswer;
  let blocked = false;
  let guard: Verdict | undefined;

  const gate = dbGate();
  const open = (await gate.enabled(input.eventId, "helpdesk")) && !(await gate.killSwitch(input.eventId));
  if (!open) {
    answer = { answer: PAUSED[language], citations: [], confidence: 0, needsEscalation: false, language };
  } else if (isSmallTalk(input.text)) {
    // Thanks, hi, ok: a short reply, never a model call or an escalation.
    answer = { answer: SMALL_TALK_REPLY, citations: [], confidence: 1, needsEscalation: false, language };
  } else {
    const deps = runtimeDepsFor(input.eventId);
    // Keep the guard verdict the runtime records, for the message row and the audit entry.
    const addStep = deps.trace.addStep.bind(deps.trace);
    deps.trace.addStep = (runId, index, step) => {
      if (step.kind === "guard") guard = step as unknown as Verdict;
      return addStep(runId, index, step);
    };
    const run = await runAgent(
      helpdesk,
      { type: "domain_event", eventType: "helpdesk.message", ref: messageId },
      {
        eventId: input.eventId,
        payload: { conversationId, messageId, text: input.text, askerRole: input.askerRole },
        untrusted: true,
      },
      deps,
    );
    const out = run.output as AnswerResult | undefined;
    if (run.status === "blocked" || out?.blocked) {
      blocked = true;
      guard ??= out?.guard;
      answer = { answer: BLOCKED[language], citations: [], confidence: 1, needsEscalation: false, language };
      await audit(db, {
        eventId: input.eventId,
        actor: input.actor,
        action: "helpdesk.input_blocked",
        entity: "messages",
        entityId: messageId,
        after: {
          channel: input.channel,
          runId: run.runId,
          reasons: guard?.reasons ?? [],
          score: guard?.score ?? null,
          by: guard?.by ?? null,
          excerpt: input.text.slice(0, 200),
        },
      });
    } else if (out) {
      answer = out.answer;
    } else {
      // Models down: the fallback escalated, so say so honestly.
      answer = { answer: PASSED_ON[language], citations: [], confidence: 0, needsEscalation: true, language };
    }
  }

  const [asked] = await db
    .select({ escalationId: t.messages.escalationId })
    .from(t.messages)
    .where(eq(t.messages.id, messageId));
  await db
    .update(t.messages)
    .set({ guard: guard?.verdict ?? null, guardScore: guard?.score ?? null })
    .where(eq(t.messages.id, messageId));
  const [reply] = await db
    .insert(t.messages)
    .values({
      eventId: input.eventId,
      conversationId,
      role: "assistant",
      body: answer.answer,
      citations: answer.citations,
      confidence: answer.confidence,
      escalationId: asked?.escalationId ?? null,
      language: answer.language ?? language,
    })
    .returning({ id: t.messages.id });

  return {
    conversationId,
    messageId: reply!.id,
    answer,
    escalationId: asked?.escalationId ?? undefined,
    blocked,
  };
}
