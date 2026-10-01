"use client";

import * as React from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { allScans } from "./offline";

/** The browser's own online flag, live. The server snapshot assumes online so nothing flashes. */
export function useOnline() {
  return React.useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/** Network state in one glance: lime when online, gold when offline, with what is waiting. */
export function SyncPill({
  online,
  queued,
  className,
}: {
  online: boolean;
  queued: number;
  className?: string;
}) {
  const text = online
    ? queued
      ? `Online, ${queued} to sync`
      : "Online"
    : queued
      ? `Offline, ${queued} queued`
      : "Offline";
  return (
    <Badge
      tone={online ? "approved" : "pending"}
      className={cn("gap-1.5 px-3 py-1.5 text-sm [&_svg]:size-4", className)}
    >
      {online ? <Wifi aria-hidden /> : <WifiOff aria-hidden />}
      {text}
    </Badge>
  );
}

/** For the crew home: what this device holds, read from the same queue the scanner writes. */
export function DeviceSyncSummary() {
  const online = useOnline();
  const [counts, setCounts] = React.useState<{ total: number; queued: number } | null>(null);
  React.useEffect(() => {
    let live = true;
    allScans().then(
      (all) =>
        live && setCounts({ total: all.length, queued: all.filter((s) => s.state === "queued").length }),
      () => live && setCounts({ total: 0, queued: 0 }),
    );
    return () => {
      live = false;
    };
  }, [online]);

  const queued = counts?.queued ?? 0;
  return (
    <div className="flex flex-col gap-3">
      <SyncPill online={online} queued={queued} />
      <p className="text-sm text-fg-muted" aria-live="polite">
        {counts === null
          ? "Reading this device"
          : !counts.total
            ? "No scans on this device yet."
            : queued && online
              ? `${queued} waiting to sync. Open the scanner and tap Sync now.`
              : queued
                ? `${plural(counts.total, "scan")} on this device. ${queued} will sync when the network is back.`
                : `${plural(counts.total, "scan")} on this device, all synced.`}
      </p>
    </div>
  );
}
