import { eq } from "drizzle-orm";
import { MeResponse, SetActiveEventRequest } from "@/contracts/api";
import { db } from "@/db/client";
import { authSessions } from "@/db/schema";
import { getSessionInfo, membershipFor } from "@/server/authz";
import { forbidden, json, readJson, route, unauthenticated } from "@/server/http";
import { buildMe } from "@/server/services/me";

// Switch which event this session acts under. Only events the user is a member of.
export const POST = route(async (req) => {
  const info = await getSessionInfo(req.headers);
  if (!info) throw unauthenticated();
  const { eventId } = await readJson(req, SetActiveEventRequest);
  if (!(await membershipFor(info.userId, eventId))) throw forbidden();
  await db.update(authSessions).set({ activeEventId: eventId }).where(eq(authSessions.id, info.sessionId));
  return json(MeResponse, await buildMe({ ...info, activeEventId: eventId }));
});
