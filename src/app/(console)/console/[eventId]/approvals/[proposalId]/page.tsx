import { ProposalDetail } from "@/components/console/proposal-detail";

export default async function ProposalPage({
  params,
}: PageProps<"/console/[eventId]/approvals/[proposalId]">) {
  const { eventId, proposalId } = await params;
  return <ProposalDetail eventId={eventId} proposalId={proposalId} />;
}
