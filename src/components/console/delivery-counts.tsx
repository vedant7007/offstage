"use client";

import * as React from "react";
import type { DeliveryStatsResponse } from "@/contracts";
import { api } from "@/lib/api-client";
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

  if (!rows?.length) return null;
  return <DataTable caption="Message delivery" columns={COLUMNS} rows={rows} rowKey={(r) => r.channel} />;
}
