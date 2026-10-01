import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Twilio Messages API for WhatsApp (sandbox) and SMS. Callers must check the allowlist first: trial
 * accounts can only reach verified numbers, and we never send outside DEMO_REAL_RECIPIENTS anyway.
 */
export async function sendTwilio(
  channel: "whatsapp" | "sms",
  to: string,
  body: string,
): Promise<{ providerId: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const rawFrom = channel === "whatsapp" ? process.env.TWILIO_WHATSAPP_FROM : process.env.TWILIO_SMS_FROM;
  if (!sid || !token || !rawFrom) throw new Error(`Twilio ${channel} is not configured`);
  const wa = (n: string) => (n.startsWith("whatsapp:") ? n : `whatsapp:${n}`);
  const from = channel === "whatsapp" ? wa(rawFrom) : rawFrom;
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}`,
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: from, To: channel === "whatsapp" ? wa(to) : to, Body: body }),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { sid?: string; code?: number; message?: string };
  // Twilio error messages can echo the number, so keep only the code.
  if (!res.ok || !data.sid) throw new Error(`twilio ${res.status} code ${data.code ?? "unknown"}`);
  return { providerId: data.sid };
}

/** Final or current delivery state of an accepted message. Error codes are Twilio's, such as 63015. */
export async function twilioStatus(sid: string): Promise<{ status: string; errorCode: number | null }> {
  const account = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!account || !token) throw new Error("Twilio is not configured");
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${account}/Messages/${sid}.json`, {
    headers: { authorization: `Basic ${Buffer.from(`${account}:${token}`).toString("base64")}` },
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { status?: string; error_code?: number | null };
  if (!res.ok || !data.status) throw new Error(`twilio status ${res.status}`);
  return { status: data.status, errorCode: data.error_code ?? null };
}

/**
 * Twilio request signature (X-Twilio-Signature): base64 HMAC-SHA1, keyed with the auth token, over
 * the full public URL Twilio called followed by every POST parameter as name+value, sorted by name.
 * https://www.twilio.com/docs/usage/webhooks/webhooks-security
 */
export function validTwilioSignature(
  signature: string | null,
  url: string,
  params: URLSearchParams,
  token = process.env.TWILIO_AUTH_TOKEN,
): boolean {
  if (!signature || !token) return false;
  const data = [...new Set(params.keys())].sort().reduce(
    (acc, k) =>
      acc +
      params
        .getAll(k)
        .map((v) => k + v)
        .join(""),
    url,
  );
  const expected = createHmac("sha1", token).update(data, "utf8").digest("base64");
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

const twilioAuth = () => {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  return sid && token ? { sid, header: `Basic ${Buffer.from(`${sid}:${token}`).toString("base64")}` } : null;
};

async function twilioGet<T>(pathOrUri: string): Promise<T> {
  const auth = twilioAuth();
  if (!auth) throw new Error("Twilio is not configured");
  const url = pathOrUri.startsWith("/2010-04-01/")
    ? `https://api.twilio.com${pathOrUri}`
    : `https://api.twilio.com/2010-04-01/Accounts/${auth.sid}${pathOrUri}`;
  const res = await fetch(url, {
    headers: { authorization: auth.header },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`twilio ${res.status}`);
  return (await res.json()) as T;
}

interface TwilioMessage {
  date_sent: string | null;
  date_created: string;
  direction: string;
  status: string;
}

/** Messages matching a query, newest first, following pages up to `maxPages` of 1000. */
async function twilioMessages(query: string, maxPages = 5): Promise<TwilioMessage[]> {
  const out: TwilioMessage[] = [];
  let next: string | null = `/Messages.json?PageSize=1000${query ? `&${query}` : ""}`;
  for (let i = 0; next && i < maxPages; i++) {
    const page: { messages: TwilioMessage[]; next_page_uri: string | null } = await twilioGet(next);
    out.push(...page.messages);
    next = page.next_page_uri;
  }
  return out;
}

const sentAt = (m: TwilioMessage) => new Date(m.date_sent ?? m.date_created);

/**
 * Outbound messages that really went out in the last 24 hours, newest first. Twilio also records
 * refusals (status failed, for example 63038 at the cap); those do not count against the cap.
 */
async function sentInWindow(now: Date): Promise<TwilioMessage[]> {
  const since = new Date(now.getTime() - 24 * 3_600_000);
  const all = await twilioMessages(`DateSent%3E=${since.toISOString().slice(0, 10)}`);
  return all.filter((m) => m.direction.startsWith("outbound") && m.status !== "failed" && sentAt(m) > since);
}

/** "Trial" or "Full". Trial accounts are capped at 50 messages a rolling 24 hours. */
export async function twilioAccountType(): Promise<string> {
  return (await twilioGet<{ type: string }>(".json")).type;
}

/** Messages the whole account really sent in the last 24 hours (other machines included). */
export async function twilioSentLast24h(now = new Date()): Promise<number> {
  return (await sentInWindow(now)).length;
}

let capCache: { at: number; resetsAt: Date | null } | undefined;

/**
 * When the trial's daily cap (63038, a rolling 24 hours) frees a slot again: the oldest message the
 * account really sent in the last 24 hours, plus 24 hours. Asks Twilio, because other machines share
 * the account. Cached for 10 minutes; null when Twilio cannot be asked or nothing was sent.
 */
export async function twilioCapResetsAt(now = new Date()): Promise<Date | null> {
  if (capCache && now.getTime() - capCache.at < 10 * 60_000) return capCache.resetsAt;
  let resetsAt: Date | null = null;
  try {
    const sent = await sentInWindow(now);
    const oldest = sent.at(-1);
    resetsAt = oldest ? new Date(sentAt(oldest).getTime() + 24 * 3_600_000) : null;
  } catch {
    resetsAt = null;
  }
  capCache = { at: now.getTime(), resetsAt };
  return resetsAt;
}

/** When this WhatsApp number last received one of our messages (delivered or read), or null. */
export async function lastWhatsAppDelivery(phone: string): Promise<Date | null> {
  const msgs = await twilioMessages(`To=${encodeURIComponent(`whatsapp:${phone}`)}`, 3);
  const ok = msgs
    .filter((m) => m.status === "delivered" || m.status === "read")
    .map((m) => sentAt(m).getTime());
  return ok.length ? new Date(Math.max(...ok)) : null;
}
