import { redirect } from "next/navigation";
import { Alert } from "@/components/ui";
import { getMe } from "@/components/attendee/server";
import { CheckinScanner } from "@/components/crew/checkin-scanner";

export const metadata = { title: "Check-in", robots: { index: false } };

export default async function CheckinPage() {
  const me = await getMe();
  if (!me) redirect("/login?next=/crew/checkin");
  const event = me.memberships.find((m) => m.eventId === me.activeEventId) ?? me.memberships[0];
  if (!event) return <Alert variant="info" title="You are not on an event crew yet." />;
  return (
    <CheckinScanner
      slug={event.eventSlug}
      eventName={event.eventName}
      clockOffsetMs={me.clockOffsetMs ?? 0}
    />
  );
}
