"use client";

import * as React from "react";
import type { DeliveryStatsResponse } from "@/contracts";
import { api } from "@/lib/api-client";
import { DataTable, type Column } from "@/components/ui";

type Row = DeliveryStatsResponse["channels"][number];
const LABEL: Record<string, string> = {
  email: "Email",
  telegram: "Telegram",
  whatsapp: "WhatsApp",
  sms: "SMS",
};
const num = (key: "real" | "mock" | "pending" | "failed" | "skipped", header: string): Column<Row> => ({
  key,
  header,
  align: "end",
  cell: (r) => r[key].toLocaleString("en-IN"),
});
const COLUMNS: Column<Row>[] = [
  { key: "channel", header: "Channel", primary: true, cell: (r) => LABEL[r.channel] ?? r.channel },
  num("real", "Real"),
  num("mock", "Mock"),
  num("pending", "Queued"),
  {
    key: "failed",
    header: "Failed",
    align: "end",
    cell: (r) => {
      const codes = Object.entries(r.failureCodes ?? {});
      return (
        <>
          {r.failed.toLocaleString("en-IN")}
          {codes.length ? (
            <span className="block text-xs text-fg-muted">
              {codes.map(([code, n]) => `error ${code}: ${n}`).join(", ")}
            </span>
          ) : null}
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
