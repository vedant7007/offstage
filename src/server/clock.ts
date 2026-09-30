/**
 * Demo clock. `pnpm demo:reset` stores an offset in app_settings so that nowUtc() reads as
 * 10:30 IST on day 1 of HackNova (24 Oct 2026) at the moment of the reset, then runs forward
 * at normal speed. The web app and the worker both load it, so they agree on "now".
 * Outside DEMO_MODE the offset is always 0.
 */
import { eq } from "drizzle-orm";
import { db, type Db } from "@/db/client";
import { appSettings } from "@/db/schema";
import { getClockOffsetMs, setClockOffsetMs } from "@/lib/time";
import { logger } from "@/lib/logger";

const KEY = "demo_clock";
const log = logger.child({ module: "clock" });

export interface DemoClock {
  /** The instant nowUtc() showed when the clock was set. */
  anchor: string;
  offsetMs: number;
  setAt: string;
}

function demoMode(): boolean {
  const v = process.env.DEMO_MODE;
  return v === "true" || v === "1";
}

/** Store a demo clock so that "now" equals `anchor` right now. Pass null to return to real time. */
export async function setDemoClock(
  client: Pick<Db, "insert" | "delete">,
  anchor: Date | null,
): Promise<DemoClock | null> {
  if (!anchor) {
    await client.delete(appSettings).where(eq(appSettings.key, KEY));
    setClockOffsetMs(0);
    return null;
  }
  const clock: DemoClock = {
    anchor: anchor.toISOString(),
    offsetMs: anchor.getTime() - Date.now(),
    setAt: new Date().toISOString(),
  };
  await client
    .insert(appSettings)
    .values({ key: KEY, value: clock })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: clock, updatedAt: new Date() } });
  setClockOffsetMs(clock.offsetMs);
  return clock;
}

/** Load the stored offset into this process. Safe to call often. */
export async function syncDemoClock(client: Pick<Db, "select"> = db): Promise<void> {
  if (!demoMode()) {
    setClockOffsetMs(0);
    return;
  }
  const rows = await client.select().from(appSettings).where(eq(appSettings.key, KEY)).limit(1);
  const clock = rows[0]?.value as DemoClock | undefined;
  const next = clock && Number.isFinite(clock.offsetMs) ? clock.offsetMs : 0;
  if (next !== getClockOffsetMs()) log.info({ offsetMs: next }, "demo clock updated");
  setClockOffsetMs(next);
}

let timer: ReturnType<typeof setInterval> | undefined;

/** Keep this process in step with the stored demo clock (a reset elsewhere is picked up within the interval). */
export function startDemoClockSync(intervalMs = 15_000): void {
  if (timer || !demoMode()) return;
  const tick = () => syncDemoClock().catch((err: unknown) => log.warn({ err }, "demo clock sync failed"));
  void tick();
  timer = setInterval(tick, intervalMs);
  timer.unref?.();
}
