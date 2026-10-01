import { DemoScenarios } from "@/components/console/demo-scenarios";
import { LiveStage } from "@/components/console/live-stage/live-stage";
import { isShowcase } from "@/showcase/flag";

const demoMode = process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1";

export default async function ConsoleHome({ params }: PageProps<"/console/[eventId]">) {
  const { eventId } = await params;
  // In demo mode the scenario buttons sit right above the stage, so the audience watches the agents react.
  return <LiveStage eventId={eventId} demo={demoMode || isShowcase() ? <DemoScenarios /> : null} />;
}
