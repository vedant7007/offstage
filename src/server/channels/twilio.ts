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
