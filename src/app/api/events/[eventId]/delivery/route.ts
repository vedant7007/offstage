import { DeliveryStatsResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, route } from "@/server/http";
import { deliveryStats } from "@/server/services/delivery";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ eventId: string }> };

// Real versus mock delivery counts per channel, for the console.
export const GET = route<Ctx>(async (req, ctx) => {
  const { eventId } = await ctx.params;
  const actor = await getActor(req, { eventId });
  return json(DeliveryStatsResponse, await deliveryStats(actor));
});
