import "@/server/load-env";
import { z } from "zod";
import { sql } from "@/db/client";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "demo.trigger" });

/** Scripted demo disruptions (blueprint Section 11). Implementations land in Checkpoint 2. */
export const Scenario = z.enum([
  "speaker_cancel",
  "lunch_confusion",
  "volunteer_noshow",
  "queue_spike",
  "budget_breach",
  "projector_voice_note",
]);

async function main() {
  const parsed = Scenario.safeParse(process.argv[2]);
  if (!parsed.success) {
    console.error(`Usage: pnpm demo:trigger <${Scenario.options.join("|")}>`);
    process.exitCode = 2;
    return;
  }
  log.warn({ scenario: parsed.data }, "scenario not implemented yet (Checkpoint 2)");
}

main()
  .catch((err: unknown) => {
    log.error({ err }, "demo trigger failed");
    process.exitCode = 1;
  })
  .finally(() => sql.end({ timeout: 5 }));
