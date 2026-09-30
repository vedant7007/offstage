/**
 * Real delivery allowlist. DEMO_REAL_RECIPIENTS is a comma-separated list of E.164 numbers, emails and
 * Telegram chat ids. Only these (plus Telegram chats linked to a person, see telegram.ts) ever get a
 * real message; every other outbox row goes to the mock driver.
 */
import { normaliseEmail, normalisePhone } from "@/server/pii";

export interface Allowlist {
  phones: Set<string>;
  emails: Set<string>;
  chatIds: Set<string>;
}

export function parseAllowlist(raw = process.env.DEMO_REAL_RECIPIENTS ?? ""): Allowlist {
  const list: Allowlist = { phones: new Set(), emails: new Set(), chatIds: new Set() };
  for (const entry of raw.split(",").map((s) => s.trim())) {
    if (!entry) continue;
    if (entry.includes("@")) list.emails.add(normaliseEmail(entry));
    else if (entry.startsWith("+")) {
      const p = normalisePhone(entry);
      if (p) list.phones.add(p);
    } else if (/^-?\d+$/.test(entry)) list.chatIds.add(entry);
  }
  return list;
}

/** Whether a decrypted outbox address may get a real message on this channel. */
export function isAllowed(list: Allowlist, channel: string, address: string, linkedChats: Set<string>): boolean {
  switch (channel) {
    case "email":
      return list.emails.has(normaliseEmail(address));
    case "sms":
    case "whatsapp": {
      const p = normalisePhone(address);
      return p !== null && list.phones.has(p);
    }
    case "telegram":
      return list.chatIds.has(address) || linkedChats.has(address);
    default:
      return false;
  }
}
