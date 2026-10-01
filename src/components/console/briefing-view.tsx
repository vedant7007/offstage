"use client";

import * as React from "react";
import type { Briefing } from "@/contracts";
import { SkeletonCard } from "@/components/ui/motion";
import { Newspaper } from "lucide-react";
import { api } from "@/lib/api-client";
import { formatDate, formatTime } from "@/lib/time";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  PageHeader,
} from "@/components/ui";

/**
 * A fact as a reader wants it: shares as percentages, codes as words, counts with Indian grouping.
 * The value itself is never changed, only how it is written.
 */
function factValue(id: string, label: string, v: string | number | boolean): string {
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "string") return v.replace(/_/g, " ");
  if (!Number.isInteger(v) && v >= 0 && v <= 2 && /used|rate|share|ratio/i.test(`${id} ${label}`))
    return `${Math.round(v * 100)}%`;
  return v.toLocaleString("en-IN");
}

/** Today's briefing: each section's sentences with the facts behind every number. */
export function BriefingView({ eventId }: { eventId: string }) {
  const [briefing, setBriefing] = React.useState<Briefing | null | undefined>(undefined);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    api.call("getBriefing", { query: { eventId } }).then(
      (r) => setBriefing(r.briefing),
      (e: unknown) => setError(e instanceof Error ? e.message : "Could not load the briefing"),
    );
  }, [eventId]);

  const generate = () => {
    setBusy(true);
    setError(null);
    api
      .call("generateBriefing", { body: { eventId } })
      .then(
        (r) => setBriefing(r.briefing),
        (e: unknown) => setError(e instanceof Error ? e.message : "Could not write the briefing"),
      )
      .finally(() => setBusy(false));
  };

  const facts = new Map((briefing?.facts ?? []).map((f) => [f.id, f]));
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Commander, every morning"
        title="Daily briefing"
        description="What is due today, what is at risk and what waits for you. Every number comes from the event data."
        actions={
          <Button onClick={generate} loading={busy}>
            {briefing ? "Refresh briefing" : "Write today's briefing"}
          </Button>
        }
      />
      {error ? (
        <Alert variant="danger" title="Could not load the briefing">
          {error}
        </Alert>
      ) : null}
      {briefing === undefined && !error ? (
        <div aria-busy className="grid gap-4 md:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <SkeletonCard key={i} className="h-56" />
          ))}
        </div>
      ) : null}
      {briefing === null ? (
        <EmptyState
          icon={<Newspaper />}
          title="No briefing yet today"
          description="Write one now. It takes a few seconds and every number comes from the event data."
        />
      ) : null}
      {briefing ? (
        <>
          <p className="font-mono text-xs tracking-[0.02em] text-fg-muted">
            {formatDate(briefing.generatedAt)}, {formatTime(briefing.generatedAt)}.{" "}
            {briefing.generatedBy === "model" ? "Written by the Commander" : "Written from rules"}. Numbers
            from the database.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {briefing.sections.map((s, n) => (
              <Card key={s.key}>
                <CardHeader>
                  <span aria-hidden className="kicker text-curtain-text">
                    {String(n + 1).padStart(2, "0")}
                  </span>
                  <CardTitle as="h2">{s.title}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-4">
                  <p className="leading-relaxed">{s.narrative}</p>
                  <ul className="flex flex-wrap gap-2" aria-label={`Facts behind ${s.title}`}>
                    {s.factIds.map((id) => {
                      const f = facts.get(id);
                      return f ? (
                        <li key={id}>
                          <Badge tone="neutral">
                            {f.label}:{" "}
                            <span className="font-semibold tabular-nums">
                              {factValue(f.id, f.label, f.value)}
                            </span>
                          </Badge>
                        </li>
                      ) : null;
                    })}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
