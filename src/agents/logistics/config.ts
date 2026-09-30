// Logistics: when a session changes room, the new room's readiness checklist gains an AV check and seating
// items for it, and the old room gets a redirect sign. Rules only; existing items are always kept.

import type { Checklist } from "@/contracts";
import type { ReadServices } from "@/agents/runtime/services";
import type { AgentConfig, AgentProposal, RunContext } from "@/agents/runtime/types";
import { formatTime } from "@/lib/time";
import { moveItems, withItems } from "./logic";

type Ctx = RunContext<ReadServices>;
type Updated = {
  sessionId?: string;
  before?: { roomId: string };
  after?: { roomId: string; startsAt: string };
};

async function plan(ctx: Ctx): Promise<AgentProposal[]> {
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
  purpose: "Keeps room readiness checklists in step with the schedule",
  humanLeadRole: "lead",
  domain: "logistics",
  modelTier: "fast",
  tools: [],
  actions: ["logistics.checklist.update"],
  systemPrompt: () => "",
  triggers: [{ type: "domain_event", eventType: "session.updated" }],
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
