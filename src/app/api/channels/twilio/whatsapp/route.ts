import { after } from "next/server";
import { logger } from "@/lib/logger";
import { parseAllowlist } from "@/server/channels/allowlist";
import { allowlistedSender, answerInbound, senderByPhoneHash } from "@/server/channels/inbound";
import { sendTwilio, validTwilioSignature } from "@/server/channels/twilio";
import { lookupHash, normalisePhone, phoneHash } from "@/server/pii";

export const dynamic = "force-dynamic";

const log = logger.child({ module: "api.whatsapp" });
const EMPTY = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
const twiml = () => new Response(EMPTY, { headers: { "content-type": "text/xml" } });

/**
 * Twilio's WhatsApp webhook. Checks the signature against the public URL (APP_URL), answers Twilio
 * at once with empty TwiML, then asks the helpdesk and replies through the Messages API: an answer
 * can take longer than Twilio's 15 second webhook timeout. Numbers off the allowlist get no reply.
 */
export async function POST(req: Request): Promise<Response> {
  const params = new URLSearchParams(await req.text());
  const url = `${process.env.APP_URL ?? new URL(req.url).origin}/api/channels/twilio/whatsapp`;
  if (!validTwilioSignature(req.headers.get("x-twilio-signature"), url, params)) {
    log.warn("whatsapp webhook with a bad signature");
    return new Response("Forbidden", { status: 403 });
  }

  const from = normalisePhone((params.get("From") ?? "").replace(/^whatsapp:/, ""));
  const text = (params.get("Body") ?? "").trim();
  if (!from || !text) return twiml();

  // Same rule as the outbox: real WhatsApp messages only go to allowlisted numbers. A registration
  // with that number decides which event the question is about.
  if (!parseAllowlist().phones.has(from)) {
    log.info({ allowlisted: false }, "whatsapp message from a number that is not allowlisted");
    return twiml();
  }
  const sender = (await senderByPhoneHash(phoneHash(from)!)) ?? (await allowlistedSender());
  if (!sender) return twiml();

  after(async () => {
    try {
      const { reply, result } = await answerInbound({
        channel: "whatsapp",
        sender,
        refHash: lookupHash(`wa:${from}`),
        text,
      });
      await sendTwilio("whatsapp", from, reply);
      log.info({ blocked: result?.blocked, escalated: Boolean(result?.escalationId) }, "whatsapp helpdesk");
    } catch (err) {
      log.error({ err: String(err) }, "whatsapp helpdesk reply failed");
    }
  });
  return twiml();
}
