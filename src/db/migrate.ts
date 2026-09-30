import "@/server/load-env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { ownerDb, ownerSql } from "@/db/client";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "db.migrate" });

async function main() {
  const started = Date.now();
  const client = ownerSql();
  try {
    await migrate(ownerDb(client), { migrationsFolder: "./src/db/migrations" });
    log.info({ ms: Date.now() - started }, "migrations applied");
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  log.error({ err }, "migration failed");
  process.exitCode = 1;
});
