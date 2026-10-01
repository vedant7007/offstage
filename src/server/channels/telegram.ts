/**
 * Telegram bot: sending, and linking chats to people. A person links by sending /start and sharing
 * their phone (Telegram's contact button, so the number is the account's own), or by opening
 * t.me/<bot>?start=<code> with their link code. Any other text from a linked chat is a helpdesk question
 * (see inbound.ts), answered in the same chat. Updates arrive by long polling from the worker, so no
 * public webhook is needed.
 */
import { eq } from "drizzle-orm";
import type { Db } from "@/db/client";
import type { Tx } from "@/server/actions/types";
import * as t from "@/db/schema";
import type { Logger } from "pino";
import { parseAllowlist } from "@/server/channels/allowlist";
import { recordTelegramConflict } from "@/server/heartbeat";
import { decrypt, encrypt, lookupHash, normalisePhone, phoneHash } from "@/server/pii";
import { allowlistedSender, answerInbound, senderByTelegramLink } from "@/server/channels/inbound";

const api = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

async function call<T>(method: string, body: unknown, timeoutMs = 15_000): Promise<T> {
  const res = await fetch(api(method), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean; result?: T; error_code?: number };
  if (!data.ok) throw new Error(`telegram ${method} ${data.error_code ?? res.status}`);
  return data.result as T;
}

export async function sendTelegram(chatId: string, text: string): Promise<{ providerId: string }> {
  const msg = await call<{ message_id: number }>("sendMessage", { chat_id: chatId, text });
  return { providerId: String(msg.message_id) };
}

/** Code for t.me/<bot>?start=<code>, shown to a person so they can link without sharing their phone. */
export const telegramLinkCode = (recipientId: string) => lookupHash(`tg:${recipientId}`).slice(0, 16);

const chatHash = (chatId: string) => lookupHash(`tg-chat:${chatId}`);

/** Chat ids linked to a person. These count as allowlisted for real Telegram delivery. */
export async function linkedChatIds(db: Db): Promise<Set<string>> {
  const rows = await db.select({ enc: t.telegramLinks.chatIdEnc }).from(t.telegramLinks);
  return new Set(rows.map((r) => decrypt(r.enc)));
}

/** Link lookups for the comms executor: chat address by recipient id and by phone hash. */
export async function telegramLinkIndex(db: Tx) {
  const rows = await db.select().from(t.telegramLinks);
  return {
    byRecipient: new Map(rows.filter((r) => r.recipientId).map((r) => [r.recipientId!, r.chatIdEnc])),
    byPhone: new Map(rows.filter((r) => r.phoneHash).map((r) => [r.phoneHash!, r.chatIdEnc])),
  };
}

type Person = { type: "registration" | "volunteer"; id: string; phoneHash: string | null };
type LinkTarget = Person | { type: null; id: null; phoneHash: string | null };

async function personByPhone(db: Db, hash: string): Promise<Person | null> {
  const [reg] = await db
    .select({ id: t.registrations.id })
    .from(t.registrations)
    .where(eq(t.registrations.phoneHash, hash))
    .limit(1);
  if (reg) return { type: "registration", id: reg.id, phoneHash: hash };
  const [vol] = await db
    .select({ id: t.volunteers.id })
    .from(t.volunteers)
    .where(eq(t.volunteers.phoneHash, hash))
    .limit(1);
  return vol ? { type: "volunteer", id: vol.id, phoneHash: hash } : null;
}

// ponytail: scans every registration and volunteer id per link code (a few thousand HMACs, well
// under 50 ms); store the code on the row if events grow past ~100k people.
async function personByCode(db: Db, code: string): Promise<Person | null> {
  const regs = await db
    .select({ id: t.registrations.id, phoneHash: t.registrations.phoneHash })
    .from(t.registrations);
  const reg = regs.find((r) => telegramLinkCode(r.id) === code);
  if (reg) return { type: "registration", ...reg };
  const vols = await db.select({ id: t.volunteers.id, phoneHash: t.volunteers.phoneHash }).from(t.volunteers);
  const vol = vols.find((v) => telegramLinkCode(v.id) === code);
  return vol ? { type: "volunteer", ...vol } : null;
}

