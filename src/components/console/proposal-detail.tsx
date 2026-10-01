"use client";

import * as React from "react";
import Link from "next/link";
import type { ProposalResponse, Ripple, ScheduleOption } from "@/contracts";
import { api } from "@/lib/api-client";
import { Alert, Button, PageHeader, ProposalCard, Section, Skeleton } from "@/components/ui";
import { agentOf, ApproveButton, metaOf, RejectButton } from "./proposal-bits";
import { PlanPreview, type PlanPayload } from "./plan-preview";
import { OptionCards, RippleView } from "./ripple-view";

type BundlePayload = {
  title: string;
  children: { kind: string; summary: string; rationale?: string; proposedBy?: string }[];
  ripple?: Ripple;
  options?: ScheduleOption[];
};

/** One proposal in full. For a plan bundle: the options considered, the ripple, and every step. */
export function ProposalDetail({ eventId, proposalId }: { eventId: string; proposalId: string }) {
  const [data, setData] = React.useState<ProposalResponse | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(
    () =>
      api.call("getProposal", { params: { eventId, proposalId } }).then(
        (res) => {
          setData(res);
          setError(null);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : "Could not load the proposal"),
      ),
    [eventId, proposalId],
  );
  React.useEffect(() => void load(), [load]);

  if (error)
    return (
      <Alert variant="danger" title="Could not load the proposal">
        {error}
      </Alert>
    );
  if (!data) return <Skeleton className="h-64" />;

  const p = data.proposal;
  const bundle = p.kind === "plan.bundle" ? (p.payload as unknown as BundlePayload) : null;
  const plan = p.kind === "plan.create" ? (p.payload as unknown as PlanPayload) : null;
  const actions = data.canApprove ? (
    <>
      <ApproveButton eventId={eventId} proposal={p} onDone={load} />
      <RejectButton eventId={eventId} proposal={p} onDone={load} />
    </>
  ) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        eyebrow={bundle ? "Plan for approval" : plan ? "Event plan" : "Proposal"}
        title={bundle ? bundle.title : p.summary}
        description={bundle ? "One plan. Approving it runs every step below together." : undefined}
        actions={
          <Button asChild variant="ghost">
            <Link href={`/console/${eventId}/approvals`}>Back to approvals</Link>
          </Button>
        }
      />

      <ProposalCard
        agent={agentOf(p)}
        summary={p.summary}
        rationale={p.rationale}
        status={p.status}
        tier={p.riskTier}
        evidence={p.evidence}
        impact={p.impact}
        diff={bundle || plan ? undefined : p.diff}
        meta={metaOf(p)}
        actions={actions}
        headingLevel="h2"
      />

      {plan ? <PlanPreview plan={plan} /> : null}

      {bundle?.options?.length ? (
        <Section
          id="options"
          title="Options the solver found"
          description="Every option is checked for clashes before you see it."
        >
          <OptionCards options={bundle.options} />
        </Section>
      ) : null}

      {bundle?.ripple ? (
        <Section id="ripple" title="Ripple" description="Everything this plan touches.">
          <RippleView ripple={bundle.ripple} />
        </Section>
      ) : null}

      {bundle ? (
        <Section id="steps" title={`Steps (${bundle.children.length})`}>
          {data.children.length ? (
            <div className="flex flex-col gap-3">
              {data.children.map((c) => (
                <ProposalCard
                  key={c.id}
                  agent={agentOf(c)}
                  summary={c.summary}
                  rationale={c.rationale}
                  status={c.status}
                  tier={c.riskTier}
                  impact={c.impact}
                  diff={c.diff}
                  headingLevel="h3"
                />
              ))}
            </div>
          ) : (
            <ol className="flex flex-col gap-2">
              {bundle.children.map((c, i) => (
                <li
                  key={i}
                  className="flex items-baseline gap-3 rounded-card border border-border bg-surface px-4 py-3 shadow-card"
                >
                  <span aria-hidden className="font-mono text-xs text-fg-muted tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="sr-only">Step {i + 1}: </span>
                  <span className="font-medium">{c.summary}</span>
                  {c.proposedBy ? (
                    <span className="text-sm text-fg-muted"> ({c.proposedBy.replace("_", " ")})</span>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </Section>
      ) : null}
    </div>
  );
}
