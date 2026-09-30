// Logistics: every hour, food counts for upcoming meals follow the confirmed registrations (by food
// preference, team members only for team meals). When a session changes room, the new room's readiness
// checklist gains an AV check and seating items, and the old room gets a redirect sign. Rules only.

import type { Checklist } from "@/contracts";
import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig, AgentProposal, RunContext } from "@/agents/runtime/types";
import { formatDate, formatTime, istDateKey } from "@/lib/time";
import { foodCounts, moveItems, sameCounts, withItems } from "./logic";

type Ctx = RunContext<ReadServices>;
type Updated = {
  sessionId?: string;
  before?: { roomId: string };
  after?: { roomId: string; startsAt: string };
};

/** Upcoming meals whose count, from confirmed registrations and food preferences, differs from what is recorded. */
async function foodPlan(ctx: Ctx): Promise<AgentProposal[]> {
  const [event, prefs, recorded] = await Promise.all([
    ctx.services.event(),
    ctx.services.foodPreferences(),
    ctx.services.recordedFoodCounts(),
  ]);
  const now = ctx.services.now();
  const today = istDateKey(now);
  const clock = new Date(now).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
  const out: AgentProposal[] = [];
  for (const m of event.settings.mealPlan) {
    if (m.date < today || (m.date === today && m.time <= clock)) continue;
    const counts = foodCounts(m.audience === "hackathon_teams" ? prefs.teams : prefs.all);
    const before = recorded.find((r) => r.date === m.date && r.meal === m.meal);
    if (before && sameCounts(before, counts)) continue;
    const total = counts.veg + counts.nonVeg + counts.vegan + counts.jain + counts.other;
    const who = m.audience === "hackathon_teams" ? "hackathon team members" : "confirmed registrations";
    out.push({
      kind: "logistics.food_count.set",
      payload: {
        date: m.date,
        meal: m.meal,
        counts,
        basis: `${total} ${who} by food preference, as of ${formatTime(now)}.`,
      },
      summary:
        `${m.meal[0]!.toUpperCase()}${m.meal.slice(1)} on ${formatDate(`${m.date}T12:00:00+05:30`)}: ${total} plates`.slice(
          0,
          120,
        ),
      rationale: before
        ? `The recorded count (${before.veg + before.nonVeg + before.vegan + before.jain + before.other}) no longer matches ${total} ${who}: veg ${counts.veg}, non-veg ${counts.nonVeg}, vegan ${counts.vegan}, jain ${counts.jain}, other ${counts.other}.`
        : `No count recorded yet. ${total} ${who}: veg ${counts.veg}, non-veg ${counts.nonVeg}, vegan ${counts.vegan}, jain ${counts.jain}, other ${counts.other}.`,
      evidence: [{ type: "metric", ref: "live:registrations/food_preferences", label: `${total} ${who}` }],
      dedupeKey: `food:${m.date}:${m.meal}:${Object.values(counts).join("-")}`,
    });
  }
  return out;
}

async function plan(ctx: Ctx): Promise<AgentProposal[]> {
  if (ctx.trigger.type === "schedule") return foodPlan(ctx);
  if (ctx.trigger.eventType !== "session.updated") return [];
  const p = (ctx.payload ?? {}) as Updated;
  if (!p.sessionId || !p.before || !p.after || p.before.roomId === p.after.roomId) return [];
  const [sessions, rooms, lists] = await Promise.all([
    ctx.services.sessions(),
    ctx.services.rooms(),
    ctx.services.checklists(),
  ]);
  const session = sessions.find((s) => s.id === p.sessionId);
  const to = rooms.find((r) => r.id === p.after!.roomId);
  const from = rooms.find((r) => r.id === p.before!.roomId);
  if (!session || !to) return [];
  const items = moveItems(session, to, formatTime(p.after.startsAt));
  const evidence = [
    { type: "row" as const, ref: `sessions/${session.id}`, label: session.title.slice(0, 160) },
  ];
  const key = `room-move:${session.id}:${p.after.roomId}:${p.after.startsAt}`;
  const listFor = (roomId: string) =>
    lists.find((c: Checklist) => c.scope.type === "room" && c.scope.ref === roomId);

  const out: AgentProposal[] = [];
  const add = (roomId: string, roomName: string, extra: Parameters<typeof withItems>[1], why: string) => {
    const list = listFor(roomId);
    const merged = withItems(list, extra);
    if (!merged) return;
    out.push({
      kind: "logistics.checklist.update",
      payload: {
        ...(list ? { checklistId: list.id } : { title: `${roomName} readiness` }),
        scope: { type: "room", ref: roomId },
        items: merged,
      },
      summary: `${roomName}: ${why}`.slice(0, 120),
      rationale: `"${session.title}" moved from ${from?.name ?? "another room"} to ${to.name}.`.slice(0, 600),
      evidence,
      dedupeKey: `${key}:${roomId}`,
    });
  };
  add(to.id, to.name, items.newRoom, `get ready for "${session.title}"`);
  if (from) add(from.id, from.name, items.oldRoom, "put up a redirect sign");
  return out;
}

export const logistics: AgentConfig<ReadServices> = {
  name: "logistics",
  purpose: "Keeps food counts and room readiness checklists in step with registrations and the schedule",
  humanLeadRole: "lead",
  domain: "logistics",
  modelTier: "fast",
  tools: [],
  actions: ["logistics.checklist.update", "logistics.food_count.set"],
  systemPrompt: () => "",
  triggers: [
    { type: "domain_event", eventType: "session.updated" },
    { type: "schedule", name: "food_counts", cron: "15 * * * *" },
  ],
  maxSteps: 1,
  criticality: "normal",
  pipeline: async (ctx) => {
    const proposals = await plan(ctx);
    for (const p of proposals) await ctx.propose(p);
    return {
      text: proposals.length ? `Proposed ${proposals.length} checklist updates.` : "Nothing to update.",
    };
  },
  fallback: plan,
};
