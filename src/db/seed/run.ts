import "@/server/load-env";
import { ownerDb, ownerSql } from "@/db/client";
import { seed } from "@/db/seed";
import { logger } from "@/lib/logger";

const client = ownerSql();
seed(ownerDb(client))
  .catch((err: unknown) => {
    logger.error({ err }, "seed failed (run pnpm demo:reset to wipe and reseed)");
    process.exitCode = 1;
  })
  .finally(() => client.end({ timeout: 5 }));
