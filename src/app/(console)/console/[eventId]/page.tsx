import { DemoScenarios } from "@/components/console/demo-scenarios";
import { LiveStage } from "@/components/console/live-stage/live-stage";

const demoMode = process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1";

export default async function ConsoleHome({ params }: PageProps<"/console/[eventId]">) {
  const { eventId } = await params;
  // In demo mode the scenario buttons sit above the stage, so the audience watches the agents react.
  return (
    <div className="flex flex-col gap-4">
      {demoMode ? <DemoScenarios /> : null}
      <LiveStage eventId={eventId} />
    </div>
  );
}
