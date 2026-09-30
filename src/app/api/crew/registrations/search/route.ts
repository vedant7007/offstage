import { CrewSearchQuery, CrewSearchResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, route } from "@/server/http";
import { searchRegistrations } from "@/server/services/crew-search";

export const dynamic = "force-dynamic";

// Look someone up at the check-in desk. Crew with check-in rights only; contact details masked.
export const GET = route(async (req) => {
  const actor = await getActor(req);
  const { q } = CrewSearchQuery.parse({ q: new URL(req.url).searchParams.get("q") ?? "" });
  return json(CrewSearchResponse, { items: await searchRegistrations(actor, q) });
});
