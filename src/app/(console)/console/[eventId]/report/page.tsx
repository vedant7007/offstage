import { CloseoutView } from "@/components/console/closeout-view";

export default async function ReportPage({ params }: PageProps<"/console/[eventId]/report">) {
  const { eventId } = await params;
  return <CloseoutView eventId={eventId} />;
}
