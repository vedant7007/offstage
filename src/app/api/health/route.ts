import { NextResponse } from "next/server";
import { sql } from "@/db/client";
import { logger } from "@/lib/logger";
import pkg from "../../../../package.json";

// Public liveness probe used by Caddy, Docker and the deploy script.
// It reads no tenant data, so it is intentionally outside the authz helper.
export const dynamic = "force-dynamic";

const log = logger.child({ module: "api.health" });

export async function GET() {
  const started = Date.now();
  let db: { ok: boolean; latencyMs?: number; error?: string };
  try {
    await sql`select 1`;
    db = { ok: true, latencyMs: Date.now() - started };
  } catch (err) {
    log.error({ err }, "health check database probe failed");
    db = { ok: false, error: "database unreachable" };
  }
  const body = {
    ok: db.ok,
    service: "sutradhar",
    version: pkg.version,
    commit: process.env.GIT_COMMIT ?? null,
    time: new Date().toISOString(),
    db,
  };
  return NextResponse.json(body, {
    status: db.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
}
