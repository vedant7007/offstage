import { IntakeRequest, IntakeResponse } from "@/contracts/api";
import { getActor, getSessionInfo, requirePermission } from "@/server/authz";
import { json, readJson, route, unauthenticated } from "@/server/http";
import { enforce } from "@/server/rate-limit";
import { intakeTurn } from "@/server/services/intake";

export const dynamic = "force-dynamic";

// One turn of the Commander's intake interview. Without an eventId it starts a new draft event.
export const POST = route(async (req) => {
  const body = await readJson(req, IntakeRequest);
  let userId: string;
  if (body.eventId) {
    const actor = await getActor(req, { eventId: body.eventId });
    requirePermission(actor, "event.manage", { eventId: body.eventId });
    userId = actor.userId;
  } else {
    const info = await getSessionInfo(req.headers);
    if (!info) throw unauthenticated();
    userId = info.userId;
  }
  await enforce(`intake:${userId}`, 30, 600, "Too many messages. Wait a few minutes.");
  return json(IntakeResponse, await intakeTurn(userId, body));
});
