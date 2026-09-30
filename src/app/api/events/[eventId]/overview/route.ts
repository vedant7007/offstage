import { OverviewResponse } from "@/contracts/api";
import { getActor, requirePermission } from "@/server/authz";
import { json, route } from "@/server/http";
import { getOverview } from "@/server/services/overview";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ eventId: string }> };

// Console overview: the event, live metrics from SQL, agent health and the latest domain events.
export const GET = route<Ctx>(async (req, ctx) => {
  const { eventId } = await ctx.params;
  const actor = await getActor(req, { eventId });
  requirePermission(actor, "event.read", { eventId });
  return json(OverviewResponse, await getOverview(eventId));
});
