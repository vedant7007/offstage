"use client";

import * as React from "react";
import Link from "next/link";
import type { ActionProposal, RiskTier } from "@/contracts";
import { api } from "@/lib/api-client";
import { Alert, Button, EmptyState, PageHeader, ProposalCard, Skeleton, TierBadge } from "@/components/ui";
import { Inbox } from "lucide-react";
import { CountUp } from "./fx";
import { sentence } from "./text";
import { agentOf, ApproveButton, metaOf, RejectButton } from "./proposal-bits";

const TIERS: { tier: RiskTier; title: string; hint: string }[] = [
  { tier: "T3", title: "Needs two approvals", hint: "Official, bulk or cannot be undone" },
  { tier: "T2", title: "Needs your approval", hint: "Reaches many people, goes public or spends money" },
  { tier: "T1", title: "Runs unless you undo", hint: "One person, easy to reverse" },
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
        description="What the agents want to do. Nothing that reaches people or money happens until a person approves it."
      />
      {error ? (
        <Alert variant="danger" title="Could not load proposals">
          {error}
        </Alert>
      ) : null}
      {!items && !error ? (
        <div aria-hidden className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-28 rounded-card" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-card" />
          <Skeleton className="h-64 rounded-card" />
        </div>
      ) : null}
      {items?.length ? (
        <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {TIERS.map(({ tier, title }) => (
            <div
              key={tier}
              className="flex flex-col-reverse justify-end gap-3 rounded-card border border-border bg-surface p-4 shadow-card"
            >
              <dt className="flex items-start gap-2 text-sm leading-snug text-fg-muted">
                <TierBadge tier={tier} />
                {title}
              </dt>
              <dd className="font-mono text-4xl font-medium tracking-[-0.02em]">
                <CountUp to={items.filter((p) => p.riskTier === tier).length} />
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
      {items && !items.length ? (
        <EmptyState
          icon={<Inbox />}
          title="All clear"
          description="Nothing is waiting for you. New proposals land here the moment an agent makes one."
        />
      ) : null}
      {TIERS.map(({ tier, title, hint }) => {
        const group = (items ?? []).filter((p) => p.riskTier === tier);
        if (!group.length) return null;
        return (
          <section key={tier} aria-label={title} className="flex flex-col gap-3 pt-2">
            <div className="flex flex-col gap-1">
              <h2 className="flex items-center gap-2.5 text-xl font-medium tracking-[-0.02em]">
                {title}
                <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-fg px-2 font-mono text-xs text-bg tabular-nums">
                  {group.length}
                </span>
              </h2>
              <p className="text-sm text-fg-muted">{hint}.</p>
            </div>
            {group.map((p) => (
              <ProposalCard
                key={p.id}
                agent={agentOf(p)}
                summary={sentence(p.summary)}
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
