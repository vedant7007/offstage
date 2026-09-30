import "@/server/load-env";
import { sql } from "@/db/client";
import { seed } from "@/db/seed";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "demo.reset" });

/**
 * Truncates every domain table and reseeds. Target: under 30 seconds.
 * The table list is filled in with the domain schema in Checkpoint 2.
 */
const TABLES: string[] = [];

async function main() {
  const started = Date.now();
  if (TABLES.length > 0) {
    await sql.unsafe(`truncate table ${TABLES.map((t) => `"${t}"`).join(", ")} restart identity cascade`);
  }
  await seed();
  log.info({ ms: Date.now() - started, tables: TABLES.length }, "demo reset complete");
}

main()
  .catch((err: unknown) => {
    log.error({ err }, "demo reset failed");
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
