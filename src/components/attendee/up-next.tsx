"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, DoorOpen } from "lucide-react";
import type { MyScheduleResponse } from "@/contracts";
import { TimeRange } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { formatRelative } from "@/lib/time";
import { cn } from "@/lib/utils";

type Session = MyScheduleResponse["sessions"][number];

/**
 * Event time on this device: the server's "now" at render, then Date.now() plus the demo clock
 * offset every 30 s, so "On now" and "in 12 min" stay true without a reload.
 */
export function useEventNow(nowIso: string, clockOffsetMs: number) {
  const [now, setNow] = React.useState(() => Date.parse(nowIso));
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now() + clockOffsetMs), 30_000);
    return () => window.clearInterval(id);
  }, [clockOffsetMs]);
  return now;
}

export type Phase = "now" | "done" | "upcoming" | "cancelled";

export function phaseOf(s: Session, now: number): Phase {
  if (s.status === "cancelled") return "cancelled";
  if (s.status === "done" || Date.parse(s.endsAt) <= now) return "done";
  if (s.status === "running" || Date.parse(s.startsAt) <= now) return "now";
  return "upcoming";
}

/** The session I am in right now, or my next one. Cancelled sessions never count. */
export function pickUpNext(sessions: Session[], now: number) {
  return sessions
    .filter((s) => s.mine && (phaseOf(s, now) === "now" || phaseOf(s, now) === "upcoming"))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
}

type Props = {
  sessions: Session[];
  rooms: MyScheduleResponse["rooms"];
  nowIso: string;
  clockOffsetMs: number;
  /** Link to the full schedule; left out on the schedule page itself. */
  href?: string;
  className?: string;
};

/** "Where do I go next": my current or next session, its room and how long until it starts. */
export function UpNext({ sessions, rooms, nowIso, clockOffsetMs, href, className }: Props) {
  const t = useT();
  const now = useEventNow(nowIso, clockOffsetMs);
  const s = pickUpNext(sessions, now);
  if (!s) return null;
  const live = phaseOf(s, now) === "now";
  const r = rooms.find((x) => x.id === s.roomId);
  const room = r ? [r.name, r.building].filter(Boolean).join(", ") : "";

  return (
    <section
      aria-labelledby="up-next-title"
      className={cn(
        "relative isolate flex flex-col gap-3 overflow-hidden rounded-card border border-border bg-surface-raised p-5 shadow-card",
        "motion-safe:transition-[translate,opacity] motion-safe:duration-400 motion-safe:ease-out motion-safe:starting:translate-y-2 motion-safe:starting:opacity-0",
        className,
      )}
    >
      <span aria-hidden className="absolute inset-y-0 left-0 w-1 bg-curtain" />
      <h2 id="up-next-title" className="kicker flex items-center gap-2 text-curtain-text">
        {live ? (
          <span aria-hidden className="relative flex size-2">
            <span className="absolute inset-0 rounded-full bg-curtain motion-safe:animate-ping" />
            <span className="relative size-2 rounded-full bg-curtain" />
          </span>
        ) : null}
        {live ? t("event.sessionStatus.running") : t("board.next")}
        {!live ? <span className="text-fg-muted normal-case">{formatRelative(s.startsAt, now)}</span> : null}
      </h2>
      <p className="text-xl leading-snug font-medium tracking-[-0.02em] text-balance">{s.title}</p>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-sm text-fg-muted">
        <TimeRange start={s.startsAt} end={s.endsAt} className="text-fg" />
        <span className="flex items-center gap-1.5">
          <DoorOpen aria-hidden className="size-4" />
          <span className="sr-only">{t("me.schedule.room")}: </span>
          {room}
        </span>
      </div>
      {s.change ? <p className="text-sm text-pending-text">{s.change.text}</p> : null}
      {href ? (
        <Link
          href={href}
          className="group/link mt-1 inline-flex w-fit items-center gap-1.5 rounded-full text-sm font-medium text-curtain-text underline-offset-4 hover:underline"
        >
          {t("me.tabs.schedule")}
          <ArrowRight
            aria-hidden
            className="size-4 transition-transform duration-200 ease-out motion-safe:group-hover/link:translate-x-0.5"
          />
        </Link>
      ) : null}
    </section>
  );
}
