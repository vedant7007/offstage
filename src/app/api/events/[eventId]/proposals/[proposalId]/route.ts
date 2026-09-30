import { EditProposalRequest, ProposalActionResponse, ProposalResponse } from "@/contracts/api";
import { actions } from "@/server/actions";
import { getActor } from "@/server/authz";
import { json, readJson, route } from "@/server/http";
import { getProposalDetail } from "@/server/services/proposals";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ eventId: string; proposalId: string }> };

// One proposal with its bundle children, and whether the caller may approve or undo it.
export const GET = route<Ctx>(async (req, ctx) => {
  const { eventId, proposalId } = await ctx.params;
  const actor = await getActor(req, { eventId });
  return json(ProposalResponse, await getProposalDetail(actor, proposalId));
});

// Edit the payload: re-validated, re-tiered, approvals cleared.
export const PATCH = route<Ctx>(async (req, ctx) => {
  const { eventId, proposalId } = await ctx.params;
  const actor = await getActor(req, { eventId });
  const body = await readJson(req, EditProposalRequest);
  await getProposalDetail(actor, proposalId); // 404 for another event's proposal
  return json(ProposalActionResponse, {
    proposal: await actions.edit(actor, proposalId, body.payload, body.summary),
  });
});
