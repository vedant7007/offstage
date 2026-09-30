import { CheckinRequest, CheckinResult } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, readJson, route } from "@/server/http";
import { checkIn } from "@/server/services/checkin";

export const dynamic = "force-dynamic";

// One online scan. Invalid, revoked and duplicate tickets are 200 with a status, not errors.
export const POST = route(async (req) => {
  const actor = await getActor(req);
  return json(CheckinResult, await checkIn(actor, await readJson(req, CheckinRequest)));
});
