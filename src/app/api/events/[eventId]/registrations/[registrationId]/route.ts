import { RegistrationResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, route } from "@/server/http";
import { getRegistration } from "@/server/services/registrations";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ eventId: string; registrationId: string }> };

// One registration. Attendees get only their own (403 otherwise); staff per the permission matrix.
export const GET = route<Ctx>(async (req, ctx) => {
  const { eventId, registrationId } = await ctx.params;
  const actor = await getActor(req, { eventId });
  return json(RegistrationResponse, { registration: await getRegistration(actor, registrationId) });
});
