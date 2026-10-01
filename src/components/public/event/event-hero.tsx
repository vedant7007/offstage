import Link from "next/link";
import { ArrowRight, CalendarDays, Info, MapPin, MonitorPlay } from "lucide-react";
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

/**
 * The stage band: an ink panel in both themes (nested `.dark` flips the tokens) with the event
 * name large, a mono meta row, and the register card with honest capacity.
 * On phones the register card comes right after when and where, before the long description,
 * so the main action is on the first screen. From md it sits in its own column.
 */
export async function EventHero({ data, isDemo }: Props) {
  const t = await getT();
  const { event, capacity } = data;
  const full = capacity.registered >= capacity.total;
  const closed = event.status === "closed" || (full && !capacity.waitlistOpen);
  const left = Math.max(capacity.total - capacity.registered, 0);

  return (
    <section
      aria-labelledby="event-title"
      className="dark relative isolate overflow-hidden rounded-card border border-border bg-bg text-fg shadow-(--shadow-card)"
    >
      {/* A soft stage light from above. Decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_90%_at_25%_-10%,rgb(255_255_255/0.12),transparent_65%)]"
      />
      <div className="grid gap-6 p-6 md:grid-cols-[1fr_20rem] md:gap-x-10 md:gap-y-6 md:p-10 lg:p-12">
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-4">
            {event.status === "live" ? (
              <Badge tone="approved" className="w-fit text-sm">
                <span aria-hidden className="size-2 animate-pulse rounded-full bg-approved" />
                {t("event.live")}
              </Badge>
            ) : null}
            <h1
              id="event-title"
              className="text-[clamp(2.5rem,10vw,5.5rem)] leading-[0.95] font-medium tracking-[-0.045em] break-words"
            >
              {event.name}
            </h1>
            {event.tagline ? (
              <p className="max-w-2xl text-lg text-pretty text-fg-muted md:text-xl">{event.tagline}</p>
            ) : null}
          </div>

          <ul className="flex flex-col gap-3 border-y border-border py-4 font-mono text-sm">
            <li className="flex items-start gap-2.5">
              <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0 text-curtain-text" />
              <span>
                {t("event.dates", { start: formatDayShort(event.startsAt), end: formatDate(event.endsAt) })}
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <MapPin aria-hidden className="mt-0.5 size-4 shrink-0 text-curtain-text" />
              <span className="flex flex-col gap-1">
                <span>
                  <span className="sr-only">{t("event.venue")}: </span>
                  {event.venue.name}, {event.venue.address}, {event.venue.city}
                </span>
                <a
                  href={mapLink(event.venue)}
                  className="inline-flex min-h-11 w-fit items-center font-medium text-curtain-text underline underline-offset-4 hover:no-underline md:min-h-6"
                >
                  {t("event.openMap")}
                </a>
              </span>
            </li>
          </ul>
        </div>

        <div className="flex flex-col gap-4 self-start rounded-card border border-border bg-surface p-5 shadow-card md:col-start-2 md:row-span-2 md:row-start-1">
          <Progress
            label={t("event.seatsTaken", { registered: capacity.registered, total: capacity.total })}
            value={Math.min(capacity.registered, capacity.total)}
            max={capacity.total || 1}
            showValue={false}
            tone={full ? "pending" : "curtain"}
            className="font-mono"
          />
          <p className={cn("text-sm text-pretty", full ? "text-pending-text" : "text-fg-muted")}>
            {closed
              ? t("event.registrationClosed")
              : full
                ? t("event.full")
                : t("event.seatsLeft", { count: left })}
          </p>
          {closed ? null : (
            <Button
              asChild
              block
              size="lg"
              className="group rounded-full transition-[background-color,transform] duration-(--duration-slow) hover:-translate-y-0.5"
            >
              <Link href={`/e/${event.slug}/register`}>
                {full ? t("event.joinWaitlist") : t("event.register")}
                <ArrowRight
                  aria-hidden
                  className="transition-transform duration-(--duration-slow) ease-out group-hover:translate-x-0.5"
                />
              </Link>
            </Button>
          )}
          <Button asChild block variant="secondary" className="rounded-full">
            <Link href={`/e/${event.slug}/status`}>
              <MonitorPlay aria-hidden />
              {t("event.statusBoard")}
            </Link>
          </Button>
        </div>

        <div className="flex min-w-0 flex-col gap-4">
          <p className="max-w-prose text-base leading-relaxed text-pretty text-fg">{event.description}</p>
          {isDemo ? (
            <p className="flex items-start gap-2 text-sm text-fg-muted">
              <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
              {t("event.demoData")}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}
