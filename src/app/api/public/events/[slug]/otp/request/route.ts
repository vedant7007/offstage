import { OtpRequest, OtpRequestResponse } from "@/contracts/api";
import { clientIp, json, readJson, route } from "@/server/http";
import { requestOtp } from "@/server/services/public-registration";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// Email a 6-digit code. Turnstile, 20 per IP per hour, 3 per email per 10 minutes.
export const POST = route<Ctx>(async (req, ctx) => {
  const { slug } = await ctx.params;
  const body = await readJson(req, OtpRequest);
  const res = await requestOtp(slug, body, clientIp(req), req.headers.get("x-turnstile-token"));
  return json(OtpRequestResponse, res);
});
