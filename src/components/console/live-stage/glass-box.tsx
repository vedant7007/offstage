"use client";

import * as React from "react";
import type { ActionProposal, AgentName, AgentRun, AgentStep, DeliveryStatsResponse } from "@/contracts";
import { api } from "@/lib/api-client";
import { formatTime } from "@/lib/time";
import {
  Badge,
  EmptyState,
  KeyValueList,
  ProposalCard,
  Sheet,
  SheetContent,
  Skeleton,
} from "@/components/ui";
import { agentOf, ApproveButton, metaOf, RejectButton } from "../proposal-bits";

const usd = (n: number) => `$${n.toFixed(4)}`;

function StepLine({ s }: { s: AgentStep }) {
  switch (s.kind) {
    case "llm":
      return (
        <>
          <Badge tone={s.ok ? "info" : "danger"}>Model</Badge> {s.provider} {s.model}: {s.inputTokens} in,{" "}
          {s.outputTokens} out, {usd(s.costUsd)}, {s.latencyMs} ms
          {s.ok ? "" : ` (failed: ${s.error ?? "error"})`}
        </>
      );
    case "tool":
      return (
        <>
          <Badge tone="neutral">Tool</Badge> {s.tool}, {s.latencyMs} ms{s.ok ? "" : ` (failed)`}
        </>
      );
    case "propose":
      return (
        <>
          <Badge tone="agent">Proposed</Badge> {s.actionKind}: {s.result}
          {s.status ? `, ${s.status}` : ""}
        </>
      );
    case "guard":
      return (
        <>
          <Badge tone={s.verdict === "block" ? "danger" : "neutral"}>Guard</Badge> {s.verdict} by{" "}
          {s.by.replace("_", " ")}
        </>
      );
    case "fallback":
      return (
        <>
          <Badge tone="pending">Rules fallback</Badge> {s.reason.replace("_", " ")}
        </>
      );
    default:
      return (
        <>
          <Badge tone="neutral">Note</Badge> {"text" in s ? s.text : ""}
        </>
      );
  }
}

function RunTrace({ eventId, agent }: { eventId: string; agent: AgentName }) {
  const [data, setData] = React.useState<{ run: AgentRun; steps: AgentStep[] } | null | undefined>(undefined);
  React.useEffect(() => {
    api
      .call("listAgentRuns", { params: { eventId }, query: { agent, limit: 1 } })
      .then((r) =>
        r.items[0] ? api.call("getAgentRun", { params: { eventId, runId: r.items[0].id } }) : null,
      )
      .then(setData, () => setData(null));
  }, [eventId, agent]);
  if (data === undefined) return <Skeleton className="h-32" />;
  if (!data)
    return <EmptyState title="No runs yet" description="This agent has not been woken for this event." />;
  const { run, steps } = data;
  return (
    <section aria-label="Latest run" className="flex flex-col gap-3">
      <KeyValueList
        items={[
          { label: "Status", value: run.status },
          { label: "Woken by", value: run.trigger.eventType ?? run.trigger.type },
          { label: "Started", value: formatTime(run.startedAt) },
          { label: "Model tier", value: run.modelTier },
          { label: "Tokens", value: `${run.inputTokens} in, ${run.outputTokens} out` },
          { label: "Cost", value: usd(run.costUsd) },
          { label: "Latency", value: run.latencyMs ? `${run.latencyMs} ms` : "running" },
        ]}
      />
      <ol className="flex flex-col gap-2 text-sm">
        {steps.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-fg-muted tabular-nums">{formatTime(s.at)}</span>
            <StepLine s={s} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function Proposals({
  eventId,
  items,
  onDone,
}: {
  eventId: string;
  items: ActionProposal[];
  onDone: () => void;
}) {
  if (!items.length) return null;
  return (
    <section aria-label="Waiting for approval" className="flex flex-col gap-3">
      <h3 className="font-semibold">Waiting for approval</h3>
      {items.map((p) => (
        <ProposalCard
          key={p.id}
          agent={agentOf(p)}
          summary={p.summary}
          rationale={p.rationale}
          status={p.status}
          tier={p.riskTier}
          evidence={p.evidence}
          impact={p.impact}
          meta={metaOf(p)}
          headingLevel="h4"
          actions={
            <>
              <ApproveButton eventId={eventId} proposal={p} onDone={onDone} />
              <RejectButton eventId={eventId} proposal={p} onDone={onDone} />
            </>
          }
        />
      ))}
    </section>
  );
}

/** The glass box: what a node did, with the model, tokens, cost, the facts it cited, and its proposals. */
export function GlassBox(props: {
  eventId: string;
  open: string | null;
  onClose: () => void;
  pending: ActionProposal[];
  delivery: DeliveryStatsResponse["channels"];
  onChanged: () => void;
  label: (a: string) => string;
}) {
  const id = props.open;
  const [kind, name] = id ? (id.split(":") as [string, string]) : ["", ""];
  const title =
    kind === "agent"
      ? props.label(name)
      : kind === "gate"
        ? name === "faculty"
          ? "Faculty approver"
          : "Event head"
        : kind === "channel"
          ? props.label(name)
          : props.label(name);
  const mine = props.pending.filter((p) => p.proposedBy.kind === "agent" && p.proposedBy.agent === name);
  const gated = props.pending.filter((p) =>
    name === "faculty" ? p.riskTier === "T3" : p.riskTier === "T2" || p.riskTier === "T3",
  );
  const ch = props.delivery.find((c) => c.channel === name);
  return (
    <Sheet open={Boolean(id)} onOpenChange={(o) => !o && props.onClose()}>
      <SheetContent title={title}>
        <div className="flex flex-col gap-6">
          {kind === "agent" ? (
            <>
              <RunTrace eventId={props.eventId} agent={name as AgentName} />
              <Proposals eventId={props.eventId} items={mine} onDone={props.onChanged} />
            </>
          ) : null}
          {kind === "gate" ? (
            gated.length ? (
              <Proposals eventId={props.eventId} items={gated} onDone={props.onChanged} />
            ) : (
              <EmptyState title="Nothing waiting" description="Proposals that need a person appear here." />
            )
          ) : null}
          {kind === "channel" ? (
            ch ? (
              <KeyValueList
                items={[
                  { label: "Real sends", value: ch.real },
                  { label: "Mock deliveries", value: ch.mock },
                  { label: "Queued", value: ch.pending },
                  { label: "Failed", value: ch.failed },
                  { label: "Skipped", value: ch.skipped },
                ]}
              />
            ) : (
              <EmptyState
                title="No messages yet"
                description="Approved announcements go out on this channel."
              />
            )
          ) : null}
          {kind === "data" ? (
            <p className="text-sm text-fg-muted">
              Agents read this data through read-only services. It changes only when an approved proposal
              runs.
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
