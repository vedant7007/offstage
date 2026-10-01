"use client";

import * as React from "react";
import Link from "next/link";
import type { ActionProposal, RiskTier } from "@/contracts";
import { api } from "@/lib/api-client";
import { Alert, Button, EmptyState, PageHeader, ProposalCard, Skeleton, TierBadge } from "@/components/ui";
import { CountUp } from "./fx";
import { agentOf, ApproveButton, metaOf, RejectButton } from "./proposal-bits";

const TIERS: { tier: RiskTier; title: string; hint: string }[] = [
  { tier: "T3", title: "Needs two approvals", hint: "Official, bulk or irreversible" },
  { tier: "T2", title: "Needs your approval", hint: "Many people, public, or money" },
  { tier: "T1", title: "Runs unless you undo", hint: "One person, reversible" },
  { tier: "T0", title: "Recorded", hint: "Internal only" },
];

/** Pending proposals, most serious first. Bundles open their full plan with the ripple. */
export function ApprovalQueue({ eventId }: { eventId: string }) {
  const [items, setItems] = React.useState<ActionProposal[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(
    () =>
      api.call("listProposals", { params: { eventId }, query: { status: "pending", limit: 100 } }).then(
        (res) => {
          setItems(res.items.filter((p) => !p.parentId && p.status === "pending"));
          setError(null);
        },
        (e: unknown) => setError(e instanceof Error ? e.message : "Could not load proposals"),
      ),
    [eventId],
  );

  React.useEffect(() => {
    void load();
    // Until the SSE stream lands, refresh every 10 seconds.
    const id = setInterval(() => void load(), 10_000);
    return () => clearInterval(id);
  }, [load]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Policy gate"
        title="Approvals"
        description="What the agents want to do. Nothing that touches people or money happens until someone approves it."
      />
      {error ? (
        <Alert variant="danger" title="Could not load proposals">
          {error}
        </Alert>
      ) : null}
      {!items && !error ? <Skeleton className="h-40" /> : null}
      {items?.length ? (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {TIERS.map(({ tier, title }) => (
            <div
              key={tier}
              className="flex flex-col gap-2 rounded-card border border-border bg-surface p-4 shadow-card"
            >
              <dt className="flex items-center gap-2 text-sm text-fg-muted">
                <TierBadge tier={tier} />
                {title}
              </dt>
              <dd className="font-mono text-3xl font-medium">
                <CountUp to={items.filter((p) => p.riskTier === tier).length} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {items && !items.length ? (
        <EmptyState title="Nothing waiting" description="New proposals appear here as agents make them." />
      ) : null}
      {TIERS.map(({ tier, title, hint }) => {
        const group = (items ?? []).filter((p) => p.riskTier === tier);
        if (!group.length) return null;
        return (
          <section key={tier} aria-label={title} className="flex flex-col gap-3">
            <h2 className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xl font-medium tracking-[-0.02em]">
              {title}{" "}
              <span className="kicker text-fg-muted">
                ({hint}, <span className="tabular-nums">{group.length}</span>)
              </span>
            </h2>
            {group.map((p) => (
              <ProposalCard
                key={p.id}
                agent={agentOf(p)}
                summary={p.summary}
                rationale={p.rationale}
                status={p.status}
                tier={p.riskTier}
                evidence={p.evidence}
                impact={p.impact}
                diff={p.kind === "plan.bundle" ? undefined : p.diff}
                meta={metaOf(p)}
                actions={
                  p.kind === "plan.bundle" ? (
                    <Button asChild>
                      <Link href={`/console/${eventId}/approvals/${p.id}`}>Review the plan</Link>
                    </Button>
                  ) : (
                    <>
                      <ApproveButton eventId={eventId} proposal={p} onDone={load} />
                      <RejectButton eventId={eventId} proposal={p} onDone={load} />
                      <Button asChild variant="ghost">
                        <Link href={`/console/${eventId}/approvals/${p.id}`}>Details</Link>
                      </Button>
                    </>
                  )
                }
              />
            ))}
          </section>
        );
      })}
    </div>
  );
}
