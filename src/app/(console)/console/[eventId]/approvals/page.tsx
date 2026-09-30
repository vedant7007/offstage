import { ApprovalQueue } from "@/components/console/approval-queue";

export default async function ApprovalsPage({ params }: PageProps<"/console/[eventId]/approvals">) {
  const { eventId } = await params;
  return <ApprovalQueue eventId={eventId} />;
}
