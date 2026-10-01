"use client";

import * as React from "react";
import Link from "next/link";
import type { CloseoutReport } from "@/contracts";
import { api } from "@/lib/api-client";
import { formatInr } from "@/lib/format";
import { formatDayShort, formatTime } from "@/lib/time";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  KeyValueList,
  PageHeader,
  TierBadge,
  toast,
} from "@/components/ui";
import { CountUp, PageSkeleton } from "./fx";
import { channelName } from "./text";

// Printing (Save as PDF) shows the report alone, without the console around it.
const PRINT = `@media print {
  body * { visibility: hidden !important; }
  #closeout, #closeout * { visibility: visible !important; }
  #closeout { position: absolute; inset: 0 auto auto 0; width: 100%; }
  #closeout [data-print="hide"] { display: none !important; }
}`;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="break-inside-avoid">
      <CardHeader>
        <CardTitle as="h2">{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

/** The Chronicler's close-out report: every number from the database, the model writes only the summary. */
export function CloseoutView({ eventId }: { eventId: string }) {
  const [r, setR] = React.useState<CloseoutReport | null>(null);
  const [error, setError] = React.useState(false);
  const [writing, setWriting] = React.useState(false);
  React.useEffect(() => {
    api.call("closeout", { params: { eventId } }).then(setR, () => setError(true));
  }, [eventId]);

  if (error)
    return (
      <Alert variant="danger" title="The report could not be loaded.">
        Check your connection, then reload the page.
      </Alert>
    );
  if (!r) return <PageSkeleton />;
  const a = r.attendance;
  const headline = [
    { label: "Attended", node: <CountUp to={a.attended} /> },
    { label: "Of confirmed", node: <CountUp to={a.ratePct} format={(n) => `${Math.round(n)}%`} /> },
    { label: "Helpdesk questions", node: <CountUp to={r.helpdesk.questions} /> },
    {
      label: "Proposals carried out",
      node: <CountUp to={r.approvals.reduce((s, x) => s + x.executed, 0)} />,
    },
  ];
  const writeSummary = () => {
    setWriting(true);
    api
      .call("closeoutSummary", { params: { eventId } })
      .then(setR, (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not write the summary"))
      .finally(() => setWriting(false));
  };

  return (
    <div id="closeout" className="flex flex-col gap-4">
      <style>{PRINT}</style>
      <PageHeader
        eyebrow="Chronicler, close-out"
        title={`Close-out report: ${r.eventName}`}
        description={`Every number is counted from the event's records. As of ${formatDayShort(r.generatedAt)}, ${formatTime(r.generatedAt)}.`}
        actions={
          <div data-print="hide" className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={writeSummary} loading={writing}>
              {r.summary ? "Rewrite summary" : "Write summary"}
            </Button>
            <Button onClick={() => window.print()}>Export PDF</Button>
          </div>
        }
      />

      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {headline.map((h) => (
          <div
            key={h.label}
            className="flex flex-col-reverse gap-1 rounded-card border border-border bg-surface p-4 depth-2 break-inside-avoid"
          >
            <dt className="kicker text-fg-muted">{h.label}</dt>
            <dd className="font-mono text-4xl font-medium tracking-[-0.02em]">{h.node}</dd>
          </div>
        ))}
      </dl>

      <Block title="Summary">
        {r.summary ? (
          <div className="flex flex-col gap-2">
            <p>{r.summary.text}</p>
            <p className="text-xs text-fg-muted">
              {r.summary.by === "model"
                ? "Written by the Chronicler from the numbers below; every number in it was checked against them."
                : "Written from a template: the model's draft used a number that is not in this report."}
            </p>
          </div>
        ) : (
          <p className="text-sm text-fg-muted">
            No summary for these numbers yet. Write summary asks the Chronicler for three or four sentences
            that quote only the numbers below.
          </p>
        )}
      </Block>

      <div className="grid gap-4 md:grid-cols-2">
        <Block title="Attendance">
          <KeyValueList
            items={[
              { label: "Registered", value: a.registered },
              { label: "Confirmed", value: a.confirmed },
              { label: "Attended", value: `${a.attended} (${a.ratePct}% of confirmed)` },
              { label: "No-shows", value: a.noShows },
            ]}
          />
        </Block>
        <Block title="Sessions">
          <KeyValueList
            items={[
              { label: "Sessions", value: r.sessions.total },
              { label: "Changed by an approved plan", value: r.sessions.changed },
              { label: "Cancelled", value: r.sessions.cancelled },
            ]}
          />
        </Block>
        <Block title="Helpdesk">
          <KeyValueList
            items={[
              { label: "Questions", value: r.helpdesk.questions },
              { label: "Injection attempts blocked", value: r.helpdesk.blocked },
              { label: "Escalated to a person", value: r.helpdesk.escalations },
              { label: "Escalations still open", value: r.helpdesk.escalationsOpen },
            ]}
          />
        </Block>
        <Block title="Incidents">
          <KeyValueList
            items={[
              { label: "Reported", value: r.incidents.total },
              { label: "Resolved", value: r.incidents.resolved },
              { label: "Still open", value: r.incidents.open },
              { label: "Emergencies", value: r.incidents.emergencies },
            ]}
          />
        </Block>
      </div>

      <Block title="Messages sent">
        <DataTable
          caption="Messages per channel"
          hideCaption
          rowKey={(m) => m.channel}
          rows={r.messages}
          columns={[
            { key: "channel", header: "Channel", cell: (m) => channelName(m.channel), primary: true },
            { key: "real", header: "Real", cell: (m) => m.real, align: "end" },
            { key: "mock", header: "Mock", cell: (m) => m.mock, align: "end" },
            { key: "failed", header: "Failed", cell: (m) => m.failed, align: "end" },
            { key: "skipped", header: "Skipped", cell: (m) => m.skipped, align: "end" },
          ]}
          empty={<EmptyState title="No messages sent" />}
        />
        <p className="mt-2 text-sm text-fg-muted">
          Plus <span className="tabular-nums">{r.inAppNotifications.toLocaleString("en-IN")}</span> in-app
          notifications.
        </p>
      </Block>

      <Block title="Budget">
        <p className="mb-2 text-sm">
          {formatInr(r.budget.spentInr)} spent or committed of {formatInr(r.budget.capInr)}. Income received:{" "}
          {formatInr(r.budget.incomeInr)}.
        </p>
        <DataTable
          caption="Budget by category"
          hideCaption
          rowKey={(c) => c.name}
          rows={r.budget.categories}
          columns={[
            { key: "name", header: "Category", cell: (c) => c.name, primary: true },
            { key: "cap", header: "Cap", cell: (c) => formatInr(c.capInr), align: "end" },
            { key: "spent", header: "Spent", cell: (c) => formatInr(c.spentInr), align: "end" },
            {
              key: "used",
              header: "Used",
              cell: (c) => {
                const pct = c.capInr ? Math.round((c.spentInr / c.capInr) * 100) : 0;
                return <Badge tone={pct > 100 ? "danger" : pct >= 80 ? "pending" : "neutral"}>{pct}%</Badge>;
              },
              align: "end",
            },
          ]}
          empty={<EmptyState title="No budget set" />}
        />
      </Block>

      <Block title="Approvals by tier">
        <DataTable
          caption="Proposals by risk tier"
          hideCaption
          rowKey={(x) => x.tier}
          rows={r.approvals}
          columns={[
            { key: "tier", header: "Tier", cell: (x) => <TierBadge tier={x.tier} />, primary: true },
            { key: "total", header: "Proposed", cell: (x) => x.total, align: "end" },
            { key: "executed", header: "Carried out", cell: (x) => x.executed, align: "end" },
            { key: "rejected", header: "Rejected", cell: (x) => x.rejected, align: "end" },
            { key: "pending", header: "Waiting", cell: (x) => x.pending, align: "end" },
            { key: "other", header: "Other", cell: (x) => x.other, align: "end" },
          ]}
          empty={<EmptyState title="No proposals yet" />}
        />
      </Block>

      <div className="grid gap-4 md:grid-cols-2">
        <Block title="Certificates">
          <KeyValueList
            items={[
              { label: "Issued", value: r.certificates.issued },
              { label: "Revoked", value: r.certificates.revoked },
              ...r.certificates.byKind.map((k) => ({ key: k.kind, label: k.kind, value: k.count })),
            ]}
          />
          <p className="mt-2 text-sm text-fg-muted">
            Anyone can check a certificate on the public verify page
            {r.certificates.sampleId ? (
              <>
                , for example{" "}
                <Link className="underline" href={`/verify/${r.certificates.sampleId}`}>
                  /verify/{r.certificates.sampleId.slice(0, 8)}
                </Link>
              </>
            ) : (
              <>, at /verify/ plus its id. None issued yet</>
            )}
            .
          </p>
        </Block>
        <Block title="OD letters">
          <KeyValueList
            items={[
              { label: "OD lists sent", value: r.odLetters.lists },
              { label: "Students on them", value: r.odLetters.students },
            ]}
          />
        </Block>
      </div>

      <Block title="Lessons for next time">
        {r.lessons.length ? (
          <ul className="flex flex-col gap-2">
            {r.lessons.map((l) => (
              <li key={`${l.source}:${l.title}`}>
                <span className="font-medium">{l.title}.</span> {l.detail}{" "}
                <Badge tone="neutral">
                  {l.source === "incident" ? "From an incident" : "From the playbook"}
                </Badge>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-fg-muted">No resolved incidents or saved lessons yet.</p>
        )}
      </Block>
    </div>
  );
}
