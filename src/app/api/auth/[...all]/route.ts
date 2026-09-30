import { toNextJsHandler } from "better-auth/next-js";
import { z } from "zod";
import { auth } from "@/server/auth";
import { clientIp, errorResponse } from "@/server/http";
import { emailHash } from "@/server/pii";
import { enforce, OTP_LIMITS } from "@/server/rate-limit";
import { verifyTurnstile } from "@/server/turnstile";

// Better Auth's own routes (/api/auth/*). OTP requests get our checks first:
// Turnstile, then 20 per IP per hour and 3 per email per 10 minutes.
const handler = toNextJsHandler(auth);

const OtpSend = z.object({ email: z.email().max(254) }).loose();

export const GET = handler.GET;

export async function POST(req: Request): Promise<Response> {
  if (new URL(req.url).pathname.endsWith("/email-otp/send-verification-otp")) {
    try {
      const body = OtpSend.parse(await req.clone().json());
      const ip = clientIp(req);
      await verifyTurnstile(req.headers.get("x-turnstile-token"), ip);
      await enforce(
        `otp:ip:${ip}`,
        OTP_LIMITS.perIp.limit,
        OTP_LIMITS.perIp.windowSeconds,
        "Too many code requests from this network. Try again later.",
      );
      await enforce(
        `otp:email:${emailHash(body.email)}`,
        OTP_LIMITS.perEmail.limit,
        OTP_LIMITS.perEmail.windowSeconds,
        "Too many codes for this email. Wait a few minutes and try again.",
      );
    } catch (err) {
      return errorResponse(err);
    }
  }
  return handler.POST(req);
}
