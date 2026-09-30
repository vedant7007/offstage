import { ApproveProposalRequest, ProposalActionResponse } from "@/contracts/api";
import { actions } from "@/server/actions";
import { getActor } from "@/server/authz";
import { json, readJson, route } from "@/server/http";
import { getProposalDetail } from "@/server/services/proposals";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ eventId: string; proposalId: string }> };

// Approve with the diff hash the approver saw. Enough approvals execute it.
export const POST = route<Ctx>(async (req, ctx) => {
  const { eventId, proposalId } = await ctx.params;
  const actor = await getActor(req, { eventId });
  await getProposalDetail(actor, proposalId); // 404 for another event's proposal
  return json(ProposalActionResponse, {
    proposal: await actions.approve(
      actor,
      proposalId,
      (await readJson(req, ApproveProposalRequest)).diffHash,
    ),
  });
});
