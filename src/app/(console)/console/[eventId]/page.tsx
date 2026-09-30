import { LiveStage } from "@/components/console/live-stage/live-stage";

export default async function ConsoleHome({ params }: PageProps<"/console/[eventId]">) {
  const { eventId } = await params;
  return <LiveStage eventId={eventId} />;
}
