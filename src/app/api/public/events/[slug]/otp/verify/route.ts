import { OtpVerifyRequest, OtpVerifyResponse } from "@/contracts/api";
import { clientIp, json, readJson, route } from "@/server/http";
import { enforce } from "@/server/rate-limit";
import { verifyOtp } from "@/server/services/public-registration";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// Check the code, sign the person in, and return the token that register needs.
export const POST = route<Ctx>(async (req, ctx) => {
  const { slug } = await ctx.params;
  const body = await readJson(req, OtpVerifyRequest);
  // Better Auth allows 3 tries per code; this stops guessing across many emails from one network.
  await enforce(`otp-verify:ip:${clientIp(req)}`, 30, 3600, "Too many attempts. Try again later.");
  const { body: res, headers } = await verifyOtp(slug, body, req.headers);
  const out = json(OtpVerifyResponse, res);
  for (const cookie of headers.getSetCookie()) out.headers.append("set-cookie", cookie);
  return out;
});
