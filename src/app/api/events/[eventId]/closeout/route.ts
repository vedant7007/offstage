import { CloseoutReport } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, route } from "@/server/http";
import { getCloseout } from "@/server/services/closeout";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ eventId: string }> };

// The close-out report: counts from SQL, plus the stored summary while the numbers still match it.
export const GET = route<Ctx>(async (req, ctx) => {
  const { eventId } = await ctx.params;
  return json(CloseoutReport, await getCloseout(await getActor(req, { eventId })));
});
