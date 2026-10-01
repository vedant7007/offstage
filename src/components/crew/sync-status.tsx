"use client";

import * as React from "react";
import { CircleCheck, Wifi, WifiOff } from "lucide-react";
import { Badge, Skeleton } from "@/components/ui";
import { ConfirmBurst, NumberTicker } from "@/components/ui/motion";
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

/**
 * Network state in one glance: lime when online, gold when offline, with what is waiting. The waiting
 * count rolls as it changes, and when the queue empties online the pill turns to "All synced" with a
 * small burst.
 */
export function SyncPill({
  online,
  queued,
  total = 0,
  className,
}: {
  online: boolean;
  queued: number;
  /** Scans on this device. With none waiting, any at all reads "All synced". */
  total?: number;
  className?: string;
}) {
  // Burst once each time the queue empties while online (state from the previous render, not a ref).
  const [prev, setPrev] = React.useState(queued);
  const [burst, setBurst] = React.useState(0);
  if (prev !== queued) {
    setPrev(queued);
    if (prev > 0 && queued === 0 && online) setBurst((b) => b + 1);
  }

  const synced = online && !queued && total > 0;
  const icon = synced ? <CircleCheck aria-hidden /> : online ? <Wifi aria-hidden /> : <WifiOff aria-hidden />;
  return (
    <Badge
      tone={online ? "approved" : "pending"}
      className={cn("gap-1.5 px-3 py-1.5 text-sm [&_svg]:size-4", className)}
    >
      <span className="relative inline-flex">
        {icon}
        {burst ? <ConfirmBurst key={burst} rays={4} className="text-current" /> : null}
      </span>
      {synced ? (
        "All synced"
      ) : (
        <span>
          {online ? "Online" : "Offline"}
          {queued ? (
            <>
              {", "}
              <NumberTicker value={queued} mode="roll" />
              {online ? " to sync" : " queued"}
            </>
          ) : null}
        </span>
      )}
    </Badge>
  );
}

/** One big number with its label, for the device summary. */
function Stat({ label, value, mode }: { label: string; value: number; mode: "count" | "roll" }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="kicker text-fg-muted">{label}</dt>
      <dd className="font-mono text-4xl leading-none font-medium tracking-[-0.04em]">
        <NumberTicker value={value} mode={mode} />
      </dd>
    </div>
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
    <div className="flex flex-col gap-4" aria-busy={counts === null}>
      {counts === null ? (
        <div aria-hidden className="grid grid-cols-2 gap-4">
          {[0, 1].map((i) => (
            <div key={i} className="flex flex-col gap-2">
              <Skeleton className="h-3 w-24 rounded-full" />
              <Skeleton className="h-9 w-12" />
            </div>
          ))}
        </div>
      ) : (
        <dl className="grid grid-cols-2 gap-4">
          <Stat label="Scanned here" value={counts.total} mode="count" />
          <Stat label="Waiting to sync" value={queued} mode="roll" />
        </dl>
      )}
      <div className="flex flex-col gap-2 border-t border-border pt-4">
        <SyncPill online={online} queued={queued} total={counts?.total ?? 0} />
        <p className="text-sm text-fg-muted" aria-live="polite">
          {counts === null
            ? "Reading this device"
            : !counts.total
              ? "No scans yet. Scans work offline and sync on their own."
              : queued && online
                ? `${plural(queued, "scan")} waiting. Open the scanner and tap Sync now.`
                : queued
                  ? `${plural(queued, "scan")} will sync when the network is back.`
                  : "Every scan from this device is on the server."}
        </p>
      </div>
    </div>
  );
}
