import "@/server/load-env";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { db, sql } from "@/db/client";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "db.migrate" });

async function main() {
  const started = Date.now();
  await migrate(db, { migrationsFolder: "./src/db/migrations" });
  log.info({ ms: Date.now() - started }, "migrations applied");
}

main()
  .catch((err: unknown) => {
    log.error({ err }, "migration failed");
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
