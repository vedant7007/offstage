import { DataRequestCreate, DataRequestResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, readJson, route } from "@/server/http";
import { createDataRequest } from "@/server/services/data-requests";

export const dynamic = "force-dynamic";

// Ask for an export or deletion of your own data. Staff carry it out.
export const POST = route(async (req) => {
  const actor = await getActor(req);
  const res = await createDataRequest(actor, await readJson(req, DataRequestCreate));
  return json(DataRequestResponse, res, { status: 201 });
});
