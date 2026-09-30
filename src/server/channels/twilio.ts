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
