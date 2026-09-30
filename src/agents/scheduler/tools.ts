// Scheduler tools. The model sees the solver's options and picks one; code builds the proposal from that
// option, so the agent can never propose a schedule change the solver did not return.

import { z } from "zod";
import type { Session } from "@/agents/runtime/contracts";
import type { ReadServices } from "@/agents/runtime/services";
import type { AgentProposal, RunContext, ToolDef } from "@/agents/runtime/types";
import { istDateKey, istToUtc } from "@/lib/time";
import { composeBundle } from "@/agents/commander/compose";
import {
  detectClashes,
  replanOptions,
  type Change,
  type Option,
  type ScheduleState,
} from "@/solvers/schedule";

type Ctx = RunContext<ReadServices>;

export type Plan = { change: Change | null; state: ScheduleState; options: Option[]; note?: string };

const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** What the trigger asks the solver to do, or null when nothing needs replanning. */
function changeFor(
  ctx: Ctx,
  sessions: Session[],
  state: ScheduleState,
): { change: Change | null; note?: string } {
  const p = (ctx.payload ?? {}) as Record<string, unknown>;
  const sessionId = str(p.sessionId);
  const session = sessions.find((s) => s.id === sessionId);
  if (!session) return { change: null, note: "The trigger names no known session." };
  if (ctx.trigger.eventType === "session.cancelled")
    return {
      change: {
        type: "cancel",
        sessionId: session.id,
        reason: str(p.reason) ?? "Speaker cancelled",
        // A speaker dropping out often arrives with the session already off; then only the gap needs a plan.
        alreadyCancelled: session.status === "cancelled",
      },
    };
  if (ctx.trigger.eventType === "session.updated" || ctx.trigger.eventType === "session.room_changed") {
    const involved = detectClashes(state).some((c) =>
      "sessionIds" in c ? c.sessionIds.includes(session.id) : c.sessionId === session.id,
    );
    return involved
      ? { change: { type: "move", sessionId: session.id, notBefore: session.startsAt } }
      : { change: null, note: "The updated session causes no clash. Nothing to replan." };
  }
  if (ctx.trigger.eventType === "session.running_late" || p.type === "schedule.shift_downstream") {
    const minutes = typeof p.minutes === "number" ? p.minutes : 0;
    if (minutes > 0) return { change: { type: "delay", sessionId: session.id, minutes } };
  }
  return { change: null, note: "This trigger needs no schedule change." };
}

/** Deterministic: same state and trigger, same options. */
export async function planFor(ctx: Ctx): Promise<Plan> {
  const [sessions, rooms, choices] = await Promise.all([
    ctx.services.sessions(),
    ctx.services.rooms(),
    ctx.services.sessionChoices(),
  ]);
  const state: ScheduleState = { rooms, choices, sessions };
  const { change, note } = changeFor(ctx, sessions, state);
  if (!change) return { change, state, options: [], note };

  const anchor =
    state.sessions.find((s) => "sessionId" in change && s.id === change.sessionId)?.startsAt ??
    ctx.services.now();
  const day = istDateKey(anchor);
  const constraints = {
    dayStart: istToUtc(`${day}T08:00`).toISOString(),
    dayEnd: istToUtc(`${day}T20:00`).toISOString(),
    protectedWindows: state.sessions
      .filter((s) => s.kind === "meal" && istDateKey(s.startsAt) === day)
      .map((s) => ({ start: s.startsAt, end: s.endsAt })),
  };
  return { change, state, options: replanOptions(state, change, constraints) };
}

/** The plan.bundle for one solver option, with crew, announcements and the KB note composed in. */
export function bundleFor(ctx: Ctx, plan: Plan, optionId: string, rationale: string): Promise<AgentProposal> {
  return composeBundle(ctx.services, plan, optionId, rationale);
}

export const schedulerTools: ToolDef<ReadServices>[] = [
  {
    name: "get_options",
    description: "Run the schedule solver for this trigger and return its options with metrics.",
    input: z.object({}),
    run: (async (_: unknown, ctx: Ctx) => {
      const plan = await planFor(ctx);
      return {
        change: plan.change,
        note: plan.note,
        options: plan.options.map(({ id, label, metrics }) => ({ id, label, metrics })),
      };
    }) as never,
  },
  {
    name: "choose_option",
    description:
      "Propose one solver option for approval. Give its id and a rationale that cites its metrics.",
    input: z.object({
      optionId: z.string().describe("An id returned by get_options, such as opt-1"),
      rationale: z.string().min(1).max(600),
    }),
    run: (async (i: { optionId: string; rationale: string }, ctx: Ctx) => {
      const plan = await planFor(ctx);
      if (!plan.options.some((o) => o.id === i.optionId))
        return {
          error: `No option ${i.optionId}. Choose one of: ${plan.options.map((o) => o.id).join(", ") || "none"}`,
        };
      const res = await ctx.propose(await bundleFor(ctx, plan, i.optionId, i.rationale));
      return res.status === "invalid" ? { status: "invalid", issues: res.issues } : { status: res.status };
    }) as never,
  },
];
