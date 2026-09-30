/** What-if runs: simulate on a copy of the event, let the owning agents re-plan in simulation, store the result. */
import { randomUUID } from "node:crypto";
import { commander } from "@/agents/commander/config";
import { applyPerturbations, impactsOf, parseScenario } from "@/agents/commander/whatif";
import { finance, spentBy } from "@/agents/finance/config";
import { runAgent } from "@/agents/runtime/run";
import { snapshot } from "@/agents/runtime/services";
import type { ProposeResult, UserActor, WhatIfResult } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { nowUtc } from "@/lib/time";
import { requirePermission } from "@/server/authz";
import { syncDemoClock } from "@/server/clock";
import { simulationDeps } from "@/server/services/agent-runtime";
import { loadWorld } from "@/server/services/world";

const EXAMPLES =
  "Try: 30% more people show up, it rains, the main speaker cancels, the budget drops by 50k, we lose Lab 204, the event moves by 7 days.";

export async function runWhatIf(
  actor: UserActor,
  scenario: string,
  client: Db = defaultDb,
): Promise<WhatIfResult> {
  requirePermission(actor, "agents.command", { eventId: actor.eventId });
  await syncDemoClock(client);
  const eventId = actor.eventId;
  const before = await loadWorld(eventId, client);
  const { perturbations, assumptions } = parseScenario(scenario, before);
  const after = structuredClone(before);
  applyPerturbations(after, perturbations);

  // The agents that own each problem re-plan on the copy. Their proposals come back "simulated".
  const recommendations: ProposeResult[] = [];
  const { searchKbPg } = await import("@/ai/rag/pg");
  const services = snapshot(after, { searchKb: (q, k) => searchKbPg(client, eventId, q, k) });
  const deps = simulationDeps(eventId, services, client);
  const ref = `whatif:${randomUUID()}`;
  for (const p of perturbations) {
    if (p.type === "speaker_cancel") {
      const lost = after.sessions.find(
        (s) =>
          s.speakerIds.includes(p.speakerId) &&
          before.sessions.find((b) => b.id === s.id)?.status !== "cancelled",
      );
      if (lost) {
        const res = await runAgent(
          commander,
          { type: "whatif", eventType: "session.cancelled", ref },
          { eventId, payload: { sessionId: lost.id, reason: `What-if: ${scenario}` } },
          deps,
          { simulation: true },
        );
        recommendations.push(...res.simulated);
      }
    }
    if (p.type === "budget_delta") {
      const spent = spentBy(after.ledgerEntries);
      for (const c of after.budgetCategories.filter((c) => (spent.get(c.id) ?? 0) > c.capInr)) {
        const res = await runAgent(
          finance,
          { type: "whatif", eventType: "finance.threshold_crossed", ref },
          {
            eventId,
            payload: { categoryId: c.id, threshold: "100", spentRatio: (spent.get(c.id) ?? 0) / c.capInr },
          },
          deps,
          { simulation: true },
        );
        recommendations.push(...res.simulated);
      }
    }
  }

  const result: WhatIfResult = {
    id: randomUUID(),
    eventId,
    simulation: true,
    scenario,
    assumptions: perturbations.length ? assumptions : [{ label: "Not understood", value: EXAMPLES }],
    perturbations,
    impacts: impactsOf(before, after, perturbations),
    recommendations,
    confidence: perturbations.length ? (assumptions.length ? 0.6 : 0.8) : 0,
    createdAt: nowUtc().toISOString(),
  };
  await client.insert(t.whatifRuns).values({
    id: result.id,
    eventId,
    scenario,
    result,
    createdByUserId: actor.userId,
    createdAt: nowUtc(),
  });
  return result;
}
