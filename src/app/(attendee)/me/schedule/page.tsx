import type { Metadata } from "next";
import Link from "next/link";
import { CalendarX2, Info } from "lucide-react";
import { Button, EmptyState, PageHeader } from "@/components/ui";
import { DEMO_EVENT_SLUG } from "@/components/public/links";
import { MySchedule } from "@/components/attendee/my-schedule";
import { eventNow, getMe, getMyRegistration, getMySchedule } from "@/components/attendee/server";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("me.schedule.title"), robots: { index: false } };
}

export default async function SchedulePage() {
  const [t, me, registration] = await Promise.all([getT(), getMe(), getMyRegistration()]);
  const schedule = registration ? await getMySchedule(registration.id) : null;
  const { nowIso, clockOffsetMs } = eventNow(me);
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader title={t("me.schedule.title")} className="pb-0" />
      {schedule ? (
        <MySchedule data={schedule.data} nowIso={nowIso} clockOffsetMs={clockOffsetMs} />
      ) : (
        <EmptyState
          icon={<CalendarX2 aria-hidden />}
          title={t("me.noEvent")}
          action={
            <Button asChild variant="secondary">
              <Link href={`/e/${DEMO_EVENT_SLUG}`}>{t("me.findEvent")}</Link>
            </Button>
          }
        />
      )}
      {schedule?.source === "fixture" ? (
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("me.demoData")}
        </p>
      ) : null}
    </div>
  );
}
