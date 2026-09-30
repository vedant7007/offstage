import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { ArrowLeft, MessageCircleQuestionMark, Presentation } from "lucide-react";
import type { PublicStatusResponse } from "@/contracts";
import { Alert, Button, LanguageSwitcher, ThemeToggle, TimeRange } from "@/components/ui";
import { getPublicEvent, getPublicStatus } from "@/components/public/data";
import { LiveRefresh } from "@/components/public/status/live-refresh";
import { getT } from "@/lib/i18n/server";
import { formatTime } from "@/lib/time";
import { cn } from "@/lib/utils";

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

  const slot = (label: string, s: Slot | undefined, empty: string, big: boolean) => (
    <div className="flex flex-col gap-1">
      <p className={cn("font-semibold tracking-wide text-fg-muted uppercase", kiosk ? "text-lg" : "text-sm")}>
        {label}
      </p>
      {s ? (
        <>
          <p
            className={cn(
              "font-semibold",
              big ? (kiosk ? "text-4xl" : "text-2xl") : kiosk ? "text-2xl" : "text-lg",
              s.status === "cancelled" && "line-through",
            )}
          >
            {s.title}
          </p>
          <TimeRange start={s.startsAt} end={s.endsAt} className={kiosk ? "text-2xl" : "text-lg"} />
          {s.status === "cancelled" ? (
            <p className={cn("font-semibold text-danger-text", kiosk ? "text-2xl" : "text-base")}>
              {t("event.cancelledNote")}
            </p>
          ) : s.delayMinutes > 0 ? (
            <p className={cn("font-semibold text-pending-text", kiosk ? "text-2xl" : "text-base")}>
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
        <header className="border-b border-border">
          <div className="mx-auto flex min-h-16 max-w-6xl flex-wrap items-center justify-between gap-2 px-4 md:px-8">
            <Link
              href={`/e/${slug}`}
              className="inline-flex min-h-11 items-center gap-2 font-medium text-curtain-text underline underline-offset-4"
            >
              <ArrowLeft aria-hidden className="size-4" />
              {t("board.backToEvent")}
            </Link>
            <div className="flex items-center gap-1">
              <Button asChild size="sm" variant="ghost">
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
          "mx-auto flex flex-col gap-8 px-4 py-6 md:px-8",
          kiosk ? "max-w-none lg:px-12" : "max-w-6xl",
        )}
      >
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <p className={cn("font-semibold text-curtain-text", kiosk ? "text-2xl" : "text-base")}>
              {event.data.event.name}
            </p>
            <h1 className={cn("font-display font-bold", kiosk ? "text-4xl" : "text-3xl md:text-4xl")}>
              {t("board.title")}
            </h1>
          </div>
          <div className="flex flex-col items-start gap-1 md:items-end">
            <LiveRefresh className={kiosk ? "text-lg" : undefined} />
            <p className={cn("text-fg-muted", kiosk ? "text-lg" : "text-sm")}>
              {t("board.updated", { time: formatTime(data.now) })}
            </p>
          </div>
        </div>

        {emergencies.map((a) => (
          <Alert key={a.id} variant="emergency" title={a.title} className={kiosk ? "text-xl" : undefined}>
            {a.body}
          </Alert>
        ))}

        <section aria-labelledby="rooms-title" className="flex flex-col gap-4">
          <h2 id="rooms-title" className="sr-only">
            {t("board.rooms")}
          </h2>
          <ul className="grid gap-4 md:grid-cols-2">
            {data.rooms.map((r) => (
              <li key={r.roomId}>
                <article
                  aria-labelledby={`room-${r.roomId}`}
                  className="flex h-full flex-col gap-4 rounded-card border-2 border-border-strong bg-surface p-5"
                >
                  <h3 id={`room-${r.roomId}`} className={cn("font-bold", kiosk ? "text-3xl" : "text-xl")}>
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
          <section aria-labelledby="board-announcements" className="flex flex-col gap-3">
            <h2 id="board-announcements" className={cn("font-semibold", kiosk ? "text-3xl" : "text-xl")}>
              {t("board.announcements")}
            </h2>
            <ul className="flex flex-col gap-3">
              {others.map((a) => (
                <li key={a.id} className="rounded-card border border-border bg-surface p-4">
                  <p className={cn("font-semibold", kiosk ? "text-2xl" : "text-lg")}>{a.title}</p>
                  <p className={kiosk ? "text-xl" : "text-base"}>{a.body}</p>
                  {a.sentAt ? (
                    <time dateTime={a.sentAt} className="text-sm text-fg-muted">
                      {formatTime(a.sentAt)} {t("time.ist")}
                    </time>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <footer className="flex flex-wrap items-center gap-3 border-t border-border pt-6">
          <MessageCircleQuestionMark
            aria-hidden
            className={cn("text-agent-text", kiosk ? "size-8" : "size-5")}
          />
          {kiosk ? (
            <p className="text-2xl font-semibold">
              {t("board.helpdeskAt", { url: `${host ?? ""}${helpdeskPath}` })}
            </p>
          ) : (
            <Button asChild variant="secondary">
              <Link href={helpdeskPath}>{t("board.askHelpdesk")}</Link>
            </Button>
          )}
        </footer>
      </main>
    </div>
  );
}
