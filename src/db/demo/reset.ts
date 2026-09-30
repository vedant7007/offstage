import "@/server/load-env";
import { HACKNOVA_NOW } from "@/contracts/fixtures";
import { ownerDb, ownerSql } from "@/db/client";
import { seed } from "@/db/seed";
import { logger } from "@/lib/logger";
import { setDemoClock } from "@/server/clock";

const log = logger.child({ module: "demo.reset" });

/**
 * Wipes every table in the public schema (and queued jobs) and reseeds both demo events.
 * Target: under 30 seconds. Connects as the owner because TRUNCATE is not granted to the app role.
 *
 *   pnpm demo:reset              clock set to 10:30 IST on HackNova day 1, running forward
 *   pnpm demo:reset --real-time  keep real time
 */
async function main() {
  const started = Date.now();
  const realTime = process.argv.includes("--real-time");
  const client = ownerSql();
  try {
    const tables = await client<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE'`;
    if (tables.length === 0) throw new Error("No tables found. Run pnpm db:migrate first.");
    await client.unsafe(
      `truncate table ${tables.map((t) => `"${t.table_name}"`).join(", ")} restart identity cascade`,
    );
    const [{ exists } = { exists: false }] = await client<{ exists: boolean }[]>`
      select exists(select 1 from information_schema.tables where table_schema = 'pgboss' and table_name = 'job') as exists`;
    if (exists) await client.unsafe(`delete from pgboss.job`);

    const db = ownerDb(client);
    const result = await seed(db);
    const clock = await setDemoClock(db, realTime ? null : new Date(HACKNOVA_NOW));
    const ms = Date.now() - started;
    log.info(
      { ms, tables: tables.length, events: result.events, clockAnchor: clock?.anchor ?? "real time" },
      "demo reset complete",
    );
    console.log(
      `demo reset: ${tables.length} tables wiped, seeded ${result.events.join(" and ")} in ${ms} ms`,
    );
    console.log(
      clock
        ? `demo clock: now reads as ${clock.anchor} (10:30 IST, HackNova day 1)`
        : "demo clock: real time",
    );
  } finally {
    await client.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  log.error({ err }, "demo reset failed");
  process.exitCode = 1;
});
