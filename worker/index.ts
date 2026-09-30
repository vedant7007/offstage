import "@/server/load-env";
import { PgBoss } from "pg-boss";
import { commander } from "@/agents/commander/config";
import { crewChief } from "@/agents/crew-chief/config";
import { helpdesk } from "@/agents/helpdesk/config";
import { herald } from "@/agents/herald/config";
import { register } from "@/agents/runtime/registry";
import type { RuntimeDeps } from "@/agents/runtime/types";
import { scheduler } from "@/agents/scheduler/config";
import { createLogger } from "@/lib/logger";
import { startDemoClockSync } from "@/server/clock";
import { activeEventIds, dbGate, runtimeDepsFor } from "@/server/services/agent-runtime";
import { registerAgentSchedules } from "./jobs/agents/dispatcher";
import { registerDomainEventFanOut } from "./jobs/events";

process.env.SUTRADHAR_SERVICE ??= "worker";
const log = createLogger({ base: { service: "worker" } });

/** Agents that exist today. Replace with a registerAllAgents() from src/agents once it exists. */
function registerAgents(): void {
  for (const config of [commander, scheduler, crewChief, herald, helpdesk]) register(config as never);
}

/**
 * Background worker: domain event fan-out to agents and the KB indexer, agent schedules,
 * channel delivery and reminders (added per checkpoint).
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");

  const boss = new PgBoss({ connectionString: url, application_name: "sutradhar-worker" });
  boss.on("error", (err: unknown) => log.error({ err }, "pg-boss error"));
  await boss.start();
  startDemoClockSync();
  registerAgents();

  const stopListening = await registerDomainEventFanOut(boss, log);

  // Scheduled agents run once per active event, each with its own event-bound deps.
  const queues = await registerAgentSchedules(boss, {
    deps: (eventId) => runtimeDepsFor(eventId) as unknown as RuntimeDeps<unknown>,
    gate: dbGate(),
    activeEvents: () => activeEventIds(),
  });
  log.info({ queues }, "agent schedules registered");
  log.info("worker started");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "worker stopping");
    await stopListening().catch(() => {});
    await boss.stop({ graceful: true, timeout: 10_000 });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err: unknown) => {
  log.fatal({ err }, "worker failed to start");
  process.exit(1);
});
