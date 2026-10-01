import type { ReactNode } from "react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import {
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Clock,
  ListChecks,
  MapPin,
  ScanLine,
  Smartphone,
} from "lucide-react";
import type { CrewShiftsResponse, CrewTasksResponse } from "@/contracts";
import { createApiClient } from "@/lib/api-client";
import { formatRange, formatRelative, formatTime } from "@/lib/time";
import { Alert, Badge, type Tone } from "@/components/ui";
import { Kicker, LivePulse, Reveal } from "@/components/ui/motion";
import { getMe } from "@/components/attendee/server";
import { DeviceSyncSummary } from "@/components/crew/sync-status";
import fx from "@/components/crew/crew.module.css";

export const metadata = { title: "Crew", robots: { index: false } };

type ShiftRow = CrewShiftsResponse["shifts"][number];
type Task = CrewTasksResponse["tasks"][number];

const ASSIGNMENT: Record<ShiftRow["assignment"]["status"], { label: string; tone: Tone }> = {
  assigned: { label: "Assigned", tone: "info" },
  checked_in: { label: "On shift", tone: "approved" },
  missed: { label: "Missed", tone: "danger" },
  released: { label: "Released", tone: "neutral" },
  done: { label: "Done", tone: "neutral" },
};
const RANK: Record<Task["priority"], number> = { urgent: 0, high: 1, normal: 2, low: 3 };

/** Roster and tasks for the signed-in volunteer. Either can be missing; the home still works without them. */
async function crewData(clockOffsetMs: number) {
  const h = await headers();
  const api = createApiClient({ headers: { cookie: h.get("cookie") ?? "" } });
  const [shifts, tasks] = await Promise.allSettled([api.crewShifts(), api.crewTasks()]);
  return {
    // The demo clock, per request: never set the shared offset on the server.
    now: Date.now() + clockOffsetMs,
    shifts: shifts.status === "fulfilled" ? shifts.value.shifts : null,
    tasks: tasks.status === "fulfilled" ? tasks.value.tasks : null,
  };
}

function Panel({
  title,
  icon,
  index,
  children,
}: {
  title: string;
  icon: ReactNode;
  /** Place in the entrance cascade. */
  index: number;
  children: ReactNode;
}) {
  return (
    <Reveal
      as="section"
      index={index}
      className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 depth-2 md:p-6"
    >
      <h2 className="kicker flex items-center gap-2 text-fg-muted [&_svg]:size-4">
        {icon}
        {title}
      </h2>
      {children}
    </Reveal>
  );
}

/** Nothing to show yet: an icon tile, one line on what will appear, and where it comes from. */
function Empty({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="flex items-start gap-4">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-inner bg-curtain-soft text-curtain-soft-fg depth-1 [&_svg]:size-5"
      >
        {icon}
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-lg font-medium">{title}</p>
        <p className="measure-tight text-sm text-fg-muted">{children}</p>
      </div>
    </div>
  );
}

/**
 * The focal card: the shift on now (with how far through it you are) or the next one to come. Times are
 * fixed at render, from the demo clock; the gradient edge marks it as the one card to read first.
 */
