import { EvalsView } from "@/components/console/evals-view";

export default async function EvalsPage({ params }: PageProps<"/console/[eventId]/evals">) {
  const { eventId } = await params;
  return <EvalsView eventId={eventId} />;
}
