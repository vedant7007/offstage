"use client";

import * as React from "react";
import { Check, DoorOpen, RefreshCw } from "lucide-react";
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

function byDay(sessions: Session[]) {
  const days = new Map<string, Session[]>();
  for (const s of [...sessions].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const key = istDateKey(s.startsAt);
    days.set(key, [...(days.get(key) ?? []), s]);
  }
  return [...days.values()];
}

/** My sessions with what changed, and the whole event to browse. */
export function MySchedule({ data }: { data: MyScheduleResponse }) {
  const t = useT();
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
        className="flex flex-col gap-3 transition-[translate] duration-400 ease-[cubic-bezier(.4,0,.1,1)] starting:translate-y-3"
      >
        <h2 className="kicker flex items-center gap-3 text-fg-muted after:h-px after:flex-1 after:bg-border">
          {formatDayShort(day[0]!.startsAt)}
        </h2>
        <ul className="flex flex-col gap-3">
          {day.map((s) => (
            <li
              key={s.id}
              className={cn(
                "relative flex flex-col gap-2 overflow-hidden rounded-card border bg-surface p-4 pl-5 sm:p-5 sm:pl-6",
                "shadow-[0_20px_40px_-32px_rgb(0_0_0/0.35)] transition-[translate,box-shadow,border-color] duration-300 ease-[cubic-bezier(.4,0,.1,1)]",
                "hover:border-border-strong hover:shadow-[0_28px_48px_-28px_rgb(7_27_223/0.3)] motion-safe:hover:-translate-y-0.5",
                s.change ? "border-pending" : "border-border",
              )}
            >
              <span
                aria-hidden
                className={cn(
                  "absolute inset-y-0 left-0 w-1",
                  s.change ? "bg-pending" : s.mine ? "bg-curtain" : "bg-border",
                )}
              />
              <div className="flex flex-wrap items-center gap-2">
                <TimeRange start={s.startsAt} end={s.endsAt} className="kicker text-fg" />
                {s.change ? (
                  <Badge tone="pending" className="font-mono">
                    <RefreshCw aria-hidden />
                    {t("me.schedule.changed")}: {t(`me.schedule.change.${s.change.kind}`)}
                  </Badge>
                ) : null}
              </div>
              <p
                className={cn(
                  "text-lg leading-snug font-medium tracking-[-0.02em]",
                  s.status === "cancelled" && "line-through",
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
                    className="mt-1 w-fit rounded-full px-4"
                    onClick={() => setAddNote(s.id)}
                    aria-describedby={addNote === s.id ? `add-note-${s.id}` : undefined}
                  >
                    {t("me.schedule.add")}
                  </Button>
                )
              ) : null}
              {addNote === s.id ? (
                <p id={`add-note-${s.id}`} role="status" className="text-sm text-fg-muted">
                  {t("me.schedule.addSoon")}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
    ));

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-card border border-border bg-surface px-4 shadow-[0_20px_40px_-32px_rgb(0_0_0/0.35)]">
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
          {mine.length ? list(mine, false) : <EmptyState title={t("me.schedule.empty")} />}
        </TabsContent>
        <TabsContent value="all" className="flex flex-col gap-5">
          {list(data.sessions, true)}
        </TabsContent>
      </Tabs>
    </div>
  );
}
