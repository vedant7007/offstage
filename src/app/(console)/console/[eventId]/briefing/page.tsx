import { BriefingView } from "@/components/console/briefing-view";

export default async function BriefingPage({ params }: PageProps<"/console/[eventId]/briefing">) {
  const { eventId } = await params;
  return <BriefingView eventId={eventId} />;
}
