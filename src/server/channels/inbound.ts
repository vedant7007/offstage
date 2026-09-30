/**
 * Inbound helpdesk questions from Telegram and WhatsApp. Same path as the in-app chat
 * (askHelpdesk: guard first, citations or escalation), with the text treated as untrusted.
 *
 * Only known senders get a helpdesk answer: a person found by phone (a registration or a
 * volunteer), a linked Telegram chat, or an allowlisted number (DEMO_REAL_RECIPIENTS). Everyone
 * else gets nothing from the model, so strangers cannot spend the budget or probe the event.
 */
import { and, asc, eq, inArray } from "drizzle-orm";
import type { SystemActor } from "@/contracts";
import type { ChatResult } from "@/contracts/api";
import { db } from "@/db/client";
import * as t from "@/db/schema";
import { consume } from "@/server/rate-limit";
import { askHelpdesk, type AskerRole } from "@/server/services/helpdesk-chat";

export interface Sender {
  eventId: string;
  askerRole: AskerRole;
  userId?: string;
}

const SYSTEM: SystemActor = { kind: "system" };

/** The event an allowlisted team phone asks about when it is on no registration: the live one. */
async function defaultEventId(): Promise<string | null> {
  const rows = await db
    .select({ id: t.events.id, status: t.events.status })
    .from(t.events)
    .where(inArray(t.events.status, ["live", "planning"]))
    .orderBy(asc(t.events.startsAt));
  return (rows.find((r) => r.status === "live") ?? rows[0])?.id ?? null;
}

/** A registration or volunteer with this phone hash, newest event first. */
export async function senderByPhoneHash(phoneHash: string): Promise<Sender | null> {
  const [reg] = await db
    .select({ eventId: t.registrations.eventId, userId: t.registrations.userId })
    .from(t.registrations)
    .where(
      and(
        eq(t.registrations.phoneHash, phoneHash),
        inArray(t.registrations.status, ["confirmed", "waitlisted"]),
      ),
    )
    .limit(1);
  if (reg) return { eventId: reg.eventId, askerRole: "attendee", userId: reg.userId ?? undefined };
  const [vol] = await db
    .select({ eventId: t.volunteers.eventId, userId: t.volunteers.userId })
    .from(t.volunteers)
    .where(eq(t.volunteers.phoneHash, phoneHash))
    .limit(1);
  return vol ? { eventId: vol.eventId, askerRole: "volunteer", userId: vol.userId ?? undefined } : null;
}

/** Sender for a phone that is not on any record but is on the allowlist. */
export async function allowlistedSender(): Promise<Sender | null> {
  const eventId = await defaultEventId();
  return eventId ? { eventId, askerRole: "attendee" } : null;
}

/** Sender behind a linked Telegram chat. */
export async function senderByTelegramLink(chatIdHash: string): Promise<Sender | null> {
  const [link] = await db.select().from(t.telegramLinks).where(eq(t.telegramLinks.chatIdHash, chatIdHash));
  if (!link) return null;
  if (link.recipientType === "registration" && link.recipientId) {
    const [r] = await db
      .select({ eventId: t.registrations.eventId, userId: t.registrations.userId })
      .from(t.registrations)
      .where(eq(t.registrations.id, link.recipientId));
    if (r) return { eventId: r.eventId, askerRole: "attendee", userId: r.userId ?? undefined };
  }
  if (link.recipientType === "volunteer" && link.recipientId) {
    const [v] = await db
      .select({ eventId: t.volunteers.eventId, userId: t.volunteers.userId })
      .from(t.volunteers)
      .where(eq(t.volunteers.id, link.recipientId));
    if (v) return { eventId: v.eventId, askerRole: "volunteer", userId: v.userId ?? undefined };
  }
  // Linked through the allowlist before any record had the number.
  return (link.phoneHash ? await senderByPhoneHash(link.phoneHash) : null) ?? (await allowlistedSender());
}

const LIMITED = "You have asked a lot of questions in a short time. Please wait a few minutes.";

/** Answer one inbound message and return the text to send back on the same channel. */
export async function answerInbound(input: {
  channel: "telegram" | "whatsapp";
  sender: Sender;
  /** Keyed hash of the chat id or phone: one conversation per sender, never the raw value. */
  refHash: string;
  text: string;
}): Promise<{ reply: string; result?: ChatResult }> {
  const limit = await consume(`inbound:${input.channel}:${input.refHash}`, 10, 600);
  if (!limit.ok) return { reply: LIMITED };
  const result = await askHelpdesk({
    eventId: input.sender.eventId,
    text: input.text.slice(0, 1000),
    channel: input.channel,
    askerRole: input.sender.askerRole,
    actor: SYSTEM,
    userId: input.sender.userId,
    externalRefHash: input.refHash,
  });
  return { reply: formatReply(result), result };
}

/** Plain text for a chat app: the answer, its sources, and the reference when it was passed on. */
export function formatReply(r: ChatResult): string {
  const lines = [r.answer.answer];
  if (r.answer.citations.length)
    lines.push("", `Sources: ${r.answer.citations.map((c) => c.label).join("; ")}`);
  if (r.escalationId) lines.push("", `Reference ${r.escalationId.slice(0, 8).toUpperCase()}`);
  lines.push("", "Answered by the event assistant.");
  return lines.join("\n").slice(0, 1500);
}
