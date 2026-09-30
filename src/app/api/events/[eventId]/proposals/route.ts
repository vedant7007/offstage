import { ListProposalsQuery, ListProposalsResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, route } from "@/server/http";
import { listProposals } from "@/server/services/proposals";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ eventId: string }> };

// Proposals for the console queue; ?status can repeat (status=pending&status=approved).
export const GET = route<Ctx>(async (req, ctx) => {
  const { eventId } = await ctx.params;
  const actor = await getActor(req, { eventId });
  const sp = new URL(req.url).searchParams;
  const statuses = sp.getAll("status");
  const query = ListProposalsQuery.parse({
    ...Object.fromEntries(sp),
    ...(statuses.length ? { status: statuses.length > 1 ? statuses : statuses[0] } : {}),
  });
  return json(ListProposalsResponse, await listProposals(actor, query));
});
