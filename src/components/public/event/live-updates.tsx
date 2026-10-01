import { Clock } from "lucide-react";
import type { AnnouncementCategory, PublicEventResponse } from "@/contracts";
import { Alert } from "@/components/ui";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { formatTime } from "@/lib/time";
import { AnnouncementLabel } from "@/components/public/announcement-label";
import { Reveal } from "@/components/ui/motion";
import { SectionHead } from "@/components/public/event/section-head";

// Dot colour by category; emergencies are rendered separately as an emergency alert.
const CATEGORY_DOT: Record<Exclude<AnnouncementCategory, "emergency">, string> = {
  info: "bg-info",
  change: "bg-pending",
  official: "bg-curtain",
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
    <section aria-labelledby="updates-title" className="flex flex-col gap-8">
      <SectionHead cue={cue} id="updates-title">
        {t("event.updatesTitle")}
      </SectionHead>
      {emergencies.map((a) => (
        <Alert key={a.id} variant="emergency" title={a.title}>
          {a.body}
          <AnnouncementLabel announcement={a} onColour />
        </Alert>
      ))}
      {empty ? (
        <p className="measure-tight rounded-card border border-dashed border-border-strong p-5 text-fg-muted">
          {t("event.noUpdates")}
        </p>
      ) : null}
      <ul className="flex flex-col gap-3">
        {disrupted.map((s, i) => (
          <Reveal
            as="li"
            key={s.id}
            index={i}
            className="flex items-start gap-3 rounded-card border border-pending bg-pending-soft p-5 text-pending-soft-fg"
          >
            <Clock aria-hidden className="mt-0.5 size-4 shrink-0" />
            <p>
              <span className="font-medium">{s.title}</span>:{" "}
              {s.status === "cancelled"
                ? t("event.cancelledNote")
                : t("event.runningLate", { minutes: s.delayMinutes })}
            </p>
          </Reveal>
        ))}
        {others.map((a, i) => (
          <Reveal
            as="li"
            key={a.id}
            index={disrupted.length + i}
            className="flex flex-col gap-2 rounded-card border border-border bg-surface p-5 depth-2 md:p-6"
          >
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span
                aria-hidden
                className={cn(
                  "size-2 shrink-0 rounded-full",
                  a.category !== "emergency" && CATEGORY_DOT[a.category],
                )}
              />
              <p className="text-lg font-medium">{a.title}</p>
              {a.sentAt ? (
                <time dateTime={a.sentAt} className="font-mono text-xs text-fg-muted">
                  {formatTime(a.sentAt)} {t("time.ist")}
                </time>
              ) : null}
            </div>
            <p className="measure text-pretty text-fg-muted">{a.body}</p>
            <AnnouncementLabel announcement={a} />
          </Reveal>
        ))}
      </ul>
    </section>
  );
}
