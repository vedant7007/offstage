import { NextResponse, type NextRequest } from "next/server";
import { isShowcase } from "@/showcase/flag";
import { showcaseApiBlock } from "@/showcase/guard/api-block";

/** In the showcase build every /api request is answered here; in real mode this passes through. */
export function proxy(request: NextRequest) {
  return (isShowcase() && showcaseApiBlock(request)) || NextResponse.next();
}

export const config = { matcher: ["/api", "/api/:path*"] };
