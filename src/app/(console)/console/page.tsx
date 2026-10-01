import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships } from "@/db/schema";
import { getSessionInfo } from "@/server/authz";
import { WORLD } from "@/showcase/data";
import { isShowcase } from "@/showcase/flag";
import { ledgerFromCookie } from "@/showcase/store";

/** /console opens the signed-in user's active event, or their first one. The event layout checks membership. */
export default async function ConsoleIndex() {
  if (isShowcase()) {
    // One recorded event, and the persona chosen in this browser.
    const l = ledgerFromCookie((await headers()).get("cookie") ?? undefined);
    redirect(l.persona ? `/console/${WORLD.eventId}` : "/login?next=/console");
  }
  const info = await getSessionInfo(await headers());
  // Signed out (a demo:reset ends every session): sign in again, then come back here.
  if (!info) redirect("/login?next=/console");
  const eventId =
    info.activeEventId ??
    (
      await db
        .select({ eventId: memberships.eventId })
        .from(memberships)
        .where(eq(memberships.userId, info.userId))
        .limit(1)
    )[0]?.eventId;
  redirect(eventId ? `/console/${eventId}` : "/");
}
