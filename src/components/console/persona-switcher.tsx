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

const ROLE: Record<string, string> = {
  owner: "event head",
  faculty_approver: "faculty approver",
  lead: "domain lead",
  organizer: "organizer",
  viewer: "judge",
};

/** DEMO_MODE only: switch the signed-in persona on stage, so a second approver is one click away. */
export function PersonaSwitcher({ role }: { role: string }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="flex items-center gap-2">
      <span className="hidden font-mono text-xs tracking-[0.04em] whitespace-nowrap text-fg-muted lg:inline">
        Signed in as {ROLE[role] ?? role.replace(/_/g, " ")}
      </span>
      <Select
        aria-label="Switch demo persona"
        placeholder="Persona"
        className="w-auto max-sm:gap-1 max-sm:px-3 max-sm:text-sm"
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
