import { BriefingQuery, BriefingResponse, GenerateBriefingRequest } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, readJson, route } from "@/server/http";
import { enforce } from "@/server/rate-limit";
import { generateBriefing, latestBriefing } from "@/server/services/briefings";

export const dynamic = "force-dynamic";

// Today's briefing (or a given date), full or for one lead's domain.
export const GET = route(async (req) => {
  const q = BriefingQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const actor = await getActor(req, { eventId: q.eventId });
  return json(BriefingResponse, { briefing: await latestBriefing(actor, q) });
});

// Generate a briefing now from live facts. Model wording, numbers from the database.
export const POST = route(async (req) => {
  const body = await readJson(req, GenerateBriefingRequest);
  const actor = await getActor(req, { eventId: body.eventId });
  await enforce(`briefing:${actor.userId}`, 10, 600, "Too many briefings. Wait a few minutes.");
  return json(BriefingResponse, { briefing: await generateBriefing(actor, body.domain) });
});
