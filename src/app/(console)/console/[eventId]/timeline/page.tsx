import { AgentTimeline } from "@/components/console/agent-timeline";

export default async function TimelinePage({ params }: PageProps<"/console/[eventId]/timeline">) {
  const { eventId } = await params;
  return <AgentTimeline eventId={eventId} />;
}
