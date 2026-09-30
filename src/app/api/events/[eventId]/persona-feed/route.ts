import { PersonaFeedResponse } from "@/contracts/api";
import { getActor } from "@/server/authz";
import { json, route } from "@/server/http";
import { personaFeed } from "@/server/services/persona-feed";

export const dynamic = "force-dynamic";
type Ctx = { params: Promise<{ eventId: string }> };

// What the demo attendee, volunteer and a speaker see on their phones, for the console dock.
export const GET = route<Ctx>(async (req, ctx) => {
  const { eventId } = await ctx.params;
  const actor = await getActor(req, { eventId });
  return json(PersonaFeedResponse, await personaFeed(actor));
});
