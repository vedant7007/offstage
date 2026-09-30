import { EvalsResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, route } from "@/server/http";
import { getEvals } from "@/server/services/evals";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ eventId: string }> };

// The golden-set run on record and live per-agent numbers.
export const GET = route<Ctx>(async (req, ctx) => {
  const { eventId } = await ctx.params;
  return json(EvalsResponse, await getEvals(await getActor(req, { eventId })));
});
