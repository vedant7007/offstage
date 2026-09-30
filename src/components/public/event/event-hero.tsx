import Link from "next/link";
import { CalendarDays, Info, MapPin, MonitorPlay } from "lucide-react";
import type { PublicEventResponse } from "@/contracts";
import { Badge, Button, Progress } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { formatDate, formatDayShort } from "@/lib/time";
import { cn } from "@/lib/utils";

type Props = { data: PublicEventResponse; isDemo: boolean };

export function mapLink(venue: PublicEventResponse["event"]["venue"]) {
  if (venue.mapUrl) return venue.mapUrl;
  const q = [venue.name, venue.address, venue.city].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** Name, dates, venue, and the register button with honest capacity. */
export async function EventHero({ data, isDemo }: Props) {
  const t = await getT();
  const { event, capacity } = data;
  const full = capacity.registered >= capacity.total;
  const closed = event.status === "closed" || (full && !capacity.waitlistOpen);
  const left = Math.max(capacity.total - capacity.registered, 0);

  return (
    <section aria-labelledby="event-title" className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        {event.status === "live" ? (
          <Badge tone="approved" className="text-sm">
            <span aria-hidden className="size-2 rounded-full bg-approved" />
            {t("event.live")}
          </Badge>
        ) : null}
        <h1 id="event-title" className="font-display text-3xl leading-tight font-bold md:text-4xl">
          {event.name}
        </h1>
        {event.tagline ? <p className="text-lg text-fg-muted">{event.tagline}</p> : null}
      </div>

      <div className="grid gap-6 md:grid-cols-[1fr_20rem]">
        <div className="flex flex-col gap-4">
          <p className="flex items-start gap-2">
            <CalendarDays aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-muted" />
            <span>
              {t("event.dates", { start: formatDayShort(event.startsAt), end: formatDate(event.endsAt) })}
            </span>
          </p>
          <div className="flex items-start gap-2">
            <MapPin aria-hidden className="mt-0.5 size-5 shrink-0 text-fg-muted" />
            <div className="flex flex-col gap-1">
              <p>
                <span className="sr-only">{t("event.venue")}: </span>
                {event.venue.name}, {event.venue.address}, {event.venue.city}
              </p>
              <a
                href={mapLink(event.venue)}
                className="w-fit font-medium text-curtain-text underline underline-offset-4"
              >
                {t("event.openMap")}
              </a>
            </div>
          </div>
          <p className="max-w-prose text-base leading-relaxed">{event.description}</p>
          {isDemo ? (
            <p className="flex items-start gap-2 text-sm text-fg-muted">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t("event.demoData")}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5">
          <Progress
            label={t("event.seatsTaken", { registered: capacity.registered, total: capacity.total })}
            value={Math.min(capacity.registered, capacity.total)}
            max={capacity.total || 1}
            showValue={false}
            tone={full ? "pending" : "curtain"}
          />
          <p className={cn("text-sm", full ? "text-pending-text" : "text-fg-muted")}>
            {closed
              ? t("event.registrationClosed")
              : full
                ? t("event.full")
                : t("event.seatsLeft", { count: left })}
          </p>
          {closed ? null : (
            <Button asChild block size="lg">
              <Link href={`/e/${event.slug}/register`}>
                {full ? t("event.joinWaitlist") : t("event.register")}
              </Link>
            </Button>
          )}
          <Button asChild block variant="secondary">
            <Link href={`/e/${event.slug}/status`}>
              <MonitorPlay aria-hidden />
              {t("event.statusBoard")}
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
