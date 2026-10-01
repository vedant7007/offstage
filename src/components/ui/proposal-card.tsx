"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Activity, ChartNoAxesColumn, ChevronDown, Database, FileText } from "lucide-react";
import type { Evidence } from "@/contracts";
import { useT } from "@/lib/i18n/provider";
import { AgentAvatar } from "./agent-avatar";
import { InfoChip } from "./chip";
import { DiffView, type DiffEntry } from "./diff-view";
import { ImpactChips, type Impact } from "./impact-chips";
import { StatusBadge, type StatusKind } from "./status-badge";
import { TierBadge, type TierKind } from "./tier-badge";

export type { Evidence };

const EVIDENCE_ICON = {
  kb: FileText,
  row: Database,
  event: Activity,
  metric: ChartNoAxesColumn,
} as const;

type ProposalCardProps = {
  /** Agent that proposed it (AgentName). */
  agent: string;
  summary: React.ReactNode;
  rationale: React.ReactNode;
  status: StatusKind;
  tier: TierKind;
  evidence?: Evidence[];
  impact?: Impact;
  diff?: DiffEntry[];
  diffLabels?: Record<string, string>;
  /** Buttons such as Approve, Reject, Edit, Undo. The card has no opinion on what they do. */
  actions?: React.ReactNode;
  /** Small line under the summary, such as the time it was proposed or its expiry. */
  meta?: React.ReactNode;
  headingLevel?: "h2" | "h3" | "h4";
  className?: string;
};

/** One agent proposal: what, why, the evidence, who it touches and what changes. */
function ProposalCard({
  agent,
  summary,
  rationale,
  status,
  tier,
  evidence = [],
  impact,
  diff,
  diffLabels,
  actions,
  meta,
  headingLevel: Heading = "h3",
  className,
}: ProposalCardProps) {
  const t = useT();
  const headingId = React.useId();

  return (
    <article
      aria-labelledby={headingId}
      data-slot="proposal-card"
      data-status={status}
      className={cn(
        "flex flex-col gap-4 rounded-card border bg-surface p-5 shadow-card md:p-6",
        status === "simulated" ? "border-2 border-dashed border-agent" : "border-border",
        status === "emergency" && "border-2 border-emergency",
        (status === "stale" || status === "rejected" || status === "undone" || status === "expired") &&
          "opacity-80",
        className,
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm">
          <AgentAvatar agent={agent} size="sm" />
          <span className="text-fg-muted">{t("proposal.proposedBy", { agent: agentName(t, agent) })}</span>
        </span>
        <span className="flex flex-wrap items-center gap-1.5">
          <TierBadge tier={tier} />
          <StatusBadge status={status} />
        </span>
      </header>

      <div className="flex flex-col gap-1">
        <Heading id={headingId} className="text-lg font-medium tracking-[-0.02em] text-balance">
          {summary}
        </Heading>
        {meta ? <p className="text-sm text-fg-muted">{meta}</p> : null}
      </div>

      <div className="flex flex-col gap-1">
        <p className="kicker text-fg-muted">{t("proposal.why")}</p>
        <p className="text-base">{rationale}</p>
      </div>

      {evidence.length ? (
        <div className="flex flex-col gap-1.5">
          <p className="kicker text-fg-muted">{t("proposal.evidence")}</p>
          <ul className="flex flex-wrap gap-2">
            {evidence.map((e) => {
              const Icon = EVIDENCE_ICON[e.type];
              return (
                <li key={`${e.type}:${e.ref}`}>
                  <InfoChip tone="outline" icon={<Icon aria-hidden />} data-ref={e.ref}>
                    <span className="sr-only">{t(`proposal.evidenceKind.${e.type}`)}: </span>
                    {e.label}
                  </InfoChip>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {impact ? <ImpactChips impact={impact} /> : null}

      {diff?.length ? (
        <details className="group rounded-[0.75rem] border border-border bg-surface-raised">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-[0.75rem] px-4 font-medium transition-colors duration-(--duration-fast) ease-out hover:bg-surface-sunken [&::-webkit-details-marker]:hidden">
            {t("proposal.changes")}
            <ChevronDown
              aria-hidden
              className="size-4 transition-transform duration-(--duration-slow) ease-out group-open:rotate-180"
            />
          </summary>
          <div className="border-t border-border p-4">
            <DiffView diff={diff} labels={diffLabels} />
          </div>
        </details>
      ) : null}

      {actions ? (
        <footer className="flex flex-wrap gap-2 border-t border-border pt-4">{actions}</footer>
      ) : null}
    </article>
  );
}

function agentName(t: ReturnType<typeof useT>, agent: string) {
  const key = `agent.${agent}` as Parameters<typeof t>[0];
  const name = t(key);
  return name === key ? t("agent.unknown") : name;
}

export { ProposalCard };
