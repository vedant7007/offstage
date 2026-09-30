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
    byDay(sessions).map((day) => (
      <section key={istDateKey(day[0]!.startsAt)} className="flex flex-col gap-2">
        <h2 className="text-base font-semibold text-fg-muted">{formatDayShort(day[0]!.startsAt)}</h2>
        <ul className="flex flex-col gap-2">
          {day.map((s) => (
            <li
              key={s.id}
              className={cn(
                "flex flex-col gap-1.5 rounded-card border bg-surface p-4",
                s.change ? "border-pending" : "border-border",
              )}
            >
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <TimeRange start={s.startsAt} end={s.endsAt} className="font-semibold" />
                {s.change ? (
                  <Badge tone="pending">
                    <RefreshCw aria-hidden />
                    {t("me.schedule.changed")}: {t(`me.schedule.change.${s.change.kind}`)}
                  </Badge>
                ) : null}
              </div>
              <p className={cn("font-semibold", s.status === "cancelled" && "line-through")}>{s.title}</p>
              {s.change ? <p className="text-sm text-pending-text">{s.change.text}</p> : null}
              <p className="flex items-center gap-2 text-sm text-fg-muted">
                <DoorOpen aria-hidden className="size-4" />
                <span className="sr-only">{t("me.schedule.room")}: </span>
                {rooms.get(s.roomId) ?? ""}
              </p>
              {showAdd ? (
                s.mine ? (
                  <Badge tone="approved" className="mt-1">
                    <Check aria-hidden />
                    {t("me.schedule.added")}
                  </Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="mt-1 w-fit"
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
      <div className="rounded-card border border-border bg-surface px-4">
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
