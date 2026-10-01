"use client";

import * as React from "react";
import type { WhatIfResult } from "@/contracts";
import { api } from "@/lib/api-client";
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Field,
  Input,
  PageHeader,
  TierBadge,
} from "@/components/ui";
import { CountUp, Kicker } from "./fx";

const EXAMPLES = [
  "What if 30% more people show up?",
  "What if it rains?",
  "What if the main speaker cancels?",
  "What if the budget drops by 50k?",
  "What if we lose Lab 204?",
];

const DOMAIN: Record<string, string> = {
  registrations: "Registrations",
  schedule: "Schedule",
  crew: "Crew",
  finance: "Money",
  logistics: "Logistics",
  planning: "Planning",
};

/** Ask "what if", see the impact per area and what the agents would propose. Nothing real changes. */
export function WhatIfView({ eventId }: { eventId: string }) {
  const [scenario, setScenario] = React.useState("");
  const [result, setResult] = React.useState<WhatIfResult | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = (text: string) => {
    if (text.trim().length < 3) return;
    setScenario(text);
    setBusy(true);
    setError(null);
    api
      .call("whatIf", { body: { eventId, scenario: text } })
      .then(setResult, (e: unknown) =>
        setError(e instanceof Error ? e.message : "Could not run the simulation"),
      )
      .finally(() => setBusy(false));
  };

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Sandbox, nothing real changes"
        title="What if"
        description="Try a scenario on a copy of the event. The agents re-plan in a sandbox; nothing real changes."
      />
      <form
        className="flex flex-col gap-4 rounded-card border border-border bg-surface p-5 shadow-card"
        onSubmit={(e) => {
          e.preventDefault();
          run(scenario);
        }}
      >
        <Field label="Scenario">
          <Input
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            placeholder="What if 30% more people show up?"
            maxLength={500}
          />
        </Field>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="submit" loading={busy}>
            Simulate
          </Button>
          <span aria-hidden className="kicker mx-1 text-fg-muted">
            or try
          </span>
          {EXAMPLES.map((x) => (
            <Button
              key={x}
              type="button"
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => run(x)}
            >
              {x}
            </Button>
          ))}
        </div>
      </form>
      {error ? (
        <Alert variant="danger" title="Simulation">
          {error}
        </Alert>
      ) : null}
      {result ? (
        <section aria-label="Simulation result" className="flex flex-col gap-4">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-2">
            <div className="flex flex-col gap-1">
              <Kicker className="text-agent-text">Simulation only</Kicker>
              <p className="flex items-baseline gap-2">
                <CountUp
                  to={Math.round(result.confidence * 100)}
                  format={(n) => `${Math.round(n)}%`}
                  className="font-mono text-4xl font-medium"
                />
                <span className="text-sm text-fg-muted">confidence</span>
              </p>
            </div>
            {result.assumptions.length ? (
              <p className="max-w-2xl text-sm text-fg-muted">
                {result.assumptions.map((a) => `${a.label}: ${a.value}.`).join(" ")}
              </p>
            ) : null}
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {result.impacts.map((i, n) => (
              <Card key={`${i.domain}-${n}`}>
                <CardHeader>
                  <CardTitle as="h2">{DOMAIN[i.domain] ?? i.domain}</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-3">
                  <p>{i.summary}</p>
                  <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm">
                    {i.metrics.map((m) => (
                      <React.Fragment key={m.label}>
                        <dt className="text-fg-muted">{m.label}</dt>
                        <dd className="text-end font-mono tabular-nums">
                          {m.before.toLocaleString("en-IN")} to{" "}
                          <strong>{m.after.toLocaleString("en-IN")}</strong>
                          {m.unit ? ` ${m.unit}` : ""}
                        </dd>
                      </React.Fragment>
                    ))}
                  </dl>
                </CardContent>
              </Card>
            ))}
          </div>
          {result.recommendations.length ? (
            <Card>
              <CardHeader>
                <CardTitle as="h2">What the agents would propose</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="flex flex-col gap-2">
                  {result.recommendations.map((r, n) =>
                    r.status === "simulated" ? (
                      <li key={n} className="flex flex-wrap items-center gap-2">
                        <TierBadge tier={r.riskTier} />
                        <span>{r.summary}</span>
                        <Badge tone="neutral">simulated</Badge>
                      </li>
                    ) : null,
                  )}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
