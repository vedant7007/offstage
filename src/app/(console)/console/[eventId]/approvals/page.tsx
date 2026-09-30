import { ApprovalQueue } from "@/components/console/approval-queue";
import { DeliveryCounts } from "@/components/console/delivery-counts";
import { DemoScenarios } from "@/components/console/demo-scenarios";

const demoMode = process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1";

export default async function ApprovalsPage({ params }: PageProps<"/console/[eventId]/approvals">) {
  const { eventId } = await params;
  return (
    <div className="flex flex-col gap-8">
      <ApprovalQueue eventId={eventId} />
      <DeliveryCounts eventId={eventId} />
      {demoMode ? <DemoScenarios /> : null}
    </div>
  );
}
