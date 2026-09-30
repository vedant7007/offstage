/**
 * Cloudflare Turnstile check for public forms (register, OTP request, volunteer sign-up).
 * Without TURNSTILE_SECRET_KEY (local dev) the check is skipped with a warning, never silently.
 */
import { logger } from "@/lib/logger";
import { HttpError } from "./http";

const log = logger.child({ module: "turnstile" });
const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

let warned = false;

export async function verifyTurnstile(token: string | null | undefined, ip: string): Promise<void> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    if (!warned) {
      log.warn("TURNSTILE_SECRET_KEY is not set: bot checks are skipped (fine for local dev only)");
      warned = true;
    }
    return;
  }
  if (!token) throw new HttpError("turnstile_failed", "Please complete the check that you are human");
  const form = new URLSearchParams({ secret, response: token });
  if (ip !== "local") form.set("remoteip", ip);
  let ok = false;
  try {
    const res = await fetch(VERIFY_URL, { method: "POST", body: form, signal: AbortSignal.timeout(5000) });
    const data = (await res.json()) as { success?: boolean; "error-codes"?: string[] };
    ok = data.success === true;
    if (!ok) log.info({ codes: data["error-codes"] }, "turnstile rejected");
  } catch (err) {
    log.warn({ err }, "turnstile verification failed to run");
  }
  if (!ok) throw new HttpError("turnstile_failed", "Please complete the check that you are human");
}
