import { sql } from "@/db/client";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "db.seed" });

/**
 * Seeds the demo world (blueprint Section 11). The HackNova 2026 and charity drive
 * data arrives with the domain schema in Checkpoint 2; until then this only checks
 * the database is reachable so the command is safe to wire into scripts.
 */
export async function seed(): Promise<void> {
  await sql`select 1`;
  log.info("database reachable; no seed data defined yet");
}
