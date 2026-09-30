import { MyTicketResponse } from "@/contracts/api";
import { getActor, requirePermission } from "@/server/authz";
import { json, route } from "@/server/http";
import { getMyTicket } from "@/server/services/tickets";

export const dynamic = "force-dynamic";

// The caller's own ticket and QR for their active event.
export const GET = route(async (req) => {
  const actor = await getActor(req);
  requirePermission(actor, "me.read");
  return json(MyTicketResponse, await getMyTicket(actor));
});
