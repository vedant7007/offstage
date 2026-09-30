// Finance: records and warns, never pays. When a category crosses its cap, code works out how to cover the
// overage from categories with room (largest headroom first) and proposes the new split for the treasurer.
// At 80% it only warns. The model writes the rationale; numbers come from the ledger.

import { z } from "zod";
import type { BudgetCategory, LedgerEntry } from "@/contracts";
import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig, AgentProposal, PipelineIO, RunContext } from "@/agents/runtime/types";
import { draft, onlyGivenNumbers } from "@/agents/runtime/wording";
import { formatInr } from "@/lib/format";

type Ctx = RunContext<ReadServices>;
type IO = Pick<PipelineIO, "runId" | "onAttempt" | "critical"> | null;

/** Money out per category: committed and paid expenses. */
export function spentBy(ledger: LedgerEntry[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of ledger)
    if (e.type === "expense" && e.categoryId && (e.status === "committed" || e.status === "paid"))
      out.set(e.categoryId, (out.get(e.categoryId) ?? 0) + e.amountInr);
  return out;
}

/**
 * Moves just enough cap into the breached category, rounded up to 1,000 INR, from the categories with the
 * most headroom. Returns null when the others cannot cover it; the total never changes.
 */
export function reallocate(categories: BudgetCategory[], spent: Map<string, number>, breachedId: string) {
  const target = categories.find((c) => c.id === breachedId);
  if (!target) return null;
  const over = (spent.get(target.id) ?? 0) - target.capInr;
  if (over <= 0) return null;
  let need = Math.ceil(over / 1000) * 1000;
  const moves: { from: BudgetCategory; amount: number }[] = [];
  const donors = categories
    .filter((c) => c.id !== target.id)
    .map((c) => ({ c, room: c.capInr - (spent.get(c.id) ?? 0) }))
    .filter((d) => d.room >= 1000)
    .sort((a, b) => b.room - a.room);
  for (const d of donors) {
    if (need <= 0) break;
    const amount = Math.min(need, Math.floor(d.room / 1000) * 1000);
    moves.push({ from: d.c, amount });
    need -= amount;
  }
  if (need > 0) return null;
  const moved = moves.reduce((s, m) => s + m.amount, 0);
  const caps = new Map(categories.map((c) => [c.id, c.capInr]));
  caps.set(target.id, target.capInr + moved);
  for (const m of moves) caps.set(m.from.id, m.from.capInr - m.amount);
  return { target, over, moved, moves, caps };
}

const Why = z.object({ rationale: z.string().max(400).describe("Two sentences for the treasurer") });

async function plan(ctx: Ctx, io: IO): Promise<AgentProposal[]> {
  const p = (ctx.payload ?? {}) as { categoryId?: string; threshold?: string; spentRatio?: number };
  if (!p.categoryId) return [];
  const { categories, ledger } = await ctx.services.budget();
  const cat = categories.find((c) => c.id === p.categoryId);
  if (!cat) return [];
  const spent = spentBy(ledger);
  const used = spent.get(cat.id) ?? 0;
  const pct = Math.round((used / cat.capInr) * 100);
  const evidence = [
    {
      type: "metric" as const,
      ref: `live:budget/${cat.key}`,
      label: `${cat.name}: ${formatInr(used)} of ${formatInr(cat.capInr)}`,
    },
  ];
  const key = `budget:${cat.id}:${p.threshold ?? "100"}`;

  if (p.threshold === "80")
    return [
      {
        kind: "incident.create",
        payload: {
          title: `${cat.name} at ${pct}% of its budget`,
          category: "system",
          severity: "low",
          source: "system",
          description: `${cat.name} has used ${formatInr(used)} of ${formatInr(cat.capInr)}. New expenses here need a check first.`,
          evidenceRefs: [],
        },
        summary: `${cat.name} at ${pct}% of budget`,
        rationale: "Budgets warn at 80% so there is time to adjust before the cap.",
        evidence,
        dedupeKey: key,
      },
    ];

  const r = reallocate(categories, spent, cat.id);
  if (!r)
    return [
      {
        kind: "incident.create",
        payload: {
          title: `${cat.name} is over budget and no category has room`,
          category: "system",
          severity: "high",
          source: "system",
          description: `${cat.name} has used ${formatInr(used)} of ${formatInr(cat.capInr)}. The other categories cannot cover the difference; the treasurer needs to decide.`,
          evidenceRefs: [],
        },
        summary: `${cat.name} over budget, needs the treasurer`,
        rationale: "No other category has enough headroom to move.",
        evidence,
        dedupeKey: key,
      },
    ];

  const from = r.moves.map((m) => `${formatInr(m.amount)} from ${m.from.name}`).join(" and ");
  const facts = `${cat.name} spent ${formatInr(used)} against a cap of ${formatInr(cat.capInr)}, ${formatInr(r.over)} over. Proposal: move ${from}, so ${cat.name} becomes ${formatInr(cat.capInr + r.moved)}. The total budget stays the same.`;
  const words = io
    ? await draft(io, {
        schema: Why,
        instructions:
          "Explain this budget change to the treasurer in two plain sentences. Use the numbers exactly as given.",
        facts,
      })
    : null;
  // A model rationale must not introduce numbers of its own.
  const rationale =
    words && onlyGivenNumbers(words.rationale, facts)
      ? words.rationale
      : `${cat.name} is ${formatInr(r.over)} over its cap. Moving ${from} covers it without changing the total.`;
  const total = categories.reduce((s, c) => s + c.capInr, 0);
  return [
    {
      kind: "finance.budget.set",
      payload: {
        totalInr: total,
        categories: categories.map((c) => ({
          categoryId: c.id,
          key: c.key,
          name: c.name,
          capInr: r.caps.get(c.id)!,
        })),
      },
      summary: `Move ${from} to ${cat.name}`.slice(0, 120),
      rationale,
      evidence: [
        ...evidence,
        ...r.moves.map((m) => ({
          type: "metric" as const,
          ref: `live:budget/${m.from.key}`,
          label: `${m.from.name}: ${formatInr(m.from.capInr - (spent.get(m.from.id) ?? 0))} left`,
        })),
      ],
      dedupeKey: key,
    },
  ];
}

export const finance: AgentConfig<ReadServices> = {
  name: "finance",
  purpose: "Keeps the budget honest: warns early and proposes how to cover an overspend. Never pays",
  humanLeadRole: "lead",
  domain: "finance",
  modelTier: "fast",
  tools: [],
  actions: ["finance.budget.set", "incident.create"],
  systemPrompt: () => "",
  triggers: [{ type: "domain_event", eventType: "finance.threshold_crossed" }],
  maxSteps: 1,
  criticality: "normal",
  pipeline: async (ctx, io) => {
    const proposals = await plan(ctx, io);
    for (const p of proposals) await ctx.propose(p);
    return { text: `Proposed ${proposals.length} actions.` };
  },
  fallback: (ctx) => plan(ctx, null),
};
