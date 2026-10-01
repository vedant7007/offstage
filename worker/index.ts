import "@/server/load-env";
import { PgBoss } from "pg-boss";
import { registerAllAgents } from "@/agents";
import { useSpendStore as installSpendStore } from "@/ai/router";
import { dbSpendStore } from "@/server/services/spend";
import type { RuntimeDeps } from "@/agents/runtime/types";
import { createLogger } from "@/lib/logger";
import { startDemoClockSync } from "@/server/clock";
import { activeEventIds, dbGate, runtimeDepsFor } from "@/server/services/agent-runtime";
import { registerAgentSchedules } from "./jobs/agents/dispatcher";
import { registerDomainEventFanOut } from "./jobs/events";
import { startOutboxDelivery } from "./jobs/outbox";
import { db } from "@/db/client";
import { pollTelegram } from "@/server/channels/telegram";
import { writeHeartbeat } from "@/server/heartbeat";
import { morningBriefings } from "@/server/services/briefings";

process.env.SUTRADHAR_SERVICE ??= "worker";
const log = createLogger({ base: { service: "worker" } });

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
  installSpendStore(dbSpendStore());
  registerAllAgents();

  const stopListening = await registerDomainEventFanOut(boss, log);

  // Scheduled agents run once per active event, each with its own event-bound deps.
  const queues = await registerAgentSchedules(boss, {
    deps: (eventId) => runtimeDepsFor(eventId) as unknown as RuntimeDeps<unknown>,
    gate: dbGate(),
    activeEvents: () => activeEventIds(),
  });
  log.info({ queues }, "agent schedules registered");

  // Commander's morning briefing, 07:00 IST, for every running event.
  await boss.createQueue("daily-briefing").catch(() => {});
  await boss.schedule("daily-briefing", "0 7 * * *", null, { tz: "Asia/Kolkata" });
  await boss.work("daily-briefing", async () => {
    for (const eventId of await activeEventIds()) {
      const n = await morningBriefings(eventId).catch(
        (err: unknown) => (log.error({ err, eventId }, "briefing failed"), 0),
      );
      log.info({ eventId, briefings: n }, "morning briefings written");
    }
  });

  const stopDelivery = await startOutboxDelivery(log);
  const telegram = new AbortController();
  // Telegram allows one poller per bot token, so only the worker that owns the bot polls (the
  // server). Sending needs only the token, so outbound Telegram works with polling off.
  const polling = process.env.TELEGRAM_POLLING === "on" && Boolean(process.env.TELEGRAM_BOT_TOKEN);
  log.info(`telegram polling: ${polling ? "on" : "off"}`);
  if (polling) void pollTelegram(db, log, telegram.signal);
  // Liveness for pnpm demo:preflight.
  const beat = () =>
    writeHeartbeat(db, polling).catch((err: unknown) => log.warn({ err }, "heartbeat failed"));
  void beat();
  const heartbeat = setInterval(beat, 30_000);
  log.info("worker started");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "worker stopping");
    stopDelivery();
    clearInterval(heartbeat);
    telegram.abort();
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
