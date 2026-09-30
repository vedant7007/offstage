import { CheckinSyncRequest, CheckinSyncResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, readJson, route } from "@/server/http";
import { syncCheckins } from "@/server/services/checkin";

export const dynamic = "force-dynamic";

// Scans queued while the scanner was offline. Safe to resend: results are keyed by clientId.
export const POST = route(async (req) => {
  const actor = await getActor(req);
  const { scans } = await readJson(req, CheckinSyncRequest);
  return json(CheckinSyncResponse, { results: await syncCheckins(actor, scans) });
});
