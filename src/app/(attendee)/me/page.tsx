import type { ReactNode } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { Clock, Info, MessageCircle, TicketX } from "lucide-react";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { DEMO_EVENT_SLUG } from "@/components/public/links";
import { getPublicEvent } from "@/components/public/data";
import { eventNow, getMe, getMyRegistration, getMySchedule, getMyTicket } from "@/components/attendee/server";
import { TicketCard } from "@/components/attendee/ticket-card";
import { UpNext } from "@/components/attendee/up-next";
import { getT } from "@/lib/i18n/server";
import { formatDayShort } from "@/lib/time";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("me.ticket.title"), robots: { index: false } };
}

export default async function TicketPage() {
  const [t, me, registration] = await Promise.all([getT(), getMe(), getMyRegistration()]);

  // States without a ticket keep the page's one h1 and say what happens next.
  const noTicket = (icon: ReactNode, title: string, action: ReactNode) => (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <PageHeader title={t("me.ticket.title")} className="pb-0" />
      <EmptyState icon={icon} title={title} action={action} />
    </div>
  );
  const askHelpdesk = (
    <Button asChild variant="secondary">
      <Link href="/me/chat">
        <MessageCircle aria-hidden />
        {t("board.askHelpdesk")}
      </Link>
    </Button>
  );

  if (!registration) {
    return noTicket(
      <TicketX aria-hidden />,
      t("me.noEvent"),
      <Button asChild variant="secondary">
        <Link href={`/e/${DEMO_EVENT_SLUG}`}>{t("me.findEvent")}</Link>
      </Button>,
    );
  }
  if (registration.status === "waitlisted")
    return noTicket(<Clock aria-hidden />, t("me.ticket.waitlisted"), askHelpdesk);

  const [ticket, schedule] = await Promise.all([
    getMyTicket(registration.id),
    getMySchedule(registration.id),
  ]);
  if (!ticket) return noTicket(<Clock aria-hidden />, t("me.ticket.none"), askHelpdesk);
  if (ticket.data.ticket.revoked)
    return noTicket(<TicketX aria-hidden />, t("me.ticket.revoked"), askHelpdesk);

  const membership = me?.memberships.find((m) => m.eventId === registration.eventId) ?? me?.memberships[0];
  const event = membership ? (await getPublicEvent(membership.eventSlug))?.data.event : undefined;
  const dates = event
    ? formatDayShort(event.startsAt) === formatDayShort(event.endsAt)
      ? formatDayShort(event.startsAt)
      : t("event.dates", { start: formatDayShort(event.startsAt), end: formatDayShort(event.endsAt) })
    : undefined;

  const { nowIso, clockOffsetMs } = eventNow(me);

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TicketCard
        name={registration.name}
        // The host college is already in the venue line.
        college={registration.college === event?.venue.name ? undefined : registration.college}
        eventName={membership?.eventName ?? ""}
        dates={dates}
        venue={event ? `${event.venue.name}, ${event.venue.city}` : undefined}
        qrPngDataUrl={ticket.data.qrPngDataUrl}
        checkedInAt={ticket.data.checkedInAt ?? registration.checkedInAt}
      />
      {schedule ? (
        <UpNext
          sessions={schedule.data.sessions}
          rooms={schedule.data.rooms}
          nowIso={nowIso}
          clockOffsetMs={clockOffsetMs}
          href="/me/schedule"
        />
      ) : null}
      {ticket.source === "fixture" || schedule?.source === "fixture" ? (
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("me.demoData")}
        </p>
      ) : null}
    </div>
  );
}
