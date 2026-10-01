"use client";

import * as React from "react";
import type { AgentRun, AgentRunResponse, AgentStep } from "@/contracts";
import { api } from "@/lib/api-client";
import { Alert, AgentAvatar, Badge, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { ChevronDown } from "lucide-react";
import { formatDateTime } from "@/lib/time";
import { cn } from "@/lib/utils";
import { SPOT, spotlight } from "./fx";

const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 5 : 3)}`;

function stepLine(s: AgentStep): { label: string; detail: string } {
  switch (s.kind) {
    case "llm":
      return {
        label: s.ok ? "Model call" : "Model call failed",
        detail: `${s.provider} ${s.model}, ${s.inputTokens + s.outputTokens} tokens, ${s.latencyMs} ms, ${usd(s.costUsd)}${s.error ? `, ${s.error}` : ""}`,
      };
    case "tool":
      return {
        label: `Tool ${s.tool}`,
        detail: `${s.ok ? "ok" : `failed: ${s.error ?? ""}`}, ${s.latencyMs} ms`,
      };
    case "propose":
      return {
        label: `Proposed ${s.actionKind}`,
        detail: `${s.result}${s.issues?.length ? `: ${s.issues.join("; ")}` : ""}`,
      };
    case "guard":
      return {
        label: `Guard ${s.verdict}`,
        detail: `by ${s.by}, score ${s.score.toFixed(2)}${s.reasons.length ? `, ${s.reasons.join(", ")}` : ""}`,
      };
    case "fallback":
      return { label: "Fell back to rules", detail: `${s.reason}: ${s.message}` };
    default:
      return { label: "Note", detail: s.text };
  }
}

function RunDetail({ eventId, run }: { eventId: string; run: AgentRun }) {
  const [data, setData] = React.useState<AgentRunResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    api
      .call("getAgentRun", { params: { eventId, runId: run.id } })
      .then(setData, (e: unknown) => setError(e instanceof Error ? e.message : "Could not load steps"));
  }, [eventId, run.id]);
  if (error) return <p className="text-sm text-danger-text">{error}</p>;
  if (!data) return <Skeleton className="h-16" />;
  return (
    <ol className="flex flex-col gap-2.5 border-l border-border-strong pl-4">
      {data.steps.map((s) => {
        const { label, detail } = stepLine(s);
        return (
          <li
            key={s.id}
            className="relative text-sm before:absolute before:top-2 before:-left-[19.5px] before:size-1.5 before:rounded-full before:bg-curtain"
          >
            <span className="font-medium">{label}</span>
            <span className="font-mono text-xs text-fg-muted">: {detail}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** The glass box: every agent run, its model calls, tools, guard verdicts and proposals. */
export function AgentTimeline({ eventId }: { eventId: string }) {
  const [runs, setRuns] = React.useState<AgentRun[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  React.useEffect(() => {
    api.call("listAgentRuns", { params: { eventId }, query: { limit: 50 } }).then(
      (r) => setRuns(r.items),
      (e: unknown) => setError(e instanceof Error ? e.message : "Could not load runs"),
    );
  }, [eventId]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Glass box"
        title="Timeline"
        description="Every agent run: what it read, which model answered, what it cost and what it proposed."
      />
      {error ? (
        <Alert variant="danger" title="Could not load the timeline">
          {error}
        </Alert>
      ) : null}
      {!runs && !error ? <Skeleton className="h-40" /> : null}
      {runs && !runs.length ? (
        <EmptyState title="No agent runs yet" description="Runs appear here as agents wake up." />
      ) : null}
      <ul className="flex flex-col gap-3">
        {(runs ?? []).map((r) => (
          <li
            key={r.id}
            {...spotlight}
            className={cn(SPOT, "rounded-card border border-border bg-surface shadow-card")}
          >
            <details className="group">
              <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-3 rounded-card p-4 [&::-webkit-details-marker]:hidden">
                <AgentAvatar agent={r.agent} size="sm" />
                <span className="font-medium capitalize">{r.agent.replace("_", " ")}</span>
                <span className="font-mono text-xs text-fg-muted">
                  {r.trigger.eventType ?? r.trigger.type}, {formatDateTime(r.startedAt)}
                </span>
                <Badge
                  tone={r.status === "succeeded" ? "approved" : r.status === "failed" ? "danger" : "pending"}
                >
                  {r.status}
                </Badge>
                {r.simulation ? <Badge tone="agent">simulation</Badge> : null}
                <span className="ml-auto font-mono text-xs text-fg-muted tabular-nums">
                  {r.inputTokens + r.outputTokens} tokens, {usd(r.costUsd)}
                  {r.latencyMs !== undefined ? `, ${(r.latencyMs / 1000).toFixed(1)} s` : ""}
                  {r.proposalIds.length ? `, ${r.proposalIds.length} proposed` : ""}
                </span>
                <ChevronDown
                  aria-hidden
                  className="size-4 text-fg-muted transition-transform duration-300 group-open:rotate-180"
                />
              </summary>
              <div className="border-t border-border p-4">
                <RunDetail eventId={eventId} run={r} />
              </div>
            </details>
          </li>
        ))}
      </ul>
    </div>
  );
}
