"use client";

import * as React from "react";
import type { OverviewResponse } from "@/contracts/api";
import { api } from "@/lib/api-client";
import { Alert } from "@/components/ui";

/** Console banner while any emergency incident is open, refreshed every 10 seconds. Agents never act on these. */
export function EmergencyBanner({ eventId }: { eventId: string }) {
  const [overview, setOverview] = React.useState<OverviewResponse | null>(null);
  React.useEffect(() => {
    let live = true;
    const load = () =>
      api.call("overview", { params: { eventId } }).then(
        (r) => live && setOverview(r),
        () => undefined,
      );
    void load();
    const id = setInterval(() => void load(), 10_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, [eventId]);
  const open = overview?.metrics.emergenciesOpen ?? 0;
  if (!open) return null;
  const latest = overview?.recent.find((e) => e.type === "system.emergency_alert")?.payload.summary;
  return (
    <Alert variant="emergency" title={`Emergency reported: ${open} open`} className="mb-4">
      {typeof latest === "string" ? <p>Latest: {latest}</p> : null}
      <p>Agents do not act on emergencies. Every lead has been alerted. Call the venue team now.</p>
    </Alert>
  );
}
