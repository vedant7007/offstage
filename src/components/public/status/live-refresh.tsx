"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/i18n/provider";
import { cn } from "@/lib/utils";

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
    <p role="status" className={cn("inline-flex items-center gap-2 text-sm font-medium", className)}>
      <span
        aria-hidden
        className={cn("size-2.5 rounded-full", reconnecting ? "bg-pending" : "animate-pulse bg-approved")}
      />
      {reconnecting ? t("board.reconnecting") : t("board.live")}
    </p>
  );
}
