/**
 * Route handler plumbing: consistent ApiError responses, response validation against the
 * contracts, same-origin checks for state-changing requests, and client IP.
 */
import { NextResponse } from "next/server";
import { ZodError, type z } from "zod";
import type { ApiError, ApiErrorCode } from "@/contracts/api";
import { logger } from "@/lib/logger";

const log = logger.child({ module: "http" });

const STATUS: Record<ApiErrorCode, number> = {
  bad_request: 400,
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  stale: 409,
  expired: 410,
  rate_limited: 429,
  turnstile_failed: 400,
  otp_invalid: 400,
  capacity_full: 409,
  internal: 500,
};

export class HttpError extends Error {
  readonly status: number;
  constructor(
    readonly code: ApiErrorCode,
    message: string,
    readonly extra: { issues?: { path: string; message: string }[]; retryAfterSeconds?: number } = {},
  ) {
    super(message);
    this.name = "HttpError";
    this.status = STATUS[code];
  }
}

export const unauthenticated = (msg = "Sign in first") => new HttpError("unauthenticated", msg);
export const forbidden = (msg = "You do not have access to this") => new HttpError("forbidden", msg);
export const notFound = (msg = "Not found") => new HttpError("not_found", msg);
export const badRequest = (msg: string) => new HttpError("bad_request", msg);

export function errorResponse(err: unknown): NextResponse<ApiError> {
  if (err instanceof HttpError) {
    const headers: Record<string, string> = {};
    if (err.extra.retryAfterSeconds) headers["retry-after"] = String(err.extra.retryAfterSeconds);
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...err.extra } },
      { status: err.status, headers },
    );
  }
  if (err instanceof ZodError) {
    const issues = err.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
    return NextResponse.json(
      { error: { code: "bad_request", message: "Invalid request", issues } },
      { status: 400 },
    );
  }
  log.error({ err }, "unhandled route error");
  return NextResponse.json({ error: { code: "internal", message: "Something went wrong" } }, { status: 500 });
}

/** Validate the body against its contract schema, then send it. A mismatch is our bug: 500, logged. */
export function json<S extends z.ZodType>(schema: S, data: z.input<S>, init?: ResponseInit): NextResponse {
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    log.error({ issues: parsed.error.issues.slice(0, 5) }, "response does not match its contract");
    throw new HttpError("internal", "Response failed validation");
  }
  return NextResponse.json(parsed.data, {
    ...init,
    headers: { "cache-control": "no-store", ...init?.headers },
  });
}

export async function readJson<S extends z.ZodType>(req: Request, schema: S): Promise<z.infer<S>> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Body must be JSON");
  }
  return schema.parse(body);
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * CSRF guard for cookie-authenticated, state-changing requests: the browser's Origin (or
 * Sec-Fetch-Site) must say same origin. Requests without cookies (server to server) pass.
 */
export function assertSameOrigin(req: Request): void {
  if (!UNSAFE.has(req.method) || !req.headers.get("cookie")) return;
  const allowed = new URL(process.env.APP_URL ?? "http://localhost:3000").origin;
  const origin = req.headers.get("origin");
  if (origin) {
    if (origin !== allowed && origin !== new URL(req.url).origin)
      throw forbidden("Cross-site request blocked");
    return;
  }
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") throw forbidden("Cross-site request blocked");
}

/** Client IP. Trusts X-Forwarded-For only behind our own proxy (TRUST_PROXY=true, set in the cloud). */
export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY === "true") {
    const fwd = req.headers.get("x-forwarded-for");
    if (fwd) return fwd.split(",")[0]!.trim();
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim();
  }
  return "local";
}

/** Wrap a route handler: same-origin check, and every error becomes an ApiError response. */
export function route<C>(handler: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ctx: C): Promise<Response> => {
    try {
      assertSameOrigin(req);
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}