function ShiftCard({ row, now }: { row: ShiftRow; now: number }) {
  const start = Date.parse(row.shift.startsAt);
  const end = Date.parse(row.shift.endsAt);
  const onNow = start <= now;
  const through = Math.min(1, Math.max(0, (now - start) / (end - start || 1)));
  const status = ASSIGNMENT[row.assignment.status];
  return (
    <Reveal
      as="section"
      index={1}
      aria-labelledby="shift-title"
      className="edge flex flex-col gap-6 rounded-card bg-surface p-5 depth-2 md:p-6"
    >
      <div className="flex items-center justify-between gap-3">
        <h2 id="shift-title" className="kicker flex items-center gap-2 text-fg-muted [&_svg]:size-4">
          {onNow ? <LivePulse className="text-approved-text" /> : <Clock aria-hidden />}
          {onNow ? "On shift now" : "Your next shift"}
        </h2>
        <Badge tone={status.tone}>{status.label}</Badge>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-3xl font-medium text-balance">{row.shift.role}</p>
        {row.roomName && !row.shift.role.includes(row.roomName) ? (
          <p className="flex items-center gap-2 text-fg-muted">
            <MapPin aria-hidden className="size-4 shrink-0" />
            {row.roomName}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3">
        {onNow ? (
          <div aria-hidden className="h-2 overflow-hidden rounded-full bg-surface-sunken">
            <div
              className={`h-full origin-left rounded-full bg-curtain ${fx.fill}`}
              style={{ scale: `${through} 1` }}
            />
          </div>
        ) : null}
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 font-mono text-sm tabular-nums">
          <span className="text-fg-muted">{formatRange(row.shift.startsAt, row.shift.endsAt)}</span>
          <span className="font-medium">
            {onNow ? `Ends ${formatRelative(end, now)}` : `Starts ${formatRelative(start, now)}`}
          </span>
        </div>
        {row.assignment.checkedInAt ? (
          <p className="text-sm text-fg-muted">Checked in at {formatTime(row.assignment.checkedInAt)}</p>
        ) : null}
      </div>
    </Reveal>
  );
}

export default async function CrewHome() {
  const me = await getMe();
  if (!me) redirect("/login?next=/crew");
  const event = me.memberships.find((m) => m.eventId === me.activeEventId) ?? me.memberships[0];
  if (!event) return <Alert variant="info" title="You are not on an event crew yet." />;

  const { now, shifts, tasks } = await crewData(me.clockOffsetMs ?? 0);
  const firstName = me.user.name.split(" ")[0] || me.user.name;

  // Now, or else the next one still to come.
  const live = (shifts ?? [])
    .filter((s) => s.assignment.status !== "released" && Date.parse(s.shift.endsAt) > now)
    .sort((a, b) => a.shift.startsAt.localeCompare(b.shift.startsAt));
  const shift = live[0];
  const open = (tasks ?? [])
    .filter((t) => t.status === "open" || t.status === "in_progress")
    .sort((a, b) => RANK[a.priority] - RANK[b.priority] || (a.dueAt ?? "~").localeCompare(b.dueAt ?? "~"));

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col">
        <Kicker>{event.eventName}</Kicker>
        <h1 className="mt-3 text-3xl">Hi, {firstName}</h1>
        <p className="measure-lede mt-2 text-fg-muted">
          Thanks for crewing today. Everything for your shift is here.
        </p>
      </header>

      <Reveal>
        <Link
          href="/crew/checkin"
          className="press group flex min-h-28 items-center gap-4 rounded-card bg-curtain p-5 text-on-curtain depth-2 hover:bg-curtain-hover md:p-6"
        >
          <span
            aria-hidden
            className="flex size-14 shrink-0 items-center justify-center rounded-full bg-on-curtain/10 [&_svg]:size-7"
          >
            <ScanLine />
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="text-2xl font-medium">Scan tickets</span>
            <span className="text-sm opacity-85">Works offline and syncs on its own</span>
          </span>
          <ChevronRight
            aria-hidden
            className="size-6 shrink-0 transition-transform duration-(--duration-slow) ease-(--ease-out) motion-safe:group-hover:translate-x-1"
          />
        </Link>
      </Reveal>

      {shifts === null && tasks === null ? (
        <Panel title="Shift and tasks" icon={<Clock aria-hidden />} index={1}>
          <Empty icon={<CalendarClock />} title="Your shift shows here">
            Your event head shares shift times and tasks. Once the roster is live, they appear here.
          </Empty>
        </Panel>
      ) : (
        <>
          {shift ? (
            <ShiftCard row={shift} now={now} />
          ) : (
            <Panel title="Your next shift" icon={<Clock aria-hidden />} index={1}>
              {shifts === null ? (
                <Empty icon={<CalendarClock />} title="Shift times with your event head">
                  Your event head has your shift times. They appear here once the roster is live.
                </Empty>
              ) : (
                <Empty icon={<CalendarClock />} title="No more shifts today">
                  That is your last one. Thank you for your time.
                </Empty>
              )}
            </Panel>
          )}

          <Panel title="Your tasks" icon={<ClipboardList aria-hidden />} index={2}>
            {open.length ? (
              <ul className="flex flex-col divide-y divide-border">
                {open.slice(0, 5).map((t) => (
                  <li
                    key={t.id}
                    className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0"
                  >
                    <span className="min-w-0 flex-1 font-medium">{t.title}</span>
                    {t.priority === "urgent" || t.priority === "high" ? (
                      <Badge tone={t.priority === "urgent" ? "danger" : "pending"}>
                        {t.priority === "urgent" ? "Urgent" : "High"}
                      </Badge>
                    ) : null}
                    {t.dueAt ? (
                      <span className="basis-full font-mono text-xs text-fg-muted tabular-nums">
                        Due {formatTime(t.dueAt)}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty
                icon={<ListChecks />}
                title={tasks === null ? "Tasks come from your event head" : "All clear"}
              >
                {tasks === null
                  ? "Your event head tells you what is next."
                  : "Nothing on your list. Your event head sends the next one here."}
              </Empty>
            )}
          </Panel>
        </>
      )}

      <Panel title="This device" icon={<Smartphone aria-hidden />} index={3}>
        <DeviceSyncSummary />
      </Panel>
    </div>
  );
}
