import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircleQuestionMark, Presentation } from "lucide-react";
import type { PublicStatusResponse } from "@/contracts";
import { Alert, Button, LanguageSwitcher, ThemeToggle, TimeRange } from "@/components/ui";
import { getPublicEvent, getPublicStatus } from "@/components/public/data";
import { BoardClock, LiveRefresh } from "@/components/public/status/live-refresh";
import { LivePulse, NumberTicker } from "@/components/ui/motion";
import { getT } from "@/lib/i18n/server";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { AnnouncementLabel } from "@/components/public/announcement-label";

type Slot = NonNullable<PublicStatusResponse["rooms"][number]["current"]>;

export async function generateMetadata({ params }: PageProps<"/e/[slug]/status">): Promise<Metadata> {
  const { slug } = await params;
  const [event, t] = await Promise.all([getPublicEvent(slug), getT()]);
  return event ? { title: `${t("board.title")}: ${event.data.event.name}` } : {};
}

/**
 * Venue status board: what is on in each room now and next, delays and announcements.
 * Large, high contrast type; `?kiosk=1` removes all chrome and scales up for a projector.
 */
export default async function StatusPage({ params, searchParams }: PageProps<"/e/[slug]/status">) {
  const { slug } = await params;
  const [status, event, t, query, head] = await Promise.all([
    getPublicStatus(slug),
    getPublicEvent(slug),
    getT(),
    searchParams,
    headers(),
  ]);
  if (!status || !event) notFound();
  const kiosk = query.kiosk === "1";
  const { data } = status;
  const helpdeskPath = "/me/chat";
  const host = head.get("host");

  const emergencies = data.announcements.filter((a) => a.category === "emergency");
  const others = data.announcements
    .filter((a) => a.category !== "emergency")
    .sort((a, b) => (b.sentAt ?? "").localeCompare(a.sentAt ?? ""));
  // Rooms with something on come first, then by what starts soonest, so the eye lands on now.
  const soonest = (r: PublicStatusResponse["rooms"][number]) =>
    r.current ? `0${r.current.startsAt}` : r.next ? `1${r.next.startsAt}` : "2";
  const rooms = [...data.rooms].sort((a, b) => soonest(a).localeCompare(soonest(b)));
  // The board's figures, all counted from the status data. They roll when a refresh changes them.
  const slots = data.rooms.flatMap((r) => [r.current, r.next]).filter((x) => x !== undefined);
  const figures = [
    {
      key: "now",
      label: t("event.sessionStatus.running"),
      value: data.rooms.filter((r) => r.current).length,
    },
    { key: "next", label: t("board.next"), value: data.rooms.filter((r) => r.next).length },
    {
      key: "late",
      label: t("event.sessionStatus.delayed"),
      value: slots.filter((x) => x.status === "delayed" || x.delayMinutes > 0).length,
      tone: "text-pending-text",
    },
    { key: "news", label: t("board.announcements"), value: data.announcements.length },
  ];
  // TimeRange prints "IST" at a fixed small size; scale it with the time on the projector.
  const zone = kiosk ? "[&>span]:text-[0.6em]" : undefined;

  const slot = (label: string, s: Slot | undefined, empty: string, big: boolean) => (
    <div className="flex flex-col gap-1">
      <p
        className={cn(
          "font-mono font-medium tracking-[0.12em] text-fg-muted uppercase",
          kiosk ? "text-lg" : "text-xs",
        )}
      >
        {label}
      </p>
      {s ? (
        <>
          <p
            className={cn(
              "font-medium tracking-[-0.02em]",
              big ? (kiosk ? "text-4xl" : "text-2xl") : kiosk ? "text-2xl" : "text-lg",
              s.status === "cancelled" && "line-through",
            )}
          >
            {s.title}
          </p>
          <TimeRange
            start={s.startsAt}
            end={s.endsAt}
            className={cn("font-mono", kiosk ? "text-2xl" : "text-base", zone)}
          />
          {s.status === "cancelled" ? (
            <p className={cn("font-medium text-danger-text", kiosk ? "text-2xl" : "text-base")}>
              {t("event.cancelledNote")}
            </p>
          ) : s.delayMinutes > 0 ? (
            <p className={cn("font-medium text-pending-text", kiosk ? "text-2xl" : "text-base")}>
              {t("event.runningLate", { minutes: s.delayMinutes })}
            </p>
          ) : null}
        </>
      ) : (
        <p className={cn("text-fg-muted", kiosk ? "text-2xl" : "text-lg")}>{empty}</p>
      )}
    </div>
  );

  return (
    <div className={cn("min-h-dvh", kiosk && "text-xl")}>
      {kiosk ? null : (
        <header className="sticky top-0 z-(--z-appbar) border-b border-border bg-bg/90 backdrop-blur-sm">
          <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-4 md:px-8">
            <Link
              href={`/e/${slug}`}
              className="inline-flex min-h-11 items-center gap-2 font-medium text-curtain-text underline underline-offset-4"
            >
              <ArrowLeft aria-hidden className="size-4" />
              {t("board.backToEvent")}
            </Link>
            <div className="flex items-center gap-1">
              <Button asChild size="sm" variant="secondary" className="hidden rounded-full sm:inline-flex">
                <Link href={`/e/${slug}/status?kiosk=1`}>
                  <Presentation aria-hidden />
                  {t("board.projector")}
                </Link>
              </Button>
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </div>
        </header>
      )}

      <main
        id="main"
        className={cn(
          "mx-auto flex flex-col gap-10 px-4 py-8 md:px-8",
          kiosk ? "max-w-none lg:px-12" : "max-w-6xl",
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-2">
            <p
              className={cn(
                "flex items-center gap-3 font-mono font-medium tracking-[0.12em] text-curtain-text uppercase",
                kiosk ? "text-xl" : "text-xs",
              )}
            >
              {event.data.event.name}
              <span aria-hidden className="h-px w-8 bg-current" />
            </p>
            <h1
              className={cn(
                "font-medium tracking-[-0.04em]",
                kiosk ? "text-[4.5rem]/[1.05]" : "text-4xl/[1.05] md:text-[3.5rem]/[1.05]",
              )}
            >
              {t("board.title")}
            </h1>
          </div>
          <div className="flex flex-col items-start gap-2 md:items-end">
            <BoardClock
              now={data.now}
              className={kiosk ? "text-[clamp(4rem,7vw,6.5rem)]/none" : "text-5xl/none md:text-6xl/none"}
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <LiveRefresh className={kiosk ? "text-lg" : undefined} />
              <p className={cn("font-mono text-fg-muted", kiosk ? "text-lg" : "text-xs")}>
                {t("board.updated", { time: formatTime(data.now) })}
              </p>
            </div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border depth-2 md:grid-cols-4">
          {figures.map((f) => (
            <div key={f.key} className="flex flex-col gap-2 bg-surface p-4 md:p-6">
              <dt
                className={cn(
                  "font-mono font-medium tracking-[0.12em] text-fg-muted uppercase",
                  kiosk ? "text-base" : "text-xs",
                )}
              >
                {f.label}
              </dt>
              <dd
                className={cn(
                  "font-medium tracking-[-0.04em]",
                  kiosk ? "text-6xl/none" : "text-4xl/none md:text-5xl/none",
                  f.value > 0 && f.tone,
                )}
              >
                <NumberTicker value={f.value} mode="roll" />
              </dd>
            </div>
          ))}
        </dl>

        {emergencies.map((a) => (
          <Alert key={a.id} variant="emergency" title={a.title} className={kiosk ? "text-xl" : undefined}>
            {a.body}
            <AnnouncementLabel announcement={a} onColour />
          </Alert>
        ))}

        <div
          className={cn(
            "flex flex-col gap-10",
            kiosk && "xl:grid xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start xl:gap-8",
          )}
        >
          <section aria-labelledby="rooms-title" className="flex flex-col gap-4">
            <h2 id="rooms-title" className="sr-only">
              {t("board.rooms")}
            </h2>
            <ul className="grid gap-4 md:grid-cols-2">
              {rooms.map((r) => (
                <li key={r.roomId}>
                  <article
                    aria-labelledby={`room-${r.roomId}`}
                    className={cn(
                      "flex h-full flex-col gap-5 rounded-card bg-surface p-6 depth-2",
                      kiosk ? "border-2 border-border-strong" : "border border-border",
                    )}
                  >
                    <h3
                      id={`room-${r.roomId}`}
                      className={cn("flex items-center gap-2.5", kiosk ? "text-3xl" : "text-xl")}
                    >
                      {r.current ? (
                        <LivePulse className="size-2.5" />
                      ) : (
                        <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-border-strong" />
                      )}
                      {r.roomName}
                    </h3>
                    {slot(t("board.now"), r.current, t("board.nothingNow"), true)}
                    <div className="border-t border-border pt-4">
                      {slot(t("board.next"), r.next, t("board.nothingNext"), false)}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </section>

          {others.length ? (
            <section aria-labelledby="board-announcements" className="flex flex-col gap-4">
              <h2 id="board-announcements" className={kiosk ? "text-3xl" : "text-2xl"}>
                {t("board.announcements")}
              </h2>
              <ul className="flex flex-col gap-3">
                {others.map((a) => (
                  <li
                    key={a.id}
                    className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-5 depth-2"
                  >
                    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                      <p className={cn("font-medium tracking-[-0.015em]", kiosk ? "text-2xl" : "text-lg")}>
                        {a.title}
                      </p>
                      {a.sentAt ? (
                        <time
                          dateTime={a.sentAt}
                          className={cn("font-mono text-fg-muted", kiosk ? "text-base" : "text-xs")}
                        >
                          {formatTime(a.sentAt)} {t("time.ist")}
                        </time>
                      ) : null}
                    </div>
                    <p className={kiosk ? "text-xl" : "text-base"}>{a.body}</p>
                    <AnnouncementLabel announcement={a} className={kiosk ? "text-base" : undefined} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>

        <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <MessageCircleQuestionMark
            aria-hidden
            className={cn("text-agent-text", kiosk ? "size-8" : "size-5")}
          />
          {kiosk ? (
            <p className="text-2xl font-medium">
              {t("board.helpdeskAt", { url: `${host ?? ""}${helpdeskPath}` })}
            </p>
          ) : (
            <Button asChild variant="secondary" className="rounded-full">
              <Link href={helpdeskPath}>{t("board.askHelpdesk")}</Link>
            </Button>
          )}
        </footer>
      </main>
    </div>
  );
}
