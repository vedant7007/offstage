import { MyRegistrationResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, route } from "@/server/http";
import { getMyRegistration } from "@/server/services/registrations";

export const dynamic = "force-dynamic";

// The caller's own registration for their active event.
export const GET = route(async (req) => {
  const actor = await getActor(req);
  return json(MyRegistrationResponse, { registration: await getMyRegistration(actor) });
});
