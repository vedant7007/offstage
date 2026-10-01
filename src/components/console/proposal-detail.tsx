"use client";

import * as React from "react";
import Link from "next/link";
import type { ProposalResponse, Ripple, ScheduleOption } from "@/contracts";
import { api } from "@/lib/api-client";
import { ArrowLeft } from "lucide-react";
import { Alert, Button, PageHeader, ProposalCard, Section } from "@/components/ui";
import { Morph, SkeletonCard, SkeletonText } from "@/components/ui/motion";
import { agentOf, ApproveButton, metaOf, RejectButton } from "./proposal-bits";
import { PlanPreview, type PlanPayload } from "./plan-preview";
import { OptionCards, RippleView } from "./ripple-view";
import { sentence } from "./text";

type BundlePayload = {
  title: string;
  children: { kind: string; summary: string; rationale?: string; proposedBy?: string }[];
  ripple?: Ripple;
  options?: ScheduleOption[];
};

/** The page title says what the decision is, so the card below can carry the what and the why. */
function decision(p: ProposalResponse["proposal"]) {
  if (p.status !== "pending") return "Proposal";
  return p.riskTier === "T3"
    ? "Needs two approvals"
    : p.riskTier === "T2"
      ? "Needs your approval"
      : "Proposal";
}

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
        <span className="flex flex-wrap items-center gap-3">
          {error}
          <Button size="sm" variant="secondary" onClick={() => void load()}>
            Retry
          </Button>
        </span>
      </Alert>
    );
  if (!data)
    return (
      <div aria-busy className="flex flex-col gap-8">
        <div aria-hidden className="flex flex-col gap-3 pt-14">
          <span className="h-3 w-28 rounded-full bg-[color-mix(in_srgb,var(--fg)_9%,transparent)]" />
          <span className="h-9 w-80 max-w-full rounded-full bg-[color-mix(in_srgb,var(--fg)_9%,transparent)]" />
          <SkeletonText lines={1} className="w-96 max-w-full" />
        </div>
        <SkeletonCard className="h-80" />
      </div>
    );

  const p = data.proposal;
  const bundle = p.kind === "plan.bundle" ? (p.payload as unknown as BundlePayload) : null;
  const plan = p.kind === "plan.create" ? (p.payload as unknown as PlanPayload) : null;
  const actions = data.canApprove ? (
    <>
      {/* The one decision on this page: the big Approve is the magnetic primary. */}
      <ApproveButton eventId={eventId} proposal={p} onDone={() => void load()} size="lg" magnetic />
      <RejectButton eventId={eventId} proposal={p} onDone={load} size="lg" />
    </>
  ) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        back={
          <Link
            href={`/console/${eventId}/approvals`}
            className="inline-flex min-h-11 w-fit items-center gap-1.5 rounded-full text-sm text-fg-muted transition-colors duration-200 hover:text-fg"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Back to approvals
          </Link>
        }
        eyebrow={bundle ? "Plan for approval" : plan ? "Event plan" : `Proposal, ${p.riskTier}`}
        title={bundle ? sentence(bundle.title) : plan ? plan.title : decision(p)}
        description={
          bundle
            ? "One plan. Approving it runs every step below together."
            : plan
              ? "The Commander's draft. Approve it to wake the agent team."
              : "Read what changes and who it reaches, then decide."
        }
      />

      <Morph name={`proposal-${p.id}`}>
        <ProposalCard
          className="edge"
          agent={agentOf(p)}
          summary={sentence(p.summary)}
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
      </Morph>

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
        <Section
          id="steps"
          title={`Steps (${bundle.children.length})`}
          description="Each step is its own action. Approving the plan runs them together."
        >
          {data.children.length ? (
            <div className="flex flex-col gap-3">
              {data.children.map((c) => (
                <ProposalCard
                  key={c.id}
                  agent={agentOf(c)}
                  summary={sentence(c.summary)}
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
                  className="flex items-baseline gap-3 rounded-card border border-border bg-surface px-4 py-3 depth-1"
                >
                  <span aria-hidden className="font-mono text-xs text-fg-muted tabular-nums">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="sr-only">Step {i + 1}: </span>
                  <span className="font-medium">{sentence(c.summary)}</span>
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
