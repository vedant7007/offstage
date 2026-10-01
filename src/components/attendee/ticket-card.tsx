"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { CalendarDays, CircleCheck, Clock, MapPin, Maximize2, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui";
import { useT } from "@/lib/i18n/provider";
import { formatTime } from "@/lib/time";

type Props = {
  name: string;
  /** Shown under the name, like the affiliation line on a conference badge. */
  college?: string;
  eventName: string;
  /** Already formatted, such as "Sat, 24 Oct to Sun, 25 Oct". */
  dates?: string;
  venue?: string;
  qrPngDataUrl: string;
  checkedInAt?: string;
};

type WakeLock = { release: () => Promise<void> };

// Two round notches cut clean through the pass at the perforation, so the page shows through them.
// --notch-y is measured on mount; until then the mask is invalid and the pass stays whole.
const NOTCH = (x: string) => `radial-gradient(circle 12px at ${x} var(--notch-y), #0000 11.5px, #000 12px)`;
const NOTCH_MASK = {
  maskImage: `${NOTCH("0")}, ${NOTCH("100%")}`,
  WebkitMaskImage: `${NOTCH("0")}, ${NOTCH("100%")}`,
  maskComposite: "intersect",
  WebkitMaskComposite: "source-in",
} as React.CSSProperties;

/** Keeps --notch-y on the perforation line as the pass resizes (long names, narrow phones). */
function notch(el: HTMLElement | null) {
  const line = el?.querySelector<HTMLElement>("[data-perforation]");
  if (!el || !line) return;
  const place = () => el.style.setProperty("--notch-y", `${line.offsetTop + 1}px`);
  place();
  const ro = new ResizeObserver(place);
  ro.observe(el);
  return () => ro.disconnect();
}

/**
 * The ticket QR with check-in status, and a full-screen "show to volunteer" view: white
 * background, the largest QR that fits, and the screen kept awake while it is open.
 */
export function TicketCard({ name, college, eventName, dates, venue, qrPngDataUrl, checkedInAt }: Props) {
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
      {/* The long shadow sits on a still wrapper: the pass itself is masked (real notches), and a mask
          would clip its own shadow. */}
      <div className="rounded-card shadow-[0_40px_80px_-40px_rgb(7_27_223/0.5)]">
        {/* The pass is always ink: the nested .dark scope flips every token inside it. It leans toward
            the cursor (data-tilt, driven by PointerFx) and sweeps once on touch. The 1px transparent
            border gives the edge hairline room inside the mask. */}
        <section
          ref={notch}
          aria-labelledby="ticket-title"
          data-tilt=""
          data-max={5}
          style={NOTCH_MASK}
          className="edge dark flex flex-col rounded-card border border-transparent bg-bg text-fg"
        >
          {/* Stage light from above, so the pass has depth on a black page too. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-64 rounded-t-card bg-[radial-gradient(120%_100%_at_50%_0%,rgb(26_47_251/0.34),transparent_70%)]"
          />
          <div className="flex flex-col p-6">
            <p className="kicker flex items-center gap-3 text-curtain-text">
              <span className="min-w-0 truncate">{eventName}</span>
              <span aria-hidden className="h-px w-8 shrink-0 bg-current" />
            </p>
            <h1 id="ticket-title" className="mt-4 text-sm font-normal text-fg-muted">
              {t("me.ticket.title")}
            </h1>
            <p className="mt-1 text-3xl font-medium text-balance">{name}</p>
            {college ? <p className="mt-1 text-sm text-fg-muted">{college}</p> : null}
            {dates || venue ? (
              <ul className="mt-6 flex flex-col gap-2 text-sm text-fg-muted">
                {dates ? (
                  <li className="flex items-start gap-2">
                    <CalendarDays aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span className="font-mono">{dates}</span>
                  </li>
                ) : null}
                {venue ? (
                  <li className="flex items-start gap-2">
                    <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                    <span className="sr-only">{t("event.venue")}: </span>
                    {venue}
                  </li>
                ) : null}
              </ul>
            ) : null}
          </div>

          {/* Perforation between the stub and the code; the notches are cut by the mask at this line. */}
          <div data-perforation="" aria-hidden className="mx-5 border-t border-dashed border-border-strong" />

          <div className="flex flex-col items-center gap-4 p-6 text-center">
            {/* Lime frame around a dark-on-white code, so scanners read it whatever the theme. Above the
                tilt glare (z-2), so the glare never washes over the code. */}
            <div className="relative z-2 rounded-[22px] bg-curtain p-1.5">
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
            <div className="relative z-2 mt-2 flex w-full flex-col items-center gap-3">
              <Button ref={openRef} size="lg" block className="max-w-sm" onClick={() => setFull(true)}>
                <Maximize2 aria-hidden />
                {t("me.ticket.showToVolunteer")}
              </Button>
              <p className="max-w-sm text-sm text-balance text-fg-muted">{t("me.ticket.showHint")}</p>
            </div>
          </div>
        </section>
      </div>

      {full
        ? createPortal(
        <div
          role="dialog"
          aria-modal="true"
          aria-label={alt}
          // Close is the only control, so Tab stays on it instead of reaching the page behind.
          onKeyDown={(e) => {
            if (e.key !== "Tab") return;
            e.preventDefault();
            closeRef.current?.focus();
          }}
          className="light fixed inset-0 z-(--z-modal) flex flex-col items-center justify-center gap-4 bg-white p-4 text-black motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-300"
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
          <p className="max-w-xs text-center text-sm text-balance">{t("me.ticket.brightness")}</p>
        </div>,
            document.body,
          )
        : null}
    </>
  );
}
