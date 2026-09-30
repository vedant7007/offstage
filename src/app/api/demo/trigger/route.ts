import { DemoTriggerRequest, DemoTriggerResponse } from "@/contracts/api";
import { HACKNOVA_SLUG } from "@/contracts/fixtures";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { events } from "@/db/schema";
import { runScenario } from "@/db/demo/trigger";
import { demoModeOn } from "@/server/auth/demo-persona";
import { getActor, requirePermission } from "@/server/authz";
import { json, notFound, readJson, route } from "@/server/http";

// DEMO_MODE only: fire a scripted disruption on HackNova from the console. 404 when DEMO_MODE is off.
export const POST = route(async (req) => {
  if (!demoModeOn()) throw notFound();
  const [ev] = await db.select({ id: events.id }).from(events).where(eq(events.slug, HACKNOVA_SLUG));
  if (!ev) throw notFound("Demo event not seeded");
  const actor = await getActor(req, { eventId: ev.id });
  requirePermission(actor, "event.manage", { eventId: ev.id });
  const { scenario } = await readJson(req, DemoTriggerRequest);
  return json(DemoTriggerResponse, { message: await runScenario(scenario) });
});
