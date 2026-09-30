import { VerifyKeyResponse } from "@/contracts/api";
import { json, route } from "@/server/http";
import { getVerifyKey } from "@/server/services/public";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// The Ed25519 public key scanners cache to verify tickets offline.
export const GET = route<Ctx>(async (_req, ctx) => {
  const { slug } = await ctx.params;
  return json(VerifyKeyResponse, await getVerifyKey(slug), {
    headers: { "cache-control": "public, max-age=300" },
  });
});
