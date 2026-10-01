"use client";

import * as React from "react";
import type { AgentRun, AgentRunResponse, AgentStep } from "@/contracts";
import { api } from "@/lib/api-client";
import { Alert, AgentAvatar, Badge, EmptyState, PageHeader, Skeleton } from "@/components/ui";
import { ChevronDown, History } from "lucide-react";
import { formatDateTime } from "@/lib/time";
import { duration, humanize } from "./text";

const usd = (n: number) => `$${n.toFixed(n < 0.01 ? 5 : 3)}`;

function stepLine(s: AgentStep): { label: string; detail: string } {
  switch (s.kind) {
    case "llm":
      return {
        label: s.ok ? "Model call" : "Model call failed",
        detail: `${s.provider} ${s.model}, ${s.inputTokens + s.outputTokens} tokens, ${duration(s.latencyMs)}, ${usd(s.costUsd)}${s.error ? `, ${s.error}` : ""}`,
      };
    case "tool":
      return {
        label: `Tool ${s.tool}`,
        detail: `${s.ok ? "ok" : `failed: ${s.error ?? ""}`}, ${duration(s.latencyMs)}`,
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
      return { label: "Fell back to rules", detail: `${s.reason.replace(/_/g, " ")}: ${s.message}` };
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
  if (!data.steps.length)
    return <p className="text-sm text-fg-muted">No steps were recorded for this run.</p>;
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
        description="Every agent run: what woke it, which model answered, what it cost and what it proposed."
      />
      {error ? (
        <Alert variant="danger" title="Could not load the timeline">
          {error}
        </Alert>
      ) : null}
      {!runs && !error ? (
        <ul aria-busy className="flex flex-col gap-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <li
              key={i}
              aria-hidden
              className="flex min-h-[4.625rem] items-center gap-3 rounded-card border border-border bg-surface p-4 depth-1"
            >
              <Skeleton className="size-7 rounded-full" />
              <span className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-3 w-28 rounded-full" />
                <Skeleton className="h-2.5 w-56 max-w-full rounded-full" />
              </span>
              <Skeleton className="hidden h-2.5 w-48 rounded-full sm:block" />
            </li>
          ))}
        </ul>
      ) : null}
      {runs && !runs.length ? (
        <EmptyState
          icon={<History />}
          title="No agent runs yet"
          description="Every run lands here the moment an agent wakes up, with its model, cost and proposals."
        />
      ) : null}
      <ul className="flex flex-col gap-3">
        {(runs ?? []).map((r) => (
          <li
            key={r.id}
            // Off-screen rows skip layout and paint; a closed row is about 74px tall.
            className="spot lift rounded-card border border-border bg-surface depth-2 [contain-intrinsic-size:auto_4.625rem] [content-visibility:auto]"
          >
            <details className="group">
              <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center gap-3 rounded-card p-4 [&::-webkit-details-marker]:hidden">
                <AgentAvatar agent={r.agent} size="sm" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium capitalize">{r.agent.replace("_", " ")}</span>
                  <span className="text-sm text-fg-muted">
                    {humanize(r.trigger.eventType ?? r.trigger.type)}, {formatDateTime(r.startedAt)}
                  </span>
                </span>
                <Badge
                  tone={r.status === "succeeded" ? "approved" : r.status === "failed" ? "danger" : "pending"}
                >
                  {humanize(r.status)}
                </Badge>
                {r.simulation ? <Badge tone="agent">Simulation</Badge> : null}
                <span className="ml-auto font-mono text-xs text-fg-muted tabular-nums">
                  {r.inputTokens + r.outputTokens
                    ? `${(r.inputTokens + r.outputTokens).toLocaleString("en-IN")} tokens, ${usd(r.costUsd)}`
                    : "No model call"}
                  {r.latencyMs !== undefined ? `, ${duration(r.latencyMs)}` : ""}
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
