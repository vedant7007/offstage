import Link from "next/link";
import { CalendarX } from "lucide-react";
import { Button, EmptyState } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

export default async function EventNotFound() {
  const t = await getT();
  return (
    <div className="mx-auto max-w-xl px-4 pt-16">
      <h1 className="sr-only">{t("event.notFoundTitle")}</h1>
      <EmptyState
        icon={<CalendarX />}
        title={t("event.notFoundTitle")}
        description={t("event.notFoundBody")}
        action={
          <Button asChild variant="secondary">
            <Link href="/">{t("event.backHome")}</Link>
          </Button>
        }
      />
    </div>
  );
}
