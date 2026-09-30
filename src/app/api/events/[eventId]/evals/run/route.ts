import { EvalsResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, route } from "@/server/http";
import { runEvals } from "@/server/services/evals";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ eventId: string }> };

// Owner only: rerun the golden set in the background.
export const POST = route<Ctx>(async (req, ctx) => {
  const { eventId } = await ctx.params;
  return json(EvalsResponse, await runEvals(await getActor(req, { eventId })), { status: 202 });
});