async function link(db: Db, chatId: string, person: LinkTarget) {
  const row = {
    chatIdHash: chatHash(chatId),
    chatIdEnc: encrypt(chatId),
    phoneHash: person.phoneHash,
    recipientType: person.type,
    recipientId: person.id,
  };
  await db
    .insert(t.telegramLinks)
    .values(row)
    .onConflictDoUpdate({ target: t.telegramLinks.chatIdHash, set: row });
}

interface Update {
  update_id: number;
  message?: {
    chat: { id: number; type: string };
    from?: { id: number };
    text?: string;
    contact?: { phone_number: string; user_id?: number };
  };
}

const LINKED = "You're linked. Event updates will reach you here.";
const ASK_PHONE = {
  text: "Hi! To get event updates here, share the phone number you registered with.",
  reply_markup: {
    keyboard: [[{ text: "Share my phone number", request_contact: true }]],
    one_time_keyboard: true,
    resize_keyboard: true,
  },
};

export async function handleUpdate(db: Db, u: Update, log: Logger): Promise<void> {
  const m = u.message;
  if (!m || m.chat.type !== "private") return;
  const chatId = String(m.chat.id);
  const reply = (body: object) => call("sendMessage", { chat_id: chatId, ...body });

  if (m.contact) {
    // Only the account's own number, not a forwarded contact card.
    if (m.contact.user_id !== m.from?.id)
      return void (await reply({ text: "Please share your own number." }));
    const p = m.contact.phone_number;
    const e164 = normalisePhone(p.startsWith("+") ? p : `+${p}`);
    const hash = e164 ? phoneHash(e164) : null;
    const inAllowlist = e164 ? parseAllowlist().phones.has(e164) : false;
    // A team phone links even before the seed has put it on a registration; sends match links by phone hash.
    const person =
      (hash ? await personByPhone(db, hash) : null) ??
      (inAllowlist ? { type: null, id: null, phoneHash: hash } : null);
    if (!person) {
      // No number in the log, only why it did not match.
      log.info({ matched: false, normalised: Boolean(e164), inAllowlist }, "telegram link by phone");
      return void (await reply({ text: "I couldn't find a registration with that number." }));
    }
    await link(db, chatId, person);
    log.info({ matched: true, via: "phone", type: person.type ?? "allowlist" }, "telegram link");
    return void (await reply({ text: LINKED, reply_markup: { remove_keyboard: true } }));
  }

  const start = /^\/start(?:\s+([A-Za-z0-9_-]{1,64}))?/.exec(m.text ?? "");
  if (!start) {
    const text = m.text?.trim();
    if (!text || text.startsWith("/")) return;
    // A question for the helpdesk. Only linked or allowlisted chats get an answer.
    const hash = chatHash(chatId);
    const sender =
      (await senderByTelegramLink(hash)) ??
      (parseAllowlist().chatIds.has(chatId) ? await allowlistedSender() : null);
    if (!sender) return void (await reply(ASK_PHONE));
    await call("sendChatAction", { chat_id: chatId, action: "typing" }).catch(() => undefined);
    const { reply: answer, result } = await answerInbound({
      channel: "telegram",
      sender,
      refHash: hash,
      text,
    });
    log.info({ blocked: result?.blocked, escalated: Boolean(result?.escalationId) }, "telegram helpdesk");
    return void (await reply({ text: answer }));
  }
  const person = start[1] ? await personByCode(db, start[1]) : null;
  if (person) {
    await link(db, chatId, person);
    log.info({ matched: true, via: "code", type: person.type }, "telegram link");
    return void (await reply({ text: LINKED }));
  }
  await reply(ASK_PHONE);
}

/** Long-polls getUpdates until the signal aborts. */
export async function pollTelegram(db: Db, log: Logger, signal: AbortSignal): Promise<void> {
  let offset = 0;
  while (!signal.aborted) {
    try {
      const updates = await call<Update[]>(
        "getUpdates",
        { offset, timeout: 25, allowed_updates: ["message"] },
        35_000,
      );
      for (const u of updates) {
        offset = u.update_id + 1;
        await handleUpdate(db, u, log).catch((err: unknown) => log.error({ err }, "telegram update failed"));
      }
    } catch (err) {
      if (signal.aborted) return;
      // 409: another poller holds the bot. Recorded for pnpm demo:preflight.
      if (String(err).includes("getUpdates 409")) await recordTelegramConflict(db).catch(() => undefined);
      log.warn({ err: String(err) }, "telegram poll failed, retrying in 5 s");
      await new Promise((r) => setTimeout(r, 5_000));
    }
  }
}
