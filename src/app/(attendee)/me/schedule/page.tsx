import type { Metadata } from "next";
import { Info } from "lucide-react";
import { Alert, PageHeader } from "@/components/ui";
import { MySchedule } from "@/components/attendee/my-schedule";
import { getMyRegistration, getMySchedule } from "@/components/attendee/server";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("me.schedule.title"), robots: { index: false } };
}

export default async function SchedulePage() {
  const [t, registration] = await Promise.all([getT(), getMyRegistration()]);
  const schedule = registration ? await getMySchedule(registration.id) : null;
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-4">
      <PageHeader title={t("me.schedule.title")} className="pb-0" />
      {schedule ? <MySchedule data={schedule.data} /> : <Alert variant="info" title={t("me.noEvent")} />}
      {schedule?.source === "fixture" ? (
        <p className="flex items-start gap-2 text-sm text-fg-muted">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0" />
          {t("me.demoData")}
        </p>
      ) : null}
    </div>
  );
}
