import "@/server/load-env";
import { PgBoss } from "pg-boss";
import { createLogger } from "@/lib/logger";

process.env.SUTRADHAR_SERVICE ??= "worker";
const log = createLogger({ base: { service: "worker" } });

/**
 * Background worker: domain event fan-out, channel delivery, reminders and
 * (registered by Vedant under worker/jobs/agents) agent runs. Jobs are added per checkpoint.
 */
async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");

  const boss = new PgBoss({ connectionString: url, application_name: "sutradhar-worker" });
  boss.on("error", (err: unknown) => log.error({ err }, "pg-boss error"));
  await boss.start();
  log.info("worker started");

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    log.info({ signal }, "worker stopping");
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
