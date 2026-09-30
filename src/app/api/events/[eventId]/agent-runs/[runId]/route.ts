import { AgentRunResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, route } from "@/server/http";
import { getAgentRun } from "@/server/services/proposals";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ eventId: string; runId: string }> };

// One run with its steps (model calls, tools, guard verdicts, proposals), already redacted.
export const GET = route<Ctx>(async (req, ctx) => {
  const { eventId, runId } = await ctx.params;
  const actor = await getActor(req, { eventId });
  return json(AgentRunResponse, await getAgentRun(actor, runId));
});
