"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";
import { toIstParts } from "@/lib/time";
import { LivePulse, NumberTicker } from "@/components/ui/motion";

type Props = {
  /** Public SSE stream. When missing, or when it fails, the page polls instead. */
  streamUrl?: string | null;
  intervalMs?: number;
  className?: string;
};

/**
 * Keeps a server-rendered page fresh. With a stream, every `status` event re-renders the page;
 * without one it re-renders on a timer and whenever the tab becomes visible again.
 */
export function LiveRefresh({ streamUrl, intervalMs = 30_000, className }: Props) {
  const t = useT();
  const router = useRouter();
  const [reconnecting, setReconnecting] = React.useState(false);

  React.useEffect(() => {
    let timer: ReturnType<typeof setInterval> | undefined;
    let source: EventSource | undefined;
    const refresh = () => router.refresh();
    const poll = () => {
      if (!timer) timer = setInterval(refresh, intervalMs);
    };
    const onVisible = () => document.visibilityState === "visible" && refresh();

    if (streamUrl && "EventSource" in window) {
      source = new EventSource(streamUrl);
      source.addEventListener("status", () => {
        setReconnecting(false);
        refresh();
      });
      source.onopen = () => setReconnecting(false);
      source.onerror = () => {
        setReconnecting(true);
        poll();
      };
    } else {
      poll();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      source?.close();
      if (timer) clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [streamUrl, intervalMs, router]);

  return (
    <p role="status" className={cn("inline-flex items-center gap-2.5 text-sm font-medium", className)}>
      {reconnecting ? <span aria-hidden className="size-2 rounded-full bg-pending" /> : <LivePulse />}
      {reconnecting ? t("board.reconnecting") : t("board.live")}
    </p>
  );
}

const clock = (n: number) => `${Math.floor(n / 100)}:${String(n % 100).padStart(2, "0")}`;

/**
 * The board's clock: the IST time of the last update, in big mono digits. Only the digits that change
 * roll when a refresh lands. Decorative: the "Updated at" line next to it is what screen readers get.
 */
export function BoardClock({ now, className }: { now: string; className?: string }) {
  const t = useT();
  const { hour, minute } = toIstParts(now);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return (
    <span aria-hidden className={cn("inline-flex items-baseline gap-2 font-mono", className)}>
      <NumberTicker value={h12 * 100 + minute} mode="roll" format={clock} className="tracking-[-0.04em]" />
      <span className="text-[0.3em] font-medium tracking-[0.12em] text-fg-muted">
        {hour < 12 ? "AM" : "PM"} {t("time.ist")}
      </span>
    </span>
  );
}
