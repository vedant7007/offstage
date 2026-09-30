import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships } from "@/db/schema";
import { getSessionInfo } from "@/server/authz";

/** /console opens the signed-in user's active event, or their first one. The event layout checks membership. */
export default async function ConsoleIndex() {
  const info = await getSessionInfo(await headers());
  if (!info) redirect("/");
  const eventId =
    info.activeEventId ??
    (
      await db
        .select({ eventId: memberships.eventId })
        .from(memberships)
        .where(eq(memberships.userId, info.userId))
        .limit(1)
    )[0]?.eventId;
  redirect(eventId ? `/console/${eventId}/approvals` : "/");
}
