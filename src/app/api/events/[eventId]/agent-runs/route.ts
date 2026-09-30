import { ListAgentRunsQuery, ListAgentRunsResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, route } from "@/server/http";
import { listAgentRuns } from "@/server/services/proposals";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ eventId: string }> };

// Agent runs for the console timeline, newest first.
export const GET = route<Ctx>(async (req, ctx) => {
  const { eventId } = await ctx.params;
  const actor = await getActor(req, { eventId });
  const query = ListAgentRunsQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  return json(ListAgentRunsResponse, await listAgentRuns(actor, query));
});
