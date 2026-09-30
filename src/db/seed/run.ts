import "@/server/load-env";
import { sql } from "@/db/client";
import { seed } from "@/db/seed";
import { logger } from "@/lib/logger";

seed()
  .catch((err: unknown) => {
    logger.error({ err }, "seed failed");
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
