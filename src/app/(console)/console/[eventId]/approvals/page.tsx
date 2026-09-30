import { ApprovalQueue } from "@/components/console/approval-queue";
import { DeliveryCounts } from "@/components/console/delivery-counts";

export default async function ApprovalsPage({ params }: PageProps<"/console/[eventId]/approvals">) {
  const { eventId } = await params;
  return (
    <div className="flex flex-col gap-8">
      <ApprovalQueue eventId={eventId} />
      <DeliveryCounts eventId={eventId} />
    </div>
  );
}
