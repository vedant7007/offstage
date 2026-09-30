import { PublicEventResponse } from "@/contracts/api";
import { json, route } from "@/server/http";
import { getPublicEvent } from "@/server/services/public";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// Public event page data. No login; a short shared cache so a crowd does not hit the database.
export const GET = route<Ctx>(async (_req, ctx) => {
  const { slug } = await ctx.params;
  return json(PublicEventResponse, await getPublicEvent(slug), {
    headers: { "cache-control": "public, max-age=10, s-maxage=10" },
  });
});
