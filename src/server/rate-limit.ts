/**
 * Fixed-window rate limits stored in Postgres, so they hold across the web app and worker
 * and survive restarts. Keys must not contain personal data: hash emails first.
 */
import { lt, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db/client";
import { rateLimits } from "@/db/schema";
import { HttpError } from "./http";

export interface LimitResult {
  ok: boolean;
  count: number;
  limit: number;
  retryAfterSeconds: number;
}

/** Count one hit against `key` and report whether it is within `limit` per `windowSeconds`. */
export async function consume(
  key: string,
  limit: number,
  windowSeconds: number,
  client: Pick<Db, "execute" | "delete"> = defaultDb,
): Promise<LimitResult> {
  // Real time, not the demo clock: limits protect real people.
  const now = Date.now();
  const windowMs = windowSeconds * 1000;
  const start = new Date(Math.floor(now / windowMs) * windowMs);
  const expires = new Date(start.getTime() + windowMs);
  const rows = await client.execute<{ count: number }>(sql`
    insert into ${rateLimits} (key, window_start, count, expires_at)
    values (${key}, ${start.toISOString()}::timestamptz, 1, ${expires.toISOString()}::timestamptz)
    on conflict (key, window_start) do update set count = ${rateLimits}.count + 1
    returning count`);
  const count = Number(rows[0]?.count ?? 1);
  // Occasional cleanup of old windows.
  if (Math.random() < 0.02) await client.delete(rateLimits).where(lt(rateLimits.expiresAt, new Date(now)));
  return {
    ok: count <= limit,
    count,
    limit,
    retryAfterSeconds: Math.max(1, Math.ceil((expires.getTime() - now) / 1000)),
  };
}

/** Throw a 429 ApiError when the limit is exceeded. */
export async function enforce(
  key: string,
  limit: number,
  windowSeconds: number,
  message: string,
): Promise<void> {
  const r = await consume(key, limit, windowSeconds);
  if (!r.ok) throw new HttpError("rate_limited", message, { retryAfterSeconds: r.retryAfterSeconds });
}

/** OTP limits from the build brief: 3 per email per 10 minutes, 20 per IP per hour. */
export const OTP_LIMITS = {
  perEmail: { limit: 3, windowSeconds: 600 },
  perIp: { limit: 20, windowSeconds: 3600 },
} as const;
