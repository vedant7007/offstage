"use client";

import * as React from "react";
import type { DemoScenario } from "@/contracts";
import { api } from "@/lib/api-client";
import { Button, toast } from "@/components/ui";
import { RealSendsToggle } from "./real-sends";

const SCENARIOS: { scenario: DemoScenario; label: string }[] = [
  { scenario: "speaker_cancel", label: "Keynote speaker cancels" },
  { scenario: "lunch_confusion", label: "Lunch confusion" },
  { scenario: "volunteer_noshow", label: "Volunteer no-show" },
  { scenario: "queue_spike", label: "Check-in queue spike" },
  { scenario: "budget_breach", label: "Budget breach" },
  { scenario: "projector_voice_note", label: "Projector voice note" },
];

/** DEMO_MODE only: fire a scripted disruption. The agents react through the worker, like a real event. */
export function DemoScenarios() {
  const [busy, setBusy] = React.useState<DemoScenario | null>(null);
  return (
    <section
      aria-labelledby="demo-scenarios"
      className="flex flex-col gap-3 rounded-card border border-dashed border-agent p-4"
    >
      <h2 id="demo-scenarios" className="text-base font-semibold">
        Demo scenarios
      </h2>
      <div className="flex flex-wrap gap-2">
        {SCENARIOS.map(({ scenario, label }) => (
          <Button
            key={scenario}
            variant="secondary"
            size="sm"
            loading={busy === scenario}
            disabled={busy !== null && busy !== scenario}
            onClick={() => {
              setBusy(scenario);
              api
                .call("demoTrigger", { body: { scenario } })
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
