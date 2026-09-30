import { PublicStatusResponse } from "@/contracts/api";
import { json, route } from "@/server/http";
import { getPublicStatus } from "@/server/services/public";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// Venue status board: now and next per room, public announcements.
export const GET = route<Ctx>(async (_req, ctx) => {
  const { slug } = await ctx.params;
  return json(PublicStatusResponse, await getPublicStatus(slug), {
    headers: { "cache-control": "public, max-age=5, s-maxage=5" },
  });
});
