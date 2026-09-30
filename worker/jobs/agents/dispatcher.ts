// Wakes agents from domain events and pg-boss schedules, by each config's triggers.
// Abhinav's event bus calls dispatch() for every domain event; worker/index.ts calls registerAgentSchedules().

import type { PgBoss } from "pg-boss";
import type { AgentName, DomainEvent, DomainEventType } from "@/agents/runtime/contracts";
import { registered, wake, type Gate, type WakeResult } from "@/agents/runtime/registry";
import type { RuntimeDeps } from "@/agents/runtime/types";

/** Events whose payload carries text from attendees, volunteers or sponsors: screened and wrapped, never trusted. */
const UNTRUSTED_EVENTS = new Set<DomainEventType>([
  "helpdesk.message",
  "voice_note.received",
  "sponsor.reply_received",
]);

export type DispatchEnv = { deps: RuntimeDeps<unknown>; gate: Gate };

export async function dispatch(
  event: DomainEvent,
  env: DispatchEnv,
): Promise<{ agent: AgentName; result: WakeResult }[]> {
  const targets = registered().filter((c) =>
    c.triggers.some((t) => t.type === "domain_event" && t.eventType === event.type),
  );
  return Promise.all(
    targets.map(async (c) => ({
      agent: c.name,
      result: await wake(
        c.name,
        { type: "domain_event", ref: event.id, eventType: event.type },
        { eventId: event.eventId, payload: event.payload, untrusted: UNTRUSTED_EVENTS.has(event.type) },
        env.deps,
        env.gate,
      ),
    })),
  );
}

/**
 * One pg-boss cron job per scheduled trigger, in IST. The job asks `activeEvents()` which events are running
 * and wakes the agent once per event.
 */
export async function registerAgentSchedules(
  boss: PgBoss,
  env: DispatchEnv & { activeEvents: () => Promise<string[]> },
): Promise<string[]> {
  const names: string[] = [];
  for (const c of registered()) {
    for (const t of c.triggers) {
      if (t.type !== "schedule") continue;
      const queue = `agent.${c.name}.${t.name}`;
      await boss.createQueue(queue);
      await boss.schedule(queue, t.cron, null, { tz: "Asia/Kolkata" });
      await boss.work(queue, async () => {
        for (const eventId of await env.activeEvents())
          await wake(c.name, { type: "schedule", ref: t.name }, { eventId, payload: {} }, env.deps, env.gate);
      });
      names.push(queue);
    }
  }
  return names;
}
