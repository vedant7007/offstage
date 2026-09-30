// Registrar: registration flows are deterministic code; this agent only makes the two judgement calls the
// blueprint gives it. Likely duplicates get flagged (T0, a record only) and free seats go to the waitlist in
// order. Everything here is rules over masked rows, so no model and no personal data in any prompt.

import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig, AgentProposal, RunContext } from "@/agents/runtime/types";
import { shortName } from "@/lib/format";
import { duplicates, toPromote } from "./logic";

type Ctx = RunContext<ReadServices>;
type Created = {
  registrationId?: string;
  duplicateSuspects?: {
    registrationId: string;
    matchType: "email" | "phone" | "fuzzy_name_college";
    score?: number;
  }[];
};

async function plan(ctx: Ctx): Promise<AgentProposal[]> {
  const [event, regs] = await Promise.all([
    ctx.services.event(),
    ctx.services.registrations({ limit: 100_000 }),
  ]);
  const byId = new Map(regs.map((r) => [r.id, r]));
  const who = (id: string) => shortName(byId.get(id)?.name) || "A registration";
  const out: AgentProposal[] = [];
  const flag = (
    registrationId: string,
    duplicateOfId: string,
    matchType: "email" | "phone" | "fuzzy_name_college",
    score: number | undefined,
    why: string,
  ) => {
    if (registrationId === duplicateOfId) return;
    const key = `dup:${registrationId}:${duplicateOfId}`;
    if (out.some((p) => p.dedupeKey === key)) return;
    out.push({
      kind: "registration.flag_duplicate",
      payload: { registrationId, duplicateOfId, matchType, ...(score !== undefined ? { score } : {}) },
      summary: `${who(registrationId)} looks like a duplicate`.slice(0, 120),
      rationale: why,
      evidence: [
        { type: "row", ref: `registrations/${registrationId}`, label: who(registrationId) },
        { type: "row", ref: `registrations/${duplicateOfId}`, label: `Earlier: ${who(duplicateOfId)}` },
      ],
      dedupeKey: key,
    });
  };

  const p = (ctx.payload ?? {}) as Created;
  const fromEvent = ctx.trigger.eventType === "registration.created" && p.registrationId;
  if (fromEvent) {
    // The server already matched email and phone, which this agent never sees.
    for (const s of p.duplicateSuspects ?? [])
      flag(
        p.registrationId!,
        s.registrationId,
        s.matchType,
        s.score,
        `Registration matched an earlier one on ${s.matchType.replace(/_/g, " ")}.`,
      );
  }
  for (const d of duplicates(regs, fromEvent ? p.registrationId : undefined))
    flag(
      d.registrationId,
      d.duplicateOfId,
      "fuzzy_name_college",
      1,
      "Same name, college, department and year as an earlier registration.",
    );

  const ids = toPromote(regs, event.capacity);
  if (ids.length) {
    const confirmed = regs.filter((r) => r.status === "confirmed").length;
    const waiting = regs.filter((r) => r.status === "waitlisted").length;
    out.push({
      kind: "registration.promote_waitlist",
      payload: { registrationIds: ids },
      summary: `Promote ${ids.length} from the waitlist`,
      rationale: `${confirmed} confirmed against a capacity of ${event.capacity}, with ${waiting} waiting. The first ${ids.length} in waitlist order get the free seats.`,
      evidence: [
        {
          type: "metric",
          ref: "live:registrations/confirmed",
          label: `${confirmed} of ${event.capacity} confirmed`,
        },
        { type: "metric", ref: "live:registrations/waitlisted", label: `${waiting} on the waitlist` },
      ],
      dedupeKey: `promote:${ids.join(",")}`,
    });
  }
  return out;
}

export const registrar: AgentConfig<ReadServices> = {
  name: "registrar",
  purpose: "Flags likely duplicate registrations and fills free seats from the waitlist in order",
  humanLeadRole: "lead",
  domain: "registrations",
  modelTier: "fast",
  tools: [],
  actions: ["registration.flag_duplicate", "registration.promote_waitlist"],
  systemPrompt: () => "",
  triggers: [
    { type: "domain_event", eventType: "registration.created" },
    { type: "schedule", name: "waitlist", cron: "*/30 * * * *" },
  ],
  maxSteps: 1,
  criticality: "normal",
  pipeline: async (ctx) => {
    const proposals = await plan(ctx);
    for (const p of proposals) await ctx.propose(p);
    return { text: proposals.length ? `Proposed ${proposals.length} actions.` : "Registrations look clean." };
  },
  fallback: plan,
};
