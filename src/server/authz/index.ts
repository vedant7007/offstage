/**
 * The single authz helper every route and server action calls:
 *
 *   const actor = await getActor(req, { eventId });       // 401 without a session, 403 without a membership
 *   requirePermission(actor, "proposal.approve", { eventId, domain, riskTier });
 *
 * Role, domains, org and event come from the membership row in the database, never from the request.
 */
import { and, eq } from "drizzle-orm";
import type { Actor, Domain, Role, UserActor } from "@/contracts";
import { db } from "@/db/client";
import { memberships } from "@/db/schema";
import { auth } from "@/server/auth";
import { forbidden, HttpError, unauthenticated } from "@/server/http";
import { can, type Permission, type Scope } from "./permissions";

export { can, PERMISSIONS, type Permission, type Scope } from "./permissions";

export interface SessionInfo {
  userId: string;
  sessionId: string;
  email: string;
  name: string;
  activeEventId: string | null;
}

/** The signed-in user for this request, or null. */
export async function getSessionInfo(headers: Headers): Promise<SessionInfo | null> {
  const s = await auth.api.getSession({ headers });
  if (!s) return null;
  const session = s.session as typeof s.session & { activeEventId?: string | null };
  return {
    userId: s.user.id,
    sessionId: session.id,
    email: s.user.email,
    name: s.user.name,
    activeEventId: session.activeEventId ?? null,
  };
}

/**
 * Resolve the acting user for one event. With `eventId` (console routes, from the path) the user
 * needs a membership in that event. Without it, the session's active event is used, or the only
 * membership the user has.
 */
export async function getActor(req: Request, opts: { eventId?: string } = {}): Promise<UserActor> {
  const info = await getSessionInfo(req.headers);
  if (!info) throw unauthenticated();

  const rows = await db.select().from(memberships).where(eq(memberships.userId, info.userId));
  const targetEvent = opts.eventId ?? info.activeEventId ?? (rows.length === 1 ? rows[0]!.eventId : null);
  if (!targetEvent) throw new HttpError("bad_request", "Choose an event first (POST /api/me/active-event)");

  const m = rows.find((r) => r.eventId === targetEvent);
  if (!m) throw forbidden();
  return {
    kind: "user",
    userId: info.userId,
    orgId: m.orgId,
    eventId: m.eventId,
    role: m.role as Role,
    domains: m.role === "lead" ? (m.domains as Domain[]) : undefined,
  };
}

/** Throw 403 unless the actor holds the permission for this scope. */
export function requirePermission(actor: Actor, permission: Permission, scope: Scope = {}): void {
  if (!can(actor, permission, scope)) throw forbidden();
}

/** The membership for a given user and event, if any. */
export async function membershipFor(userId: string, eventId: string) {
  const [m] = await db
    .select()
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.eventId, eventId)))
    .limit(1);
  return m ?? null;
}
