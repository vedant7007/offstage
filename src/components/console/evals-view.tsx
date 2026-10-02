"use client";

import * as React from "react";
import type { EvalsResponse } from "@/contracts";
import { FlaskConical } from "lucide-react";
import { api } from "@/lib/api-client";
import { isShowcase } from "@/showcase/flag";
import { formatDayShort, formatTime } from "@/lib/time";
import {
  AgentAvatar,
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  DataTable,
  EmptyState,
  PageHeader,
  toast,
} from "@/components/ui";
import { CountUp, Kicker, PageSkeleton } from "./fx";
import { duration } from "./text";

const pct = (x: number) => `${Math.round(x * 1000) / 10}%`;
/** A rate (0 to 1) that counts up to its percentage. */
const Pct = ({ x }: { x: number }) => <CountUp to={x} format={pct} />;
const usd = (x: number) => `$${x.toFixed(4)}`;

function Metric(props: { title: string; value: React.ReactNode; detail: string; pass?: boolean }) {
  return (
    <Card>
      <CardContent>
        <h3 className="kicker text-fg-muted">{props.title}</h3>
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-4xl font-medium tracking-[-0.02em] tabular-nums">
            {props.value}
          </span>
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

  if (failed)
    return (
      <Alert variant="danger" title="The evals could not be loaded.">
        Check your connection, then reload the page.
      </Alert>
    );
  if (!e) return <PageSkeleton tiles={3} />;
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
        eyebrow="Quality, measured"
        title="Evals"
        description={
          g
            ? `Golden set last run ${formatDayShort(g.at)}, ${formatTime(g.at)} on the ${g.profile} profile, ${usd(g.costUsd)} of model time.`
            : "How well the agents answer, refuse and plan, measured on a fixed golden set and live at this event."
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
      {isShowcase() ? (
        <Alert variant="info" title="Recorded showcase run">
          The numbers below come from a re-recording of the demo on small local models (the{" "}
          {g?.profile ?? "dev"} profile). Measured during the hackathon on the demo profile (Groq and
          Bedrock): helpdesk grounding 95%, no-source refusal 100%, 20 of 20 injections blocked, 42 of 42
          solver checks, retrieval 97.5%.
        </Alert>
      ) : null}
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

      <div className="flex flex-col gap-1 pt-2">
        <Kicker>Before the event</Kicker>
        <h2 className="text-xl font-medium tracking-[-0.02em]">Golden set</h2>
      </div>
      {g ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric
            title="Helpdesk grounding"
            value={<Pct x={g.helpdesk.groundingRate} />}
            detail={`Answered with a citation of the right document, ${g.helpdesk.questions} questions. No-source refusal ${pct(g.helpdesk.refusalRate)}.`}
            pass={g.pass.grounding && g.pass.refusal}
          />
          <Metric
            title="Prompt injections blocked"
            value={<Pct x={g.guard.injectionBlockRate} />}
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
            value={<Pct x={g.retrieval.hitRate} />}
            detail={`The right document in the top ${g.retrieval.k}. Helpdesk answers in ${duration(g.helpdesk.avgLatencyMs)} on average.`}
            pass={g.pass.retrieval}
          />
        </div>
      ) : (
        <EmptyState
          icon={<FlaskConical />}
          title="No golden run yet"
          description={
            e.canRun
              ? "Run evals to score grounding, injection blocking, the solver and retrieval on this server's models."
              : "Ask the event owner to run them."
          }
        />
      )}
      {g?.misses.length ? (
        <details className="rounded-card border border-border bg-surface p-4 text-sm depth-2">
          <summary className="cursor-pointer font-medium">What missed ({g.misses.length})</summary>
          <ul className="mt-2 flex flex-col gap-1 font-mono text-xs">
            {g.misses.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="flex flex-col gap-1 pt-4">
        <Kicker>Live</Kicker>
        <h2 className="text-xl font-medium tracking-[-0.02em]">At this event</h2>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Metric
          title="Agent runs"
          value={<CountUp to={runs} />}
          detail={`${usd(cost)} of model time in all.`}
        />
        <Metric
          title="Average per run"
          value={runs ? usd(cost / runs) : usd(0)}
          detail={`${duration(latency)} average latency.`}
        />
        <Metric
          title="Injection attempts blocked"
          value={<CountUp to={live.injectionsBlocked} />}
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
          { key: "latency", header: "Avg latency", cell: (a) => duration(a.avgLatencyMs), align: "end" },
          { key: "cost", header: "Avg cost", cell: (a) => usd(a.avgCostUsd), align: "end" },
          { key: "total", header: "Total cost", cell: (a) => usd(a.totalCostUsd), align: "end" },
        ]}
        empty={<EmptyState title="No agent runs at this event yet" />}
      />
    </div>
  );
}
