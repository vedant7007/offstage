// Crew Chief tools. The solver decides who is allowed; the model picks among them and writes the note.
// Code builds the proposals, so an assignment that breaks a rule can never be proposed.

import { z } from "zod";
import { moderate } from "@/ai/guard";
import type { Channel } from "@/agents/runtime/contracts";
import type { ReadServices } from "@/agents/runtime/services";
import type { AgentProposal, RunContext, ToolDef } from "@/agents/runtime/types";
import { checkAssignment, replacementFor, type CrewState } from "@/solvers/crew";
import { formatTime } from "@/lib/time";

type Ctx = RunContext<ReadServices>;

async function crewState(ctx: Ctx): Promise<CrewState> {
  const [volunteers, shifts, assignments, availability] = await Promise.all([
    ctx.services.volunteers(),
    ctx.services.shifts(),
    ctx.services.shiftAssignments(),
    ctx.services.availability(),
  ]);
  return { volunteers, shifts, assignments, availability };
}

function missed(ctx: Ctx) {
  const p = (ctx.payload ?? {}) as Record<string, unknown>;
  return typeof p.shiftId === "string" && typeof p.volunteerId === "string"
    ? { shiftId: p.shiftId, volunteerId: p.volunteerId }
    : undefined;
}

/** Allowed replacements, fairest first, with only what the model needs (no contact details). */
export async function replacements(ctx: Ctx) {
  const m = missed(ctx);
  if (!m) return { state: await crewState(ctx), shift: undefined, candidates: [] };
  const state = await crewState(ctx);
  const shift = state.shifts.find((s) => s.id === m.shiftId);
  const picks = replacementFor(state, m.shiftId, m.volunteerId).map((c) => {
    const v = state.volunteers.find((x) => x.id === c.volunteerId)!;
    return {
      volunteerId: v.id,
      name: v.name,
      skills: v.skills,
      hoursAssigned: c.hours,
      maxHours: v.maxHours,
    };
  });
  return { state, shift, candidates: picks };
}

/** Assignment plus a direct note, or an incident when nobody can legally cover the shift. */
export async function proposalsFor(
  ctx: Ctx,
  volunteerId: string | undefined,
  note: string | undefined,
): Promise<AgentProposal[]> {
  const m = missed(ctx)!;
  const { state, shift, candidates } = await replacements(ctx);
  if (!shift) return [];
  const when = `${formatTime(shift.startsAt)} to ${formatTime(shift.endsAt)}`;
  const missedName = state.volunteers.find((v) => v.id === m.volunteerId)?.name ?? "a volunteer";

  if (!candidates.length) {
    // Burnout guard: nobody can take it without breaking a rule, so a human decides.
    const refusals = new Map<string, number>();
    for (const v of state.volunteers)
      if (v.id !== m.volunteerId)
        for (const r of checkAssignment(state, shift.id, v.id)) refusals.set(r, (refusals.get(r) ?? 0) + 1);
    const why = [...refusals].map(([r, n]) => `${r.replace("_", " ")} ${n}`).join(", ");
    return [
      {
        kind: "incident.create",
        payload: {
          title: `No legal cover for ${shift.role} shift`.slice(0, 160),
          category: "crowd",
          severity: "high",
          source: "system",
          description: `${missedName} missed the ${shift.role} shift (${when}). No other volunteer can take it without breaking a crew rule. Refusals: ${why || "none"}.`,
        },
        summary: `No legal cover for the ${shift.role} shift`.slice(0, 120),
        rationale: `The crew solver refused every volunteer: ${why || "no volunteers"}.`,
        evidence: [{ type: "row", ref: `shifts/${shift.id}`, label: shift.role }],
      },
    ];
  }

  const pick = candidates.find((c) => c.volunteerId === volunteerId) ?? candidates[0]!;
  // The full record, for the channel choice; the solver's view keeps only rule fields.
  const v = (await ctx.services.volunteers()).find((x) => x.id === pick.volunteerId)!;
  const channels: Channel[] = v.telegramLinked ? ["telegram"] : ["in_app"];
  const template = `Hi ${v.name.split(" ")[0]}, can you cover the ${shift.role} shift from ${when}? Please reply here to confirm.`;
  const check = note ? moderate(note) : { verdict: "allow" as const, reasons: [] };
  const body = note && check.verdict === "allow" ? note : template;
  const flagged =
    note && check.verdict !== "allow" ? ` Draft replaced by a template: ${check.reasons.join(", ")}.` : "";

  return [
    {
      kind: "crew.assign_shift",
      payload: { shiftId: shift.id, volunteerId: v.id, replacesVolunteerId: m.volunteerId },
      summary: `${v.name} covers ${shift.role} (${when})`.slice(0, 120),
      rationale: `${missedName} missed the shift. ${v.name} has the skills, is free, and has ${pick.hoursAssigned}h of ${pick.maxHours}h assigned.`,
      evidence: [
        { type: "row", ref: `shifts/${shift.id}`, label: shift.role },
        { type: "row", ref: `volunteers/${v.id}`, label: v.name },
      ],
    },
    {
      kind: "comms.send_direct",
      payload: {
        recipient: { type: "volunteer", id: v.id },
        channels,
        bodyByChannel: Object.fromEntries(channels.map((c) => [c, body])),
        category: "info",
      },
      summary: `Ask ${v.name} to cover ${shift.role}`.slice(0, 120),
      rationale: `Direct note for the replacement assignment.${flagged}`,
      evidence: [{ type: "row", ref: `volunteers/${v.id}`, label: v.name }],
    },
  ];
}

export const crewChiefTools: ToolDef<ReadServices>[] = [
  {
    name: "get_replacements",
    description: "Volunteers who can legally cover the missed shift, fairest first.",
    input: z.object({}),
    run: (async (_: unknown, ctx: Ctx) => {
      const { shift, candidates } = await replacements(ctx);
      return {
        shift: shift && { id: shift.id, role: shift.role, startsAt: shift.startsAt, endsAt: shift.endsAt },
        candidates,
      };
    }) as never,
  },
  {
    name: "assign_replacement",
    description:
      "Propose one returned candidate for the shift plus a short, friendly note to them. With no candidates, call it with no volunteerId to raise an incident instead.",
    input: z.object({
      volunteerId: z.string().optional().describe("A volunteerId from get_replacements"),
      note: z.string().max(500).optional().describe("Two sentences at most, in plain words, no promises"),
    }),
    run: (async (i: { volunteerId?: string; note?: string }, ctx: Ctx) => {
      const { candidates } = await replacements(ctx);
      if (i.volunteerId && !candidates.some((c) => c.volunteerId === i.volunteerId))
        return { error: `${i.volunteerId} cannot legally take this shift. Pick from get_replacements.` };
      const results = [];
      for (const p of await proposalsFor(ctx, i.volunteerId, i.note))
        results.push((await ctx.propose(p)).status);
      return { proposed: results };
    }) as never,
  },
];
