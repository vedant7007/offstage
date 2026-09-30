import { DemoInboxQuery, DemoInboxResponse } from "@/contracts/api";
import { demoModeOn } from "@/server/auth/personas";
import { demoInboxAllowed } from "@/server/channels/demo-inbox";
import { clientIp, json, notFound, route } from "@/server/http";
import { enforce } from "@/server/rate-limit";
import { eventBySlug } from "@/server/services/public";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// DEMO_MODE only: may the OTP screen link to this email's demo inbox? 404 when DEMO_MODE is off.
export const GET = route<Ctx>(async (req, ctx) => {
  const { slug } = await ctx.params;
  const { email } = DemoInboxQuery.parse({ email: new URL(req.url).searchParams.get("email") ?? "" });
  if (!demoModeOn()) throw notFound();
  if (!demoInboxAllowed(email)) return json(DemoInboxResponse, { available: false });
  await eventBySlug(slug);
  await enforce(`demo-inbox:${clientIp(req)}`, 60, 600, "Too many requests. Try again in a few minutes.");
  const url = `/api/public/events/${encodeURIComponent(slug)}/demo-inbox/latest?email=${encodeURIComponent(email)}`;
  return json(DemoInboxResponse, { available: true, url });
});
