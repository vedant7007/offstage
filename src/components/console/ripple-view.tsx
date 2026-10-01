import { CalendarClock, DoorOpen, FileText, Megaphone, UserRound, Users } from "lucide-react";
import type { Ripple, ScheduleOption } from "@/contracts";
import { Badge, Card, CardContent, CardHeader, CardTitle, InfoChip } from "@/components/ui";
import { channelName, sentence } from "./text";

const METRIC: Record<string, string> = {
  movedSessions: "Sessions moved",
  cancelledSessions: "Cancelled",
  roomChanges: "Room changes",
  minutesShifted: "Minutes shifted",
  attendeesAffected: "Attendees affected",
  capacityShortfall: "Seats short",
  trackBreaks: "Track breaks",
};

function Group({
  icon,
  title,
  count,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 depth-2"
    >
      <h3 className="flex items-center gap-2 text-sm font-medium [&_svg]:size-4 [&_svg]:text-curtain-text">
        {icon}
        {title}
        <Badge tone="neutral">{count}</Badge>
      </h3>
      {children}
    </section>
  );
}

/** Everything one plan touches: sessions, rooms, people, messages and helpdesk facts. */
export function RippleView({ ripple }: { ripple: Ripple }) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      <Group icon={<CalendarClock aria-hidden />} title="Sessions" count={ripple.sessions.length}>
        <ul className="flex flex-col gap-1.5">
          {ripple.sessions.map((s) => (
            <li key={s.id} className="rounded-[10px] border border-border bg-surface-raised p-2.5">
              <p className="font-medium">{s.title}</p>
              <p className="text-sm text-fg-muted">{s.change}</p>
            </li>
          ))}
        </ul>
      </Group>

      <Group icon={<Users aria-hidden />} title="Attendees" count={ripple.attendees.count}>
        <p className="text-sm text-fg-muted">
          {ripple.attendees.count} registered people are affected
          {ripple.attendees.sample.length ? ", including:" : "."}
        </p>
        {ripple.attendees.sample.length ? (
          <ul className="flex flex-wrap gap-1.5">
            {ripple.attendees.sample.map((a) => (
              <li key={a.registrationId}>
                <InfoChip tone="outline">{a.displayName}</InfoChip>
              </li>
            ))}
          </ul>
        ) : null}
      </Group>

      <Group icon={<UserRound aria-hidden />} title="Volunteers" count={ripple.volunteers.length}>
        {ripple.volunteers.length ? (
          <ul className="flex flex-col gap-1">
            {ripple.volunteers.map((v) => (
              <li key={`${v.id}:${v.change}`} className="text-sm">
                <span className="font-medium">{v.displayName}</span>
                <span className="text-fg-muted">: {v.change}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">No shift changes.</p>
        )}
      </Group>

      <Group icon={<Megaphone aria-hidden />} title="Announcements" count={ripple.announcements.length}>
        <ul className="flex flex-col gap-1.5">
          {ripple.announcements.map((a, i) => (
            <li key={i} className="flex flex-wrap items-center gap-1.5 text-sm">
              <span>
                {a.recipients} people ({a.segment.type === "session" ? "session attendees" : a.segment.type})
                on
              </span>
              {a.channels.map((c) => (
                <InfoChip key={c} tone="outline">
                  {channelName(c)}
                </InfoChip>
              ))}
            </li>
          ))}
        </ul>
      </Group>

      <Group icon={<DoorOpen aria-hidden />} title="Rooms" count={ripple.rooms.length}>
        <ul className="flex flex-wrap gap-1.5">
          {ripple.rooms.map((r) => (
            <li key={r.id}>
              <InfoChip tone="outline">{r.name}</InfoChip>
            </li>
          ))}
        </ul>
      </Group>

      <Group icon={<FileText aria-hidden />} title="Helpdesk answers" count={ripple.kbAnswers.length}>
        {ripple.kbAnswers.length ? (
          <ul className="flex flex-col gap-1 text-sm">
            {ripple.kbAnswers.map((k) => (
              <li key={k.docId}>
                <span className="font-medium">{k.title}</span>
                <span className="text-fg-muted">: {k.change}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">No helpdesk facts change.</p>
        )}
      </Group>
    </div>
  );
}

/** The solver's options with their metrics; the chosen one is marked. */
export function OptionCards({ options }: { options: ScheduleOption[] }) {
  return (
    <ul className="grid gap-3 md:grid-cols-3">
      {options.map((o) => (
        <li key={o.id}>
          <Card
            className={
              o.chosen
                ? "h-full border-curtain shadow-[0_0_0_1px_var(--curtain),var(--shadow-card)]"
                : "h-full"
            }
          >
            <CardHeader>
              <CardTitle className="text-base">{sentence(o.label)}</CardTitle>
              {o.chosen ? <Badge tone="approved">Proposed</Badge> : <Badge tone="neutral">Considered</Badge>}
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-sm">
                {Object.entries(o.metrics).map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-fg-muted">{METRIC[k] ?? k}</dt>
                    <dd className="text-right font-mono tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
