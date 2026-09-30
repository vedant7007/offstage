"use client";

import type { AgentName } from "@/contracts";
import { formatDate } from "@/lib/time";
import { formatInr } from "@/lib/format";
import { AgentAvatar, Badge, DataTable, Section } from "@/components/ui";

export type PlanPayload = {
  title: string;
  summary?: string;
  milestones: { title: string; domain: string; dueOn: string; critical: boolean }[];
  budget: { totalInr: number; categories: { key: string; name: string; capInr: number }[] };
  risks: { title: string; likelihood: string; impact: string; mitigation: string }[];
  agentTeam: { agent: AgentName; enabled: boolean; humanLeadRole: string; mandate: string }[];
};

const ROLE: Record<string, string> = { owner: "Event head", lead: "Domain lead", organizer: "Organizer" };

/** The Commander's event plan: who does what, by when, and with how much. */
export function PlanPreview({ plan }: { plan: PlanPayload }) {
  const on = plan.agentTeam.filter((a) => a.enabled);
  return (
    <>
      {plan.summary ? <p>{plan.summary}</p> : null}
      <Section
        id="team"
        title={`Agent team (${on.length} of ${plan.agentTeam.length})`}
        description="Each agent, the person it answers to, and what it owns for this event."
      >
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {plan.agentTeam.map((a) => (
            <li
              key={a.agent}
              className={`flex flex-col gap-2 rounded-card border border-border p-3 ${a.enabled ? "" : "opacity-60"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <AgentAvatar agent={a.agent} showName />
                <Badge tone={a.enabled ? "info" : "neutral"}>{a.enabled ? "On" : "Off"}</Badge>
              </div>
              <p className="text-sm">{a.mandate}</p>
              <p className="text-xs text-fg-muted">Answers to: {ROLE[a.humanLeadRole] ?? a.humanLeadRole}</p>
            </li>
          ))}
        </ul>
      </Section>
      <Section id="milestones" title={`Milestones (${plan.milestones.length})`}>
        <DataTable
          caption="Milestones"
          hideCaption
          rowKey={(m) => m.title}
          rows={[...plan.milestones].sort((a, b) => a.dueOn.localeCompare(b.dueOn))}
          columns={[
            { key: "title", header: "Milestone", primary: true, cell: (m) => m.title },
            { key: "domain", header: "Area", cell: (m) => m.domain.replace("_", " ") },
            { key: "due", header: "Due", cell: (m) => formatDate(`${m.dueOn}T12:00:00+05:30`) },
            { key: "critical", header: "Critical", cell: (m) => (m.critical ? "Yes" : "No") },
          ]}
        />
      </Section>
      <Section id="budget" title={`Budget (${formatInr(plan.budget.totalInr)})`}>
        <DataTable
          caption="Budget split"
          hideCaption
          rowKey={(c) => c.key}
          rows={plan.budget.categories}
          columns={[
            { key: "name", header: "Category", primary: true, cell: (c) => c.name },
            { key: "cap", header: "Cap", align: "end", cell: (c) => formatInr(c.capInr) },
            {
              key: "share",
              header: "Share",
              align: "end",
              cell: (c) => `${Math.round((c.capInr / Math.max(1, plan.budget.totalInr)) * 100)}%`,
            },
          ]}
        />
      </Section>
      {plan.risks.length ? (
        <Section id="risks" title="Risks">
          <ul className="flex flex-col gap-2">
            {plan.risks.map((r) => (
              <li key={r.title}>
                <span className="font-medium">{r.title}</span>{" "}
                <span className="text-sm text-fg-muted">
                  ({r.likelihood} likelihood, {r.impact} impact). {r.mitigation}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
