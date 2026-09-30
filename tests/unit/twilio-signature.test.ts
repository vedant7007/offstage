import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validTwilioSignature } from "@/server/channels/twilio";

const URL_ = "https://sutradhar.example/api/channels/twilio/whatsapp";
const TOKEN = "test-auth-token";

// Twilio's documented recipe, written out by hand: URL, then each parameter name and value sorted by name.
const sign = (data: string) => createHmac("sha1", TOKEN).update(data).digest("base64");

describe("validTwilioSignature", () => {
  const params = new URLSearchParams({
    From: "whatsapp:+919876543210",
    Body: "Where is lunch?",
    To: "whatsapp:+14155238886",
  });
  const good = sign(`${URL_}BodyWhere is lunch?Fromwhatsapp:+919876543210Towhatsapp:+14155238886`);

  it("accepts Twilio's signature", () => {
    expect(validTwilioSignature(good, URL_, params, TOKEN)).toBe(true);
  });

  it("rejects a changed body, another URL, another token, or no signature", () => {
    const changed = new URLSearchParams(params);
    changed.set("Body", "Where is dinner?");
    expect(validTwilioSignature(good, URL_, changed, TOKEN)).toBe(false);
    expect(validTwilioSignature(good, `${URL_}?x=1`, params, TOKEN)).toBe(false);
    expect(validTwilioSignature(good, URL_, params, "other")).toBe(false);
    expect(validTwilioSignature(null, URL_, params, TOKEN)).toBe(false);
    expect(validTwilioSignature(good, URL_, params, "")).toBe(false);
  });
});
