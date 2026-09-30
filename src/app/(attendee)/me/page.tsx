import type { Metadata } from "next";
import Link from "next/link";
import { Info } from "lucide-react";
import { Alert, Button, EmptyState } from "@/components/ui";
import { DEMO_EVENT_SLUG } from "@/components/public/links";
import { getMe, getMyRegistration, getMyTicket } from "@/components/attendee/server";
import { TicketCard } from "@/components/attendee/ticket-card";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("me.ticket.title"), robots: { index: false } };
}

export default async function TicketPage() {
  const [t, me, registration] = await Promise.all([getT(), getMe(), getMyRegistration()]);
  if (!registration) {
    return (
      <EmptyState
        title={t("me.noEvent")}
        action={
          <Button asChild variant="secondary">
            <Link href={`/e/${DEMO_EVENT_SLUG}`}>{t("me.findEvent")}</Link>
          </Button>
        }
      />
    );
  }
  if (registration.status === "waitlisted") return <Alert variant="info" title={t("me.ticket.waitlisted")} />;

  const ticket = await getMyTicket(registration.id);
  if (!ticket) return <Alert variant="info" title={t("me.ticket.none")} />;
  if (ticket.data.ticket.revoked) return <Alert variant="danger" title={t("me.ticket.revoked")} />;

  const eventName =
    me?.memberships.find((m) => m.eventId === registration.eventId)?.eventName ??
    me?.memberships[0]?.eventName ??
    "";

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4">
      <TicketCard
        name={registration.name}
        eventName={eventName}
        qrPngDataUrl={ticket.data.qrPngDataUrl}
        checkedInAt={ticket.data.checkedInAt ?? registration.checkedInAt}
      />
      {ticket.source === "fixture" ? (
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("me.demoData")}
        </p>
      ) : null}
    </div>
  );
}
