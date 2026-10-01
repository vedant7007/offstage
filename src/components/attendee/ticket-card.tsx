"use client";

import * as React from "react";
import { CircleCheck, Clock, Maximize2, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
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

  // Spotlight that follows the pointer across the pass. Purely decorative.
  const spot = (e: React.PointerEvent<HTMLElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  return (
    <>
      {/* The pass is always ink: the nested .dark scope flips every token inside it. --page-bg keeps
          the outer page colour for the perforation notches. */}
      <div className="[--page-bg:var(--bg)]">
        <section
          aria-labelledby="ticket-title"
          onPointerMove={spot}
          className="group dark relative isolate flex flex-col overflow-hidden rounded-card border border-border bg-bg text-fg shadow-[0_32px_64px_-32px_rgb(7_27_223/0.45)]"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 -z-10 opacity-0 transition-opacity duration-300 ease-out group-hover:opacity-100 bg-[radial-gradient(320px_circle_at_var(--mx,50%)_var(--my,30%),rgb(193_255_0/0.14),transparent_65%)]"
          />
          <div className="flex flex-col gap-3 p-5 pb-4">
            <div className="flex items-center justify-between gap-3">
              <p className="kicker min-w-0 truncate text-curtain-text">{eventName}</p>
              <span aria-hidden className="kicker shrink-0 text-fg-muted">
                {t("me.tabs.ticket")}
              </span>
            </div>
            <div className="flex flex-col gap-1">
              <h1 id="ticket-title" className="text-3xl">
                {t("me.ticket.title")}
              </h1>
              <p className="text-lg text-fg-muted">{name}</p>
            </div>
          </div>

          {/* Perforation between the stub and the code */}
          <div aria-hidden className="relative h-0 border-t border-dashed border-border-strong">
            <span className="absolute top-0 -left-3 size-6 -translate-y-1/2 rounded-full bg-[var(--page-bg)]" />
            <span className="absolute top-0 -right-3 size-6 -translate-y-1/2 rounded-full bg-[var(--page-bg)]" />
          </div>

          <div className="flex flex-col items-center gap-4 p-5 pt-6 text-center">
            {/* Lime frame around a dark-on-white code, so scanners read it whatever the theme. */}
            <div className="rounded-[22px] bg-curtain p-1.5 transition-transform duration-300 ease-out motion-safe:group-hover:-translate-y-0.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qrPngDataUrl}
                alt={alt}
                width={260}
                height={260}
                className="rounded-card bg-white p-3"
              />
            </div>
            {checkedInAt ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-curtain px-3 py-1 font-mono text-sm font-medium text-on-curtain [&_svg]:size-4">
                <CircleCheck aria-hidden />
                {t("me.ticket.checkedIn", { time: formatTime(checkedInAt) })}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-border-strong px-3 py-1 font-mono text-sm text-fg [&_svg]:size-4">
                <Clock aria-hidden />
                {t("me.ticket.notCheckedIn")}
              </span>
            )}
            <div className="flex w-full flex-col items-center gap-2">
              <Button ref={openRef} size="lg" block className="max-w-sm" onClick={() => setFull(true)}>
                <Maximize2 aria-hidden />
                {t("me.ticket.showToVolunteer")}
              </Button>
              <p className="max-w-sm text-sm text-fg-muted">{t("me.ticket.showHint")}</p>
            </div>
          </div>
        </section>
      </div>

      {full ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          className="light fixed inset-0 z-(--z-modal) flex flex-col items-center justify-center gap-4 bg-white p-4 text-black"
        >
          <IconButton
            ref={closeRef}
            label={t("me.ticket.close")}
            icon={<X aria-hidden className="size-6" />}
            onClick={() => setFull(false)}
            className="absolute top-3 right-3 rounded-full text-black hover:bg-black/10"
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrPngDataUrl} alt={alt} className="aspect-square w-full max-w-[min(90vw,70vh)]" />
          <p className="text-3xl font-medium tracking-[-0.03em]">{name}</p>
          <p className="kicker">{eventName}</p>
          <p className="max-w-xs text-center text-sm">{t("me.ticket.brightness")}</p>
        </div>
      ) : null}
    </>
  );
}
