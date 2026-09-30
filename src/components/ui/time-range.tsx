"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { formatDayShort, formatRange, formatTime, toUtcIso } from "@/lib/time";

type TimeRangeProps = {
  /** UTC instant, as stored. */
  start: Date | string;
  /** Leave out, or pass the same instant, for a single time. */
  end?: Date | string;
  /** Prefix the day, such as "Sat, 24 Oct". */
  withDate?: boolean;
  /** Append "IST". On by default for anything a visitor from another timezone might read. */
  showZone?: boolean;
  className?: string;
};

/** Session or shift time in India Standard Time, whatever the viewer's device timezone. */
function TimeRange({ start, end, withDate = false, showZone = true, className }: TimeRangeProps) {
  const t = useT();
  const single = end === undefined || toUtcIso(start) === toUtcIso(end);
  // formatRange already writes both full dates when the range crosses an IST day.
  const crossesDay = !single && formatDayShort(start) !== formatDayShort(end);
  const time = single ? formatTime(start) : formatRange(start, end);
  const text = withDate && !crossesDay ? `${formatDayShort(start)}, ${time}` : time;
  const dateTime = single ? toUtcIso(start) : `${toUtcIso(start)}/${toUtcIso(end)}`;
  return (
    <span className={cn("tabular-nums", className)}>
      <time dateTime={dateTime}>{text}</time>
      {showZone ? <span className="ml-1 text-xs text-fg-muted">{t("time.ist")}</span> : null}
    </span>
  );
}

export { TimeRange };
