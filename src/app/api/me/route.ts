import { MeResponse } from "@/contracts/api";
import { getSessionInfo } from "@/server/authz";
import { json, route, unauthenticated } from "@/server/http";
import { buildMe } from "@/server/services/me";

export const dynamic = "force-dynamic";

export const GET = route(async (req) => {
  const info = await getSessionInfo(req.headers);
  if (!info) throw unauthenticated();
  return json(MeResponse, await buildMe(info));
});
