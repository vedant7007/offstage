"use client";

import * as React from "react";
import type { DeliveryStatsResponse } from "@/contracts";
import { api } from "@/lib/api-client";
import { isShowcase } from "@/showcase/flag";
import { DataTable, type Column } from "@/components/ui";
import { channelName } from "./text";

type Row = DeliveryStatsResponse["channels"][number];
const num = (key: "real" | "mock" | "pending" | "failed" | "skipped", header: string): Column<Row> => ({
  key,
  header,
  align: "end",
  cell: (r) => r[key].toLocaleString("en-IN"),
});
const COLUMNS: Column<Row>[] = [
  { key: "channel", header: "Channel", primary: true, cell: (r) => channelName(r.channel) },
  num("real", "Real"),
  num("mock", "Mock"),
  num("pending", "Queued"),
  {
    key: "failed",
    header: "Failed",
    align: "end",
    cell: (r) => {
      // Readable notes from the server ("Twilio daily cap reached, resets in 5 hours"); codes as a fallback.
      const notes = r.failureNotes?.length
        ? r.failureNotes
        : Object.entries(r.failureCodes ?? {}).map(([code, n]) => `error ${code}: ${n}`);
      return (
        <>
          {r.failed.toLocaleString("en-IN")}
          {notes.length ? <span className="block text-xs text-fg-muted">{notes.join("; ")}</span> : null}
        </>
      );
    },
  },
  num("skipped", "Skipped"),
];

/** Real sends (allowlisted people only) against mock deliveries, per channel. */
export function DeliveryCounts({ eventId }: { eventId: string }) {
  const [rows, setRows] = React.useState<Row[] | null>(null);

  React.useEffect(() => {
    const load = () =>
      api.call("deliveryStats", { params: { eventId } }).then(
        (res) => setRows(res.channels),
        () => setRows((r) => r ?? []),
      );
    void load();
    const id = setInterval(() => void load(), 5_000);
    return () => clearInterval(id);
  }, [eventId]);

  if (isShowcase())
    // Nothing leaves the showcase: say so plainly instead of showing skipped channels as if they had failed.
    return (
      <section aria-labelledby="delivery-sim" className="flex flex-col gap-2">
        <h2 id="delivery-sim" className="text-base font-medium">
          Showcase: simulated services
        </h2>
        <p className="text-sm text-fg-muted">
          Email, WhatsApp, Telegram and SMS are not connected here. Approved messages are delivered as mocks,
          the way the recorded run counted them.
        </p>
        {rows?.length ? (
          <DataTable caption="Message delivery" columns={COLUMNS} rows={rows} rowKey={(r) => r.channel} />
        ) : null}
      </section>
    );
  if (!rows?.length) return null;
  return <DataTable caption="Message delivery" columns={COLUMNS} rows={rows} rowKey={(r) => r.channel} />;
}
