"use client";

import * as React from "react";
import { CircleCheck, Clock, Maximize2, X } from "lucide-react";
import { Badge, Button, IconButton } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { formatTime } from "@/lib/time";

type Props = {
  name: string;
  eventName: string;
  qrPngDataUrl: string;
  checkedInAt?: string;
};

type WakeLock = { release: () => Promise<void> };

/**
 * The ticket QR with check-in status, and a full-screen "show to volunteer" view: white
 * background, the largest QR that fits, and the screen kept awake while it is open.
 */
export function TicketCard({ name, eventName, qrPngDataUrl, checkedInAt }: Props) {
  const t = useT();
  const [full, setFull] = React.useState(false);
  const closeRef = React.useRef<HTMLButtonElement>(null);
  const openRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (!full) return;
    const opener = openRef.current;
    let lock: WakeLock | undefined;
    const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } };
    nav.wakeLock
      ?.request("screen")
      .then((l) => (lock = l))
      .catch(() => undefined);
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    document.addEventListener("keydown", onKey);
    return () => {
      void lock?.release().catch(() => undefined);
      document.removeEventListener("keydown", onKey);
      opener?.focus();
    };
  }, [full]);

  const alt = t("me.ticket.for", { name });

  return (
    <>
      <section
        aria-labelledby="ticket-title"
        className="flex flex-col items-center gap-4 rounded-card border border-border bg-surface p-5 text-center"
      >
        <div className="flex flex-col gap-1">
          <h1 id="ticket-title" className="text-2xl font-semibold">
            {t("me.ticket.title")}
          </h1>
          <p className="text-fg-muted">
            {name} · {eventName}
          </p>
        </div>
        {/* Dark on white for scanners, whatever the theme. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={qrPngDataUrl} alt={alt} width={260} height={260} className="rounded-control bg-white p-3" />
        {checkedInAt ? (
          <Badge tone="approved" className="text-sm">
            <CircleCheck aria-hidden />
            {t("me.ticket.checkedIn", { time: formatTime(checkedInAt) })}
          </Badge>
        ) : (
          <Badge tone="neutral" className="text-sm">
            <Clock aria-hidden />
            {t("me.ticket.notCheckedIn")}
          </Badge>
        )}
        <div className="flex w-full flex-col items-center gap-1">
          <Button ref={openRef} size="lg" block className="max-w-sm" onClick={() => setFull(true)}>
            <Maximize2 aria-hidden />
            {t("me.ticket.showToVolunteer")}
          </Button>
          <p className="max-w-sm text-sm text-fg-muted">{t("me.ticket.showHint")}</p>
        </div>
      </section>

      {full ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="fixed inset-0 z-(--z-modal) flex flex-col items-center justify-center gap-4 bg-white p-4 text-black"
        >
          <IconButton
            ref={closeRef}
            label={t("me.ticket.close")}
            icon={<X aria-hidden className="size-6" />}
            onClick={() => setFull(false)}
            className="absolute top-3 right-3 text-black hover:bg-black/10"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrPngDataUrl} alt={alt} className="aspect-square w-full max-w-[min(90vw,70vh)]" />
          <p className="text-2xl font-bold">{name}</p>
          <p className="text-base">{eventName}</p>
          <p className="max-w-xs text-center text-sm">{t("me.ticket.brightness")}</p>
        </div>
      ) : null}
    </>
  );
}
