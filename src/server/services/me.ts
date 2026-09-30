import { eq } from "drizzle-orm";
import type { MeResponse } from "@/contracts/api";
import type { Domain, EventType, Role } from "@/contracts";
import { db } from "@/db/client";
import { events, memberships } from "@/db/schema";
import { getClockOffsetMs } from "@/lib/time";
import type { SessionInfo } from "@/server/authz";
import { demoModeOn } from "@/server/auth/demo-persona";

/** The signed-in user, their memberships and the active event. */
export async function buildMe(info: SessionInfo): Promise<MeResponse> {
  const rows = await db
    .select({
      eventId: memberships.eventId,
      role: memberships.role,
      domains: memberships.domains,
      slug: events.slug,
      name: events.name,
      type: events.type,
    })
    .from(memberships)
    .innerJoin(events, eq(events.id, memberships.eventId))
    .where(eq(memberships.userId, info.userId));
  const list = rows.map((r) => ({
    eventId: r.eventId,
    eventSlug: r.slug,
    eventName: r.name,
    eventType: r.type as EventType,
    role: r.role as Role,
    domains: r.domains as Domain[],
  }));
  const active =
    info.activeEventId && list.some((m) => m.eventId === info.activeEventId)
      ? info.activeEventId
      : list.length === 1
        ? list[0]!.eventId
        : null;
  return {
    user: { id: info.userId, name: info.name, email: info.email },
    memberships: list,
    activeEventId: active,
    demoMode: demoModeOn(),
    clockOffsetMs: getClockOffsetMs(),
  };
}
