/**
 * Liveness facts the worker leaves in app_settings for `pnpm demo:preflight`: a heartbeat every
 * 30 seconds (with whether it polls Telegram), and the last time Telegram refused its poll with 409
 * (another poller holds the bot). Real time, not the demo clock.
 */
import { eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { appSettings } from "@/db/schema";

export const HEARTBEAT_KEY = "worker.heartbeat";
export const TELEGRAM_CONFLICT_KEY = "telegram.conflict";

async function put(db: Pick<Db, "insert">, key: string, value: Record<string, unknown>) {
  await db
    .insert(appSettings)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: sql`now()` } });
}

export const writeHeartbeat = (db: Pick<Db, "insert">, telegramPolling: boolean) =>
  put(db, HEARTBEAT_KEY, { at: new Date().toISOString(), telegramPolling });

export const recordTelegramConflict = (db: Pick<Db, "insert">) =>
  put(db, TELEGRAM_CONFLICT_KEY, { at: new Date().toISOString() });

export async function readSetting<T>(db: Pick<Db, "select">, key: string): Promise<T | null> {
  const [row] = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return (row?.value as T | undefined) ?? null;
}
