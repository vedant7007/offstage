"use client";

import * as React from "react";
import type { DemoPersona } from "@/contracts";
import { api } from "@/lib/api-client";
import { Select } from "@/components/ui";

const PERSONAS: { value: DemoPersona; label: string }[] = [
  { value: "owner", label: "Event head" },
  { value: "faculty", label: "Faculty approver" },
  { value: "program_lead", label: "Program lead" },
  { value: "comms_lead", label: "Comms lead" },
  { value: "viewer", label: "Judge, read only" },
];

/** DEMO_MODE only: switch the signed-in persona on stage, so a second approver is one click away. */
export function PersonaSwitcher({ role }: { role: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="hidden font-mono text-xs tracking-[0.04em] text-fg-muted sm:inline">
        Signed in as {role.replace("_", " ")}
      </span>
      <Select
        aria-label="Switch demo persona"
        placeholder="Switch persona"
        options={PERSONAS}
        disabled={busy}
        onValueChange={(persona) => {
          setBusy(true);
          api.call("switchPersona", { body: { persona: persona as DemoPersona } }).then(
            () => window.location.reload(),
            () => setBusy(false),
          );
        }}
      />
    </div>
  );
}
