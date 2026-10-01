import { resetDemo } from "@/db/demo/reset-core";
import { logger } from "@/lib/logger";
import { demoModeOn } from "@/server/auth/personas";
import { getSessionInfo } from "@/server/authz";
import { assertSameOrigin, notFound, route, unauthenticated } from "@/server/http";

const log = logger.child({ module: "api.demo.reset" });

// DEMO_MODE only: sign-out calls this so every demo run starts clean. 404 when DEMO_MODE is off.
export const POST = route(async (req) => {
  if (!demoModeOn()) throw notFound();
  assertSameOrigin(req);
  if (!(await getSessionInfo(req.headers))) throw unauthenticated();
  const started = Date.now();
  const { tables, events } = await resetDemo();
  log.info({ ms: Date.now() - started, tables, events }, "demo reset from sign-out");
  return Response.json({ ok: true });
});
