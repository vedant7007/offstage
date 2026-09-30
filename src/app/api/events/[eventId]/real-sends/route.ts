import { RealSendsResponse, SetRealSendsRequest } from "@/contracts/api";
import { demoModeOn } from "@/server/auth/personas";
import { getActor, requirePermission } from "@/server/authz";
import { forbidden, json, readJson, route } from "@/server/http";
import { getRealSends, setRealSends } from "@/server/real-sends";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ eventId: string }> };

const canChange = (role: string) => role === "owner" && demoModeOn();

// Whether allowlisted people really get messages right now. Anyone who can see the event may ask.
export const GET = route<Ctx>(async (req, ctx) => {
  const { eventId } = await ctx.params;
  const actor = await getActor(req, { eventId });
  requirePermission(actor, "event.read", { eventId });
  return json(RealSendsResponse, { ...(await getRealSends()), canChange: canChange(actor.role) });
});

// Flip it. The event owner only, in demo mode only; audited.
export const POST = route<Ctx>(async (req, ctx) => {
  const { eventId } = await ctx.params;
  const actor = await getActor(req, { eventId });
  if (!canChange(actor.role)) throw forbidden("Only the event owner can switch real sends, in demo mode");
  const { on } = await readJson(req, SetRealSendsRequest);
  return json(RealSendsResponse, { ...(await setRealSends(on, actor)), canChange: true });
});
