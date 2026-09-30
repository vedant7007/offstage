"use client";

import { cn } from "cn";
import { useLocale, useT } from "@/lib/i18n/provider";
import { formatTimeRangeIST, toIsoUtc } from "@/lib/time";

type TimeRangeProps = {
  /** UTC instant, as stored. */
  start: Date | string;
  end: Date | string;
  withDate?: boolean;
  /** Append "IST". On by default for anything a visitor from another timezone might read. */
  showZone?: boolean;
  className?: string;
};

/** Session or shift time in India Standard Time, whatever the viewer's device timezone. */
function TimeRange({ start, end, withDate = false, showZone = true, className }: TimeRangeProps) {
  const t = useT();
  const locale = useLocale();
  const text = formatTimeRangeIST(start, end, { intlLocale: locale === "hi" ? "hi-IN" : "en-IN", withDate });
  return (
    <span className={cn("tabular-nums", className)}>
      <time dateTime={`${toIsoUtc(start)}/${toIsoUtc(end)}`}>{text}</time>
      {showZone ? <span className="ml-1 text-xs text-fg-muted">{t("time.ist")}</span> : null}
    </span>
  );
}

export { TimeRange };
