import { MyScheduleResponse } from "@/contracts/api";
import { getActor, requirePermission } from "@/server/authz";
import { json, route } from "@/server/http";
import { getMySchedule } from "@/server/services/my-schedule";

export const dynamic = "force-dynamic";

// The event schedule with the caller's choices marked and the latest change per session.
export const GET = route(async (req) => {
  const actor = await getActor(req);
  requirePermission(actor, "me.read");
  return json(MyScheduleResponse, await getMySchedule(actor));
});
