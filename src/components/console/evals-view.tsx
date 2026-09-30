"use client";

import * as React from "react";
import type { EvalsResponse } from "@/contracts";
import { api } from "@/lib/api-client";
import { formatDayShort, formatTime } from "@/lib/time";
import {
  AgentAvatar,
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DataTable,
  EmptyState,
  PageHeader,
  Skeleton,
  toast,
} from "@/components/ui";

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
const usd = (x: number) => `$${x.toFixed(4)}`;

function Metric(props: { title: string; value: string; detail: string; pass?: boolean }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium text-fg-muted">{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <span className="text-3xl font-semibold tabular-nums">{props.value}</span>
          {props.pass === undefined ? null : (
            <Badge tone={props.pass ? "approved" : "danger"}>{props.pass ? "Pass" : "Below target"}</Badge>
          )}
        </div>
        <p className="text-sm text-fg-muted">{props.detail}</p>
      </CardContent>
    </Card>
  );
}

/** Evals: the golden set on record (rerun by the owner) and how the agents are doing at this event. */
export function EvalsView({ eventId }: { eventId: string }) {
  const [e, setE] = React.useState<EvalsResponse | null>(null);
  const [failed, setFailed] = React.useState(false);
  const load = React.useCallback(
    () => api.call("evals", { params: { eventId } }).then(setE, () => setFailed(true)),
    [eventId],
  );
  React.useEffect(() => {
    void load();
  }, [load]);
  // While a run is going, check every 3 seconds.
  const running = Boolean(e?.running);
  React.useEffect(() => {
    if (!running) return;
    const id = setInterval(() => void load(), 3000);
    return () => clearInterval(id);
  }, [running, load]);

  if (failed) return <Alert variant="danger" title="The evals could not be loaded." />;
  if (!e) return <Skeleton className="h-96" />;
  const g = e.golden;
  const live = e.live;
  const runs = live.agents.reduce((s, a) => s + a.runs, 0);
  const cost = live.agents.reduce((s, a) => s + a.totalCostUsd, 0);
  const latency = runs ? Math.round(live.agents.reduce((s, a) => s + a.avgLatencyMs * a.runs, 0) / runs) : 0;
  const run = () =>
    api
      .call("runEvals", { params: { eventId } })
      .then(setE, (err: unknown) =>
        toast.error(err instanceof Error ? err.message : "Could not start the evals"),
      );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Evals"
        description={
          g
            ? `Golden set last run ${formatDayShort(g.at)}, ${formatTime(g.at)} on the ${g.profile} profile, ${usd(g.costUsd)} of model time.`
            : "The golden set has not been run on this server yet."
        }
        actions={
          e.canRun ? (
            <Button onClick={() => void run()} loading={running} disabled={running}>
              {running ? "Running the golden set" : "Run evals"}
            </Button>
          ) : (
            <Badge tone="neutral">Only the event owner can rerun</Badge>
          )
        }
      />
      {running ? (
        <Alert variant="info" title="Running the golden set">
          The golden helpdesk questions and guard cases run on the real models. This takes two to three
          minutes; the numbers below update when it is done.
        </Alert>
      ) : null}
      {e.lastError && !running ? (
        <Alert variant="danger" title="The last run failed">
          {e.lastError}
        </Alert>
      ) : null}

      <h2 className="text-base font-semibold">Golden set</h2>
      {g ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            title="Helpdesk grounding"
            value={pct(g.helpdesk.groundingRate)}
            detail={`Answered with a citation of the right document, ${g.helpdesk.questions} questions. No-source refusal ${pct(g.helpdesk.refusalRate)}.`}
            pass={g.pass.grounding && g.pass.refusal}
          />
          <Metric
            title="Prompt injections blocked"
            value={pct(g.guard.injectionBlockRate)}
            detail={`${g.guard.injections} attacks. Harmless questions let through: ${pct(g.guard.benignAllowRate)}.`}
            pass={g.pass.injection && g.pass.benign}
          />
          <Metric
            title="Solver checks passed"
            value={`${g.solver.passed} of ${g.solver.checked}`}
            detail="Every schedule option for every possible cancellation, re-checked for clashes."
            pass={g.pass.solver}
          />
          <Metric
            title="Retrieval"
            value={pct(g.retrieval.hitRate)}
            detail={`The right document in the top ${g.retrieval.k}. Helpdesk answers in ${g.helpdesk.avgLatencyMs} ms on average.`}
            pass={g.pass.retrieval}
          />
        </div>
      ) : (
        <EmptyState
          title="No golden run yet"
          description={
            e.canRun ? "Run evals to measure this server's models." : "Ask the event owner to run them."
          }
        />
      )}
      {g?.misses.length ? (
        <details className="rounded-card border border-border bg-surface p-3 text-sm">
          <summary className="cursor-pointer font-semibold">What missed ({g.misses.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
            {g.misses.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <h2 className="text-base font-semibold">At this event</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric title="Agent runs" value={String(runs)} detail={`${usd(cost)} of model time in all.`} />
        <Metric
          title="Average per run"
          value={runs ? usd(cost / runs) : usd(0)}
          detail={`${latency} ms average latency.`}
        />
        <Metric
          title="Injection attempts blocked"
          value={String(live.injectionsBlocked)}
          detail={`Of ${live.guardScreened} messages the guard screened.`}
        />
      </div>
      <DataTable
        caption="Latency and cost per agent run"
        rowKey={(a) => a.agent}
        rows={live.agents}
        columns={[
          {
            key: "agent",
            header: "Agent",
            cell: (a) => <AgentAvatar agent={a.agent} showName size="sm" />,
            primary: true,
          },
          { key: "runs", header: "Runs", cell: (a) => a.runs, align: "end" },
          { key: "failed", header: "Failed", cell: (a) => a.failed, align: "end" },
          { key: "latency", header: "Avg latency", cell: (a) => `${a.avgLatencyMs} ms`, align: "end" },
          { key: "cost", header: "Avg cost", cell: (a) => usd(a.avgCostUsd), align: "end" },
          { key: "total", header: "Total cost", cell: (a) => usd(a.totalCostUsd), align: "end" },
        ]}
        empty={<EmptyState title="No agent runs at this event yet" />}
      />
    </div>
  );
}
