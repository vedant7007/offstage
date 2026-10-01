"use client";

import * as React from "react";
import type { DemoScenario } from "@/contracts";
import { api } from "@/lib/api-client";
import { Button, toast } from "@/components/ui";
import { isShowcase } from "@/showcase/flag";
import { Kicker } from "./fx";
import { RealSendsToggle } from "./real-sends";

type Scenario = DemoScenario | "emergency";
const SCENARIOS: { scenario: Scenario; label: string }[] = [
  { scenario: "speaker_cancel", label: "Keynote speaker cancels" },
  { scenario: "lunch_confusion", label: "Lunch confusion" },
  { scenario: "volunteer_noshow", label: "Volunteer no-show" },
  { scenario: "queue_spike", label: "Check-in queue spike" },
  { scenario: "budget_breach", label: "Budget breach" },
  { scenario: "projector_voice_note", label: "Projector voice note" },
  // Live, a volunteer voice note raises this; the showcase replays that recording from a button.
  ...(isShowcase() ? [{ scenario: "emergency" as const, label: "Medical emergency" }] : []),
];

const start = (scenario: Scenario) =>
  scenario === "emergency"
    ? import("@/showcase/engine").then((e) => e.trigger(scenario))
    : api.call("demoTrigger", { body: { scenario } });

/** DEMO_MODE only: fire a scripted disruption. The agents react through the worker, like a real event. */
export function DemoScenarios() {
  const [busy, setBusy] = React.useState<Scenario | null>(null);
  return (
    <section
      aria-labelledby="demo-scenarios"
      className="flex flex-col gap-3 rounded-card border border-dashed border-agent/70 bg-surface px-4 py-4 depth-2 sm:px-5"
    >
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <Kicker className="text-agent-text">Demo only</Kicker>
        <h2 id="demo-scenarios" className="text-base font-medium tracking-[-0.015em]">
          Demo scenarios
        </h2>
        <p className="text-sm text-fg-muted">Fire a scripted disruption and watch the agents react.</p>
      </div>
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
        {SCENARIOS.map(({ scenario, label }) => (
          <Button
            key={scenario}
            variant="secondary"
            size="sm"
            className="shrink-0"
            loading={busy === scenario}
            disabled={busy !== null && busy !== scenario}
            onClick={() => {
              setBusy(scenario);
              start(scenario)
                .then(
                  (r) => toast.success(r.message),
                  (e: unknown) =>
                    toast.error(e instanceof Error ? e.message : "Could not start the scenario"),
                )
                .finally(() => setBusy(null));
            }}
          >
            {label}
          </Button>
        ))}
      </div>
      <RealSendsToggle />
    </section>
  );
}
