import { Clock, Megaphone } from "lucide-react";
import type { AnnouncementCategory, PublicEventResponse } from "@/contracts";
import { Alert } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { formatTime } from "@/lib/time";
import { AnnouncementLabel } from "@/components/public/announcement-label";
import { Kicker } from "@/components/public/kicker";

// Left edge colour by category; emergencies are rendered separately as an emergency alert.
const CATEGORY_EDGE: Record<Exclude<AnnouncementCategory, "emergency">, string> = {
  info: "border-l-info",
  change: "border-l-pending",
  official: "border-l-curtain",
};

type Props = { data: PublicEventResponse; cue: string };

/**
 * Public announcements plus sessions that are running late or cancelled, newest first.
 * Emergencies are shown as an emergency alert above everything else.
 */
export async function LiveUpdates({ data, cue }: Props) {
  const t = await getT();
  const announcements = [...data.announcements].sort((a, b) =>
    (b.sentAt ?? "").localeCompare(a.sentAt ?? ""),
  );
  const emergencies = announcements.filter((a) => a.category === "emergency");
  const others = announcements.filter((a) => a.category !== "emergency");
  const disrupted = data.sessions.filter((s) => s.status === "cancelled" || s.delayMinutes > 0);
  const empty = !announcements.length && !disrupted.length;

  return (
    <section aria-labelledby="updates-title" className="flex flex-col gap-4">
      <Kicker>{cue}</Kicker>
      <h2 id="updates-title" className="flex items-center gap-2 text-2xl md:text-3xl">
        <Megaphone aria-hidden className="size-5 text-curtain-text" />
        {t("event.updatesTitle")}
      </h2>
      {emergencies.map((a) => (
        <Alert key={a.id} variant="emergency" title={a.title}>
          {a.body}
          <AnnouncementLabel announcement={a} onColour />
        </Alert>
      ))}
      {empty ? <p className="text-fg-muted">{t("event.noUpdates")}</p> : null}
      <ul className="flex flex-col gap-2">
        {disrupted.map((s) => (
          <li
            key={s.id}
            className="flex items-start gap-3 rounded-card border border-pending bg-pending-soft p-4 text-pending-soft-fg"
          >
            <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-medium">{s.title}</span>:{" "}
              {s.status === "cancelled"
                ? t("event.cancelledNote")
                : t("event.runningLate", { minutes: s.delayMinutes })}
            </p>
          </li>
        ))}
        {others.map((a) => (
          <li
            key={a.id}
            className={cn(
              "flex flex-col gap-1.5 rounded-card border border-l-4 border-border bg-surface p-4 shadow-(--shadow-card)",
              a.category !== "emergency" && CATEGORY_EDGE[a.category],
            )}
          >
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium">{a.title}</p>
              {a.sentAt ? (
                <time dateTime={a.sentAt} className="font-mono text-xs text-fg-muted">
                  {formatTime(a.sentAt)} {t("time.ist")}
                </time>
              ) : null}
            </div>
            <p className="text-sm">{a.body}</p>
            <AnnouncementLabel announcement={a} />
          </li>
        ))}
      </ul>
    </section>
  );
}
