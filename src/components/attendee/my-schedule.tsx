"use client";

import * as React from "react";
import { CalendarPlus, Check, DoorOpen, Plus, RefreshCw } from "lucide-react";
import type { MyScheduleResponse } from "@/contracts";
import {
  Badge,
  Button,
  EmptyState,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TimeRange,
} from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { formatDayShort, istDateKey } from "@/lib/time";
import { cn } from "@/lib/utils";
import { type Phase, phaseOf, UpNext, useEventNow } from "./up-next";

type Session = MyScheduleResponse["sessions"][number];

const REMINDERS_KEY = "offstage-reminders";

function readReminders() {
  try {
    return localStorage.getItem(REMINDERS_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribeStorage(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

/** How much of the rail from this session's dot to the next one has passed, 0 to 1. */
function railFill(s: Session, next: Session, now: number) {
  const start = Date.parse(s.startsAt);
  const span = Date.parse(next.startsAt) - start;
  if (span <= 0) return now >= start ? 1 : 0;
  return Math.min(1, Math.max(0, (now - start) / span));
}

/** The dot on the timeline rail: done sessions are filled, the live one pulses, upcoming ones are rings. */
function railDot(s: Session, phase: Phase) {
  const at = "absolute top-[1.375rem] left-0 size-3 rounded-full sm:top-[1.625rem]";
  if (phase === "now") return <span aria-hidden className={cn("live-pulse text-curtain", at)} />;
  return (
    <span
      aria-hidden
      className={cn(
        at,
        "border-2 bg-bg",
        phase === "done"
          ? "border-border-strong bg-border-strong"
          : s.change && phase !== "cancelled"
            ? "border-pending"
            : s.mine && phase !== "cancelled"
              ? "border-curtain"
              : "border-border-strong",
      )}
    />
  );
}

function byDay(sessions: Session[]) {
  const days = new Map<string, Session[]>();
  for (const s of [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = istDateKey(s.startsAt);
    days.set(key, [...(days.get(key) ?? []), s]);
  }
  return [...days.values()];
}

type Props = {
  data: MyScheduleResponse;
  /** Event time when the page rendered, and the demo clock offset to keep it ticking. */
  nowIso: string;
  clockOffsetMs: number;
};

/** Where I go next, my sessions with what changed, and the whole event to browse. */
export function MySchedule({ data, nowIso, clockOffsetMs }: Props) {
  const t = useT();
  const now = useEventNow(nowIso, clockOffsetMs);
  const rooms = React.useMemo(() => new Map(data.rooms.map((r) => [r.id, r.name])), [data.rooms]);
  const mine = data.sessions.filter((s) => s.mine);
  // Saved on this phone until a preferences endpoint exists (#65). Server render starts "off".
  const stored = React.useSyncExternalStore(subscribeStorage, readReminders, () => false);
  const [override, setOverride] = React.useState<boolean | null>(null);
  const reminders = override ?? stored;
  const [addNote, setAddNote] = React.useState<string | null>(null);

  const toggleReminders = (on: boolean) => {
    setOverride(on);
    try {
      localStorage.setItem(REMINDERS_KEY, on ? "1" : "0");
    } catch {
      // Not saved; the choice still applies for this visit.
    }
  };

  const list = (sessions: Session[], showAdd: boolean) =>
    byDay(sessions).map((day, i) => (
      <section
        key={istDateKey(day[0]!.startsAt)}
        style={{ transitionDelay: `${Math.min(i, 4) * 60}ms` }}
        className="flex flex-col gap-3 transition-[translate,opacity] duration-400 ease-out motion-safe:starting:translate-y-3 motion-safe:starting:opacity-0"
      >
        <h2 className="kicker flex items-center gap-3 text-fg-muted after:h-px after:flex-1 after:bg-border">
          {formatDayShort(day[0]!.startsAt)}
        </h2>
        {/* A timeline rail runs down the left: dots per session, and the part of the day that has
            passed fills in, top to bottom, when the list appears. */}
        <ul className="flex flex-col gap-3">
          {day.map((s, j) => {
            const phase = phaseOf(s, now);
            const next = day[j + 1];
            return (
              <li key={s.id} aria-current={phase === "now" ? "time" : undefined} className="relative pl-7">
                {next ? (
                  <span
                    aria-hidden
                    className="absolute top-7 -bottom-10 left-[5.5px] w-px bg-border sm:top-8 sm:-bottom-11"
                  >
                    <span
                      style={
                        {
                          "--p": railFill(s, next, now),
                          transitionDelay: `${Math.min(j, 8) * 80}ms`,
                        } as React.CSSProperties
                      }
                      className="absolute inset-0 origin-top scale-y-(--p) bg-curtain motion-safe:transition-[scale] motion-safe:duration-(--duration-slower) motion-safe:ease-(--ease-out) motion-safe:starting:scale-y-0"
                    />
                  </span>
                ) : null}
                {railDot(s, phase)}
                <div
                  className={cn(
                    "spot lift flex flex-col gap-2 rounded-card border bg-surface p-4 depth-2 sm:p-5",
                    // Only my own current session gets the spotlight; others just carry the badge.
                    s.change
                      ? "border-pending"
                      : phase === "now" && s.mine
                        ? "border-curtain"
                        : "border-border",
                    phase === "now" && s.mine && "bg-surface-raised",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <TimeRange
                      start={s.startsAt}
                      end={s.endsAt}
                      className={cn(
                        "font-mono text-sm font-medium",
                        phase === "done" ? "text-fg-muted" : "text-fg",
                      )}
                    />
                    {phase === "now" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-curtain px-2.5 py-0.5 font-mono text-xs font-medium text-on-curtain">
                        <span
                          aria-hidden
                          className="size-1.5 rounded-full bg-on-curtain motion-safe:animate-pulse"
                        />
                        {t("event.sessionStatus.running")}
                      </span>
                    ) : phase === "done" ? (
                      <Badge tone="neutral" className="font-mono">
                        {t("event.sessionStatus.done")}
                      </Badge>
                    ) : null}
                    {s.change ? (
                      <Badge tone="pending" className="font-mono">
                        <RefreshCw aria-hidden />
                        {t("me.schedule.changed")}: {t(`me.schedule.change.${s.change.kind}`)}
                      </Badge>
                    ) : null}
                  </div>
                  <p
                    className={cn(
                      "text-lg leading-snug font-medium tracking-[-0.02em] text-balance",
                      phase === "cancelled" && "line-through",
                      (phase === "done" || phase === "cancelled") && "text-fg-muted",
                    )}
                  >
                    {s.title}
                  </p>
                  {s.change ? <p className="text-sm text-pending-text">{s.change.text}</p> : null}
                  <p className="flex items-center gap-2 font-mono text-sm text-fg-muted">
                    <DoorOpen aria-hidden className="size-4" />
                    <span className="sr-only">{t("me.schedule.room")}: </span>
                    {rooms.get(s.roomId) ?? ""}
                  </p>
                  {showAdd ? (
                    s.mine ? (
                      <Badge tone="approved" className="mt-1 font-mono">
                        <Check aria-hidden />
                        {t("me.schedule.added")}
                      </Badge>
                    ) : (
                      <Button
                        size="sm"
                        variant="secondary"
                        className="mt-1 w-fit px-4"
                        onClick={() => setAddNote(s.id)}
                        aria-label={`${t("me.schedule.add")}: ${s.title}`}
                        aria-describedby={addNote === s.id ? `add-note-${s.id}` : undefined}
                      >
                        <Plus aria-hidden />
                        {t("me.schedule.add")}
                      </Button>
                    )
                  ) : null}
                  {addNote === s.id ? (
                    <p id={`add-note-${s.id}`} role="status" className="text-sm text-fg-muted">
                      {t("me.schedule.addSoon")}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    ));

  return (
    <div className="flex flex-col gap-4">
      <UpNext sessions={data.sessions} rooms={data.rooms} nowIso={nowIso} clockOffsetMs={clockOffsetMs} />
      <div className="rounded-card border border-border bg-surface px-4 depth-1">
        <Switch
          checked={reminders}
          onCheckedChange={toggleReminders}
          label={t("me.schedule.reminders")}
          description={t("me.schedule.remindersSoon")}
        />
      </div>
      <Tabs defaultValue="mine">
        <TabsList>
          <TabsTrigger value="mine">{t("me.schedule.mine")}</TabsTrigger>
          <TabsTrigger value="all">{t("me.schedule.all")}</TabsTrigger>
        </TabsList>
        <TabsContent value="mine" className="flex flex-col gap-5">
          {mine.length ? (
            list(mine, false)
          ) : (
            <EmptyState icon={<CalendarPlus aria-hidden />} title={t("me.schedule.empty")} />
          )}
        </TabsContent>
        <TabsContent value="all" className="flex flex-col gap-5">
          {list(data.sessions, true)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
