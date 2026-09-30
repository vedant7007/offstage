import { redirect } from "next/navigation";

export default async function ConsoleHome({ params }: PageProps<"/console/[eventId]">) {
  const { eventId } = await params;
  redirect(`/console/${eventId}/approvals`);
}
