import "@/server/load-env";
import { logger } from "@/lib/logger";
import { resetDemo } from "./reset-core";

const log = logger.child({ module: "demo.reset" });

/**
 * Wipes the demo database and reseeds both demo events. Target: under 30 seconds.
 *
 *   pnpm demo:reset              clock set to 10:30 IST on HackNova day 1, running forward
 *   pnpm demo:reset --real-time  keep real time
 */
async function main() {
  const started = Date.now();
  const { tables, events, indexed, clock } = await resetDemo({
    realTime: process.argv.includes("--real-time"),
  });
  const ms = Date.now() - started;
  log.info({ ms, tables, events, clockAnchor: clock?.anchor ?? "real time" }, "demo reset complete");
  console.log(`demo reset: ${tables} tables wiped, seeded ${events.join(" and ")} in ${ms} ms`);
  console.log(
    `knowledge base: indexed ${indexed.length} documents, ${indexed.reduce((s, d) => s + d.chunks, 0)} chunks`,
  );
  console.log(
    clock ? `demo clock: now reads as ${clock.anchor} (10:30 IST, HackNova day 1)` : "demo clock: real time",
  );
}

main().catch((err: unknown) => {
  log.error({ err }, "demo reset failed");
  process.exitCode = 1;
});
