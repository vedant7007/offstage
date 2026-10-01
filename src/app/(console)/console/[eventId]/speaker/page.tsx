import { notFound } from "next/navigation";
import { isShowcase } from "@/showcase/flag";
import { SpeakerView } from "@/showcase/speaker-view";

/** Showcase only: where the speaker persona lands. The live app reaches speakers by message, not a login. */
export default async function SpeakerPage({ params }: PageProps<"/console/[eventId]/speaker">) {
  if (!isShowcase()) notFound();
  const { eventId } = await params;
  return <SpeakerView eventId={eventId} />;
}
