import { PublicRegisterRequest, PublicRegisterResponse } from "@/contracts/api";
import { clientIp, json, readJson, route } from "@/server/http";
import { enforce } from "@/server/rate-limit";
import { register } from "@/server/services/public-registration";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// Register after the email is verified. Confirmed gets a ticket; a full event gets the waitlist.
export const POST = route<Ctx>(async (req, ctx) => {
  const { slug } = await ctx.params;
  const body = await readJson(req, PublicRegisterRequest);
  await enforce(
    `register:ip:${clientIp(req)}`,
    30,
    3600,
    "Too many registrations from this network. Try again later.",
  );
  const res = await register(slug, body);
  return json(PublicRegisterResponse, res, { status: 201 });
});
