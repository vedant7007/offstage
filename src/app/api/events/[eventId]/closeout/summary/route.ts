import { CloseoutReport } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, route } from "@/server/http";
import { writeCloseoutSummary } from "@/server/services/closeout";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ eventId: string }> };

// Write the model's short summary of the report (numbers checked against the report).
export const POST = route<Ctx>(async (req, ctx) => {
  const { eventId } = await ctx.params;
  return json(CloseoutReport, await writeCloseoutSummary(await getActor(req, { eventId })));
});
