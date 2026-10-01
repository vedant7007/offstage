import Link from "next/link";
import { DoorOpen, Layers, Users } from "lucide-react";
import type { PublicEventResponse, SessionStatus } from "@/contracts";
import { Badge, Button, EmptyState, TimeRange, type Tone } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { formatDayShort, istDateKey } from "@/lib/time";
import { cn } from "@/lib/utils";
import { Reveal, SlidingIndicator } from "@/components/ui/motion";
import { SectionHead } from "@/components/public/event/section-head";

type PublicSession = PublicEventResponse["sessions"][number];

const STATUS_TONE: Record<SessionStatus, Tone | null> = {
  scheduled: null,
  running: "approved",
  delayed: "pending",
  cancelled: "neutral",
  done: "neutral",
};

/** Days the event runs, as IST date keys, in order. */
export function eventDays(sessions: PublicSession[]): string[] {
  return [...new Set(sessions.map((s) => istDateKey(s.startsAt)))].sort();
}

type Props = {
  data: PublicEventResponse;
  day: string;
  track: string | null;
  cue: string;
};

/**
 * Day tabs and track filter are plain links with query parameters, so the schedule works with
 * JavaScript turned off and every filtered view has its own URL.
 */
export async function Schedule({ data, day, track, cue }: Props) {
  const t = await getT();
  const base = `/e/${data.event.slug}`;
  const days = eventDays(data.sessions);
  const rooms = new Map(data.rooms.map((r) => [r.id, r]));
  const tracks = new Map(data.tracks.map((tr) => [tr.id, tr]));
  const speakers = new Map(data.speakers.map((s) => [s.id, s]));
  const href = (d: string, tr: string | null) => {
    const q = new URLSearchParams({ day: d });
    if (tr) q.set("track", tr);
    return `${base}?${q.toString()}#schedule`;
  };

  const sessions = data.sessions
    .filter((s) => istDateKey(s.startsAt) === day && (!track || s.trackId === track))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title));

  // Filter pills. The active fill is a separate span that glides to the new pill when the filter
  // changes (a view transition on the navigation); without support it simply moves.
  const pill = (active: boolean) =>
    cn(
      "press relative isolate inline-flex min-h-11 items-center rounded-full border-[1.5px] px-4 text-sm font-medium whitespace-nowrap md:min-h-9",
      active ? "border-transparent text-on-curtain" : "border-border-strong text-fg hover:bg-surface",
    );
  const fill = (name: string) => (
    <SlidingIndicator name={name} className="absolute -inset-[1.5px] -z-10 rounded-full bg-curtain" />
  );

  return (
    <section id="schedule" aria-labelledby="schedule-title" className="flex scroll-mt-20 flex-col gap-8">
      <SectionHead cue={cue} id="schedule-title">
        {t("event.scheduleTitle")}
      </SectionHead>

      <div className="flex flex-col gap-3">
        <nav aria-label={t("event.dayNav")}>
          <ul className="flex gap-2 overflow-x-auto pb-1">
            {days.map((d) => {
              const first = data.sessions.find((s) => istDateKey(s.startsAt) === d);
              const active = d === day;
              return (
                <li key={d}>
                  <Link
                    href={href(d, track)}
                    aria-current={active ? "true" : undefined}
                    className={pill(active)}
                  >
                    {active ? fill("schedule-day") : null}
                    {first ? formatDayShort(first.startsAt) : d}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        {data.tracks.length ? (
          <nav aria-label={t("event.trackFilter")}>
            <ul className="flex flex-wrap gap-2">
              {[null, ...data.tracks.map((tr) => tr.id)].map((id) => {
                const active = id === track;
                return (
                  <li key={id ?? "all"}>
                    <Link
                      href={href(day, id)}
                      aria-current={active ? "true" : undefined}
                      className={pill(active)}
                    >
                      {active ? fill("schedule-track") : null}
                      {id ? tracks.get(id)?.name : t("event.allTracks")}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        ) : null}
      </div>

      {sessions.length === 0 ? (
        <EmptyState title={t("event.noSessions")} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 md:gap-6">
          {sessions.map((s, i) => {
            const room = rooms.get(s.roomId);
            const tr = s.trackId ? tracks.get(s.trackId) : undefined;
            const names = s.speakerIds.map((id) => speakers.get(id)?.name).filter(Boolean);
            const tone = STATUS_TONE[s.status];
            const full = s.capacity > 0 && s.registeredCount >= s.capacity;
            const canAdd = s.status === "scheduled" || s.status === "delayed";
            const titleId = `session-${s.id}`;
            const hintId = `${titleId}-hint`;
            return (
              <Reveal as="li" key={s.id} index={i % 2}>
                <article
                  aria-labelledby={titleId}
                  className={cn(
                    "spot spot-edge lift flex h-full flex-col gap-3 rounded-card border bg-surface p-5 depth-2 md:p-6",
                    s.status === "delayed" ? "border-pending" : "border-border",
                    (s.status === "done" || s.status === "cancelled") && "bg-surface/60",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <TimeRange
                      start={s.startsAt}
                      end={s.endsAt}
                      className="font-mono text-xs font-medium tracking-[0.04em] text-curtain-text tabular-nums"
                    />
                    <Badge tone="outline">{t(`event.sessionKind.${s.kind}`)}</Badge>
                    {tone ? <Badge tone={tone}>{t(`event.sessionStatus.${s.status}`)}</Badge> : null}
                  </div>
                  <h3
                    id={titleId}
                    className={cn("text-xl text-balance", s.status === "cancelled" && "line-through")}
                  >
                    {s.title}
                  </h3>
                  {s.delayMinutes > 0 ? (
                    <p className="text-sm font-medium text-pending-text">
                      {t("event.runningLate", { minutes: s.delayMinutes })}
                    </p>
                  ) : null}
                  <ul className="flex flex-col gap-1 text-sm text-fg-muted">
                    {room ? (
                      <li className="flex items-center gap-2">
                        <DoorOpen aria-hidden className="size-4 shrink-0" />
                        {room.name}
                        {room.building ? `, ${room.building}` : ""}
                      </li>
                    ) : null}
                    {tr ? (
                      <li className="flex items-center gap-2">
                        <Layers aria-hidden className="size-4 shrink-0" />
                        {tr.name}
                      </li>
                    ) : null}
                    {names.length ? (
                      <li className="flex items-center gap-2">
                        <Users aria-hidden className="size-4 shrink-0" />
                        {t("event.with", { names: names.join(", ") })}
                      </li>
                    ) : null}
                  </ul>
                  <div className="mt-auto flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
                    <p className="font-mono text-xs text-fg-muted tabular-nums">
                      {t("event.seatsSession", { registered: s.registeredCount, capacity: s.capacity })}
                      {full ? (
                        <Badge tone="pending" className="ml-2">
                          {t("event.sessionFull")}
                        </Badge>
                      ) : null}
                    </p>
                    {canAdd ? (
                      <>
                        <Button asChild size="sm" variant="secondary">
                          <Link
                            href={`/me/schedule?add=${encodeURIComponent(s.id)}`}
                            aria-describedby={hintId}
                          >
                            {t("event.addToSchedule")}
                          </Link>
                        </Button>
                        <span id={hintId} className="sr-only">
                          {t("event.addToScheduleHint")}
                        </span>
                      </>
                    ) : null}
                  </div>
                </article>
              </Reveal>
            );
          })}
        </ul>
      )}
    </section>
  );
}
