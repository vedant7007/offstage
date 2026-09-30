import { WhatIfRequest, WhatIfResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, readJson, route } from "@/server/http";
import { enforce } from "@/server/rate-limit";
import { runWhatIf } from "@/server/services/whatif";

export const dynamic = "force-dynamic";

// Simulate a scenario on a copy of the event. Nothing real changes; recommendations come back "simulated".
export const POST = route(async (req) => {
  const body = await readJson(req, WhatIfRequest);
  const actor = await getActor(req, { eventId: body.eventId });
  await enforce(`whatif:${actor.userId}`, 10, 600, "Too many simulations. Wait a few minutes.");
  return json(WhatIfResponse, await runWhatIf(actor, body.scenario));
});
