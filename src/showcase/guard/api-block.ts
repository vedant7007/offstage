import { NextResponse, type NextRequest } from "next/server";

/**
 * Showcase builds serve no API: every /api request gets a 404 JSON from the proxy, so no route
 * handler runs, reads a secret or touches a database. The showcase engine needs none of them.
 */
export function showcaseApiBlock(request: NextRequest): NextResponse | undefined {
  const { pathname } = request.nextUrl;
  if (pathname !== "/api" && !pathname.startsWith("/api/")) return undefined;
  return NextResponse.json(
    { error: { code: "not_found", message: "The showcase demo has no server API." } },
    { status: 404, headers: { "cache-control": "no-store" } },
  );
}
