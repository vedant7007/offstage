"use client";

import * as React from "react";
import { Inbox } from "lucide-react";
import { api } from "@/lib/api-client";
import { useT } from "@/lib/i18n/provider";

type Props = {
  slug: string;
  email: string;
  /** Ask only once a code has been sent. */
  sent: boolean;
};

/**
 * Demo mode only: a link to this person's latest OTP email in the server's demo inbox. The server
 * decides who is eligible (seeded personas and allowlisted team emails); for everyone else, and
 * whenever demo mode is off, it answers "not available" or 404 and nothing renders.
 */
export function DemoInboxLink({ slug, email, sent }: Props) {
  const t = useT();
  // The answer is kept with the request it belongs to, so a changed email never shows an old link.
  const key = sent && email ? `${slug}|${email}` : null;
  const [answer, setAnswer] = React.useState<{ key: string; url: string } | null>(null);

  React.useEffect(() => {
    if (!key) return;
    let live = true;
    api
      .call("demoInbox", { params: { slug }, query: { email } })
      .then((r) => {
        if (live && r.available && r.url) setAnswer({ key, url: r.url });
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [key, slug, email]);

  const url = answer && answer.key === key ? answer.url : null;
  if (!url) return null;
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm">
      <Inbox aria-hidden className="size-4 shrink-0" />
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="font-medium underline underline-offset-4"
      >
        {t("demoInbox.link")}
      </a>
      <span className="text-fg-muted">{t("demoInbox.hint")}</span>
    </p>
  );
}
