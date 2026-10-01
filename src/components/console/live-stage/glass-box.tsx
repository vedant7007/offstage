"use client";

import * as React from "react";
import type {
  ActionProposal,
  AgentName,
  AgentRun,
  AgentStep,
  DeliveryStatsResponse,
  Evidence,
} from "@/contracts";
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
import { duration, humanize, sentence } from "../text";
import { voiceShared } from "../voice/use-voice";

/** The last voice turn with the Commander: what it heard, what it cost, how fast it answered. */
function VoiceTurn() {
  const t = React.useSyncExternalStore(voiceShared.subscribe, voiceShared.get, () => null);
  if (!t) return null;
  const c = t.costUsd;
  return (
    <section aria-label="Last voice turn" className="flex flex-col gap-2">
      <h3 className="kicker text-fg-muted">Last voice turn</h3>
      <KeyValueList
        items={[
          { label: "Heard", value: t.you },
          { label: "Intent", value: t.intent ? `${humanize(t.intent)} (${t.by})` : "Working" },
          {
            label: "First audio",
            value: t.latencyMs ? `${duration(t.latencyMs)} after you stopped` : "Not yet",
          },
          {
            label: "Voice cost",
            value: `${usd(c.stt + c.model + c.voice)} (speech to text ${usd(c.stt)}, model ${usd(c.model)}, Murf ${usd(c.voice)})`,
          },
        ]}
      />
    </section>
  );
}

const usd = (n: number) => `$${n.toFixed(4)}`;
const CHIP = "font-mono text-[0.6875rem] uppercase tracking-[0.06em]";

function StepLine({ s }: { s: AgentStep }) {
  switch (s.kind) {
    case "llm":
      return (
        <>
          <Badge tone={s.ok ? "info" : "danger"} className={CHIP}>
            Model
          </Badge>{" "}
          {s.provider} {s.model}: {s.inputTokens} in, {s.outputTokens} out, {usd(s.costUsd)}, {s.latencyMs} ms
          {s.ok ? "" : ` (failed: ${s.error ?? "error"})`}
        </>
      );
    case "tool":
      return (
        <>
          <Badge tone="neutral" className={CHIP}>
            Tool
          </Badge>{" "}
          {s.tool}, {s.latencyMs} ms{s.ok ? "" : ` (failed)`}
        </>
      );
    case "propose":
      return (
        <>
          <Badge tone="agent" className={CHIP}>
            Proposed
          </Badge>{" "}
          {s.actionKind}: {s.result}
          {s.status ? `, ${s.status}` : ""}
        </>
      );
    case "guard":
      return (
        <>
          <Badge tone={s.verdict === "block" ? "danger" : "neutral"} className={CHIP}>
            Guard
          </Badge>{" "}
          {humanize(s.verdict)} by {s.by.replace(/_/g, " ")}
        </>
      );
    case "fallback":
      return (
        <>
          <Badge tone="pending" className={CHIP}>
            Rules fallback
          </Badge>{" "}
          {s.reason.replace(/_/g, " ")}
        </>
      );
    default:
      return (
        <>
          <Badge tone="neutral" className={CHIP}>
            Note
          </Badge>{" "}
          {"text" in s ? s.text : ""}
        </>
      );
  }
}

function RunTrace({ eventId, agent }: { eventId: string; agent: AgentName }) {
  const [data, setData] = React.useState<
    { run: AgentRun; steps: AgentStep[]; cited: Evidence[] } | null | undefined
  >(undefined);
  React.useEffect(() => {
    api
      .call("listAgentRuns", { params: { eventId }, query: { agent, limit: 1 } })
      .then(async (r) => {
        if (!r.items[0]) return null;
        const res = await api.call("getAgentRun", { params: { eventId, runId: r.items[0].id } });
        // The facts the run cited: the evidence on the proposals it made.
        const props = await Promise.all(
          res.run.proposalIds
            .slice(0, 5)
            .map((id) => api.call("getProposal", { params: { eventId, proposalId: id } }).catch(() => null)),
        );
        const seen = new Set<string>();
        const cited = props
          .flatMap((p) => p?.proposal.evidence ?? [])
          .filter((e) => !seen.has(e.ref) && Boolean(seen.add(e.ref)));
        return { ...res, cited };
      })
      .then(setData, () => setData(null));
  }, [eventId, agent]);
  if (data === undefined) return <Skeleton className="h-32" />;
  if (!data)
    return <EmptyState title="No runs yet" description="This agent has not woken up for this event." />;
  const { run, steps, cited } = data;
  const models = [
    ...new Set(steps.flatMap((s) => (s.kind === "llm" && s.ok ? [`${s.provider} ${s.model}`] : []))),
  ];
  return (
    <section aria-label="Latest run" className="flex flex-col gap-3">
      <KeyValueList
        items={[
          { label: "Status", value: humanize(run.status) },
          { label: "Woken by", value: humanize(run.trigger.eventType ?? run.trigger.type) },
          { label: "Started", value: formatTime(run.startedAt) },
          { label: "Model", value: models.join(", ") || `No model call (${run.modelTier} tier)` },
          { label: "Tokens", value: `${run.inputTokens} in, ${run.outputTokens} out` },
          { label: "Cost", value: usd(run.costUsd) },
          { label: "Latency", value: run.latencyMs ? duration(run.latencyMs) : "Running" },
        ]}
      />
      {cited.length ? (
        <section aria-label="Cited facts" className="flex flex-col gap-1">
          <h3 className="kicker text-fg-muted">Cited facts</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {cited.map((e) => (
              <li key={e.ref} className="flex flex-wrap items-center gap-1.5">
                <Badge tone="neutral" className={CHIP}>
                  {e.type}
                </Badge>{" "}
                {e.label}
                <span className="font-mono text-xs text-fg-muted">{e.ref}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      <h3 className="kicker text-fg-muted">Steps</h3>
      {steps.length ? (
        <ol className="flex flex-col gap-2 border-l border-border pl-3 text-sm">
          {steps.map((s) => (
            <li key={s.id} className="flex flex-wrap items-center gap-1.5">
              <span className="font-mono text-xs text-fg-muted tabular-nums">{formatTime(s.at)}</span>
              <StepLine s={s} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-fg-muted">No steps were recorded for this run.</p>
      )}
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
      <h3 className="kicker text-fg-muted">Waiting for approval</h3>
      {items.map((p) => (
        <ProposalCard
          key={p.id}
          agent={agentOf(p)}
          summary={sentence(p.summary)}
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
              {name === "commander" ? <VoiceTurn /> : null}
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
