import { RevocationListResponse } from "@/contracts/api";
import { json, route } from "@/server/http";
import { getRevocations } from "@/server/services/public";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// Revoked ticket ids, synced to scanners so a revoked ticket fails offline too.
export const GET = route<Ctx>(async (_req, ctx) => {
  const { slug } = await ctx.params;
  return json(RevocationListResponse, await getRevocations(slug));
});
