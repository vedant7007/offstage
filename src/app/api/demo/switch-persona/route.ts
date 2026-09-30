import { NextResponse } from "next/server";
import { MeResponse, SwitchPersonaRequest } from "@/contracts/api";
import { auth } from "@/server/auth";
import { demoModeOn } from "@/server/auth/demo-persona";
import { getSessionInfo } from "@/server/authz";
import { json, notFound, readJson, route } from "@/server/http";
import { buildMe } from "@/server/services/me";

// DEMO_MODE only: become a seeded persona. 404 when DEMO_MODE is off.
export const POST = route(async (req) => {
  if (!demoModeOn()) throw notFound();
  const body = await readJson(req, SwitchPersonaRequest);
  // Through the Better Auth handler, so the session cookie is created and signed the normal way.
  const origin = process.env.APP_URL ?? new URL(req.url).origin;
  const res = await auth.handler(
    new Request(`${origin}/api/auth/demo/switch-persona`, {
      method: "POST",
      headers: { "content-type": "application/json", origin },
      body: JSON.stringify(body),
    }),
  );
  if (!res.ok) return new NextResponse(res.body, { status: res.status, headers: res.headers });
  const setCookie = res.headers.getSetCookie();
  const headers = new Headers({ cookie: setCookie.map((c) => c.split(";")[0]).join("; ") });
  const info = await getSessionInfo(headers);
  if (!info) throw notFound("Persona session was not created");
  const out = json(MeResponse, await buildMe(info));
  for (const c of setCookie) out.headers.append("set-cookie", c);
  return out;
});
