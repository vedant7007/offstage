"use client";

import * as React from "react";
import { FileText, FlaskConical, Gauge, History, Inbox, Network, Newspaper, Sparkles } from "lucide-react";
import type { OverviewResponse } from "@/contracts/api";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { AppShell, type NavItem } from "./app-shell";

const STATUS: Record<OverviewResponse["event"]["status"], { label: string; live: boolean }> = {
  live: { label: "Live", live: true },
  planning: { label: "Planning", live: false },
  draft: { label: "Draft", live: false },
  closed: { label: "Closed", live: false },
};

/** Event name, status and pending approvals, refreshed every 20 seconds. Read only. */
function useOverview(eventId: string) {
  const [overview, setOverview] = React.useState<OverviewResponse | null>(null);
  React.useEffect(() => {
    let live = true;
    const load = () =>
      api.call("overview", { params: { eventId } }).then(
        (r) => live && setOverview(r),
        () => undefined,
      );
    void load();
    const id = setInterval(() => void load(), 20_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [eventId]);
  return overview;
}

function StatusPill({ overview }: { overview: OverviewResponse }) {
  const s = STATUS[overview.event.status];
  return (
    <p className="flex min-h-9 max-w-64 items-center gap-2 rounded-full border border-border bg-surface/70 px-3.5 text-sm">
      <span aria-hidden className="relative flex size-2 shrink-0">
        {s.live ? (
          <span className="absolute inset-0 rounded-full bg-[#c1ff00] motion-safe:animate-ping" />
        ) : null}
        <span
          className={cn(
            "relative size-2 rounded-full",
            s.live ? "bg-[#c1ff00] ring-1 ring-black/30" : "bg-neutral",
          )}
        />
      </span>
      <span className="font-mono text-xs font-medium tracking-[0.08em] uppercase">{s.label}</span>
      <span aria-hidden className="text-border-strong">
        /
      </span>
      <span className="truncate font-medium">{overview.event.name}</span>
    </p>
  );
}

/** Console chrome: grouped sidebar, live status pill and a pending count on Approvals. */
export function ConsoleShell({
  eventId,
  actions,
  children,
}: {
  eventId: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  const overview = useOverview(eventId);
  const base = `/console/${eventId}`;
  const pending = overview?.metrics.pendingApprovals ?? 0;
  const nav: NavItem[] = [
    { group: "Run the show", href: base, label: "Live stage", icon: <Network aria-hidden />, exact: true },
    {
      group: "Run the show",
      href: `${base}/approvals`,
      label: "Approvals",
      icon: <Inbox aria-hidden />,
      badge: pending || undefined,
    },
    { group: "Run the show", href: `${base}/briefing`, label: "Briefing", icon: <Newspaper aria-hidden /> },
    { group: "Plan", href: `${base}/whatif`, label: "What if", icon: <FlaskConical aria-hidden /> },
    { group: "Plan", href: "/console/new", label: "Plan a new event", icon: <Sparkles aria-hidden /> },
    { group: "Records", href: `${base}/timeline`, label: "Timeline", icon: <History aria-hidden /> },
    { group: "Records", href: `${base}/report`, label: "Close-out report", icon: <FileText aria-hidden /> },
    { group: "Records", href: `${base}/evals`, label: "Evals", icon: <Gauge aria-hidden /> },
  ];
  return (
    <AppShell
      title={
        <>
          OFFSTAGE <span className="kicker hidden align-middle text-fg-muted sm:inline">Console</span>
        </>
      }
      homeHref={base}
      nav={nav}
      status={overview ? <StatusPill overview={overview} /> : null}
      actions={actions}
    >
      {children}
    </AppShell>
  );
}
