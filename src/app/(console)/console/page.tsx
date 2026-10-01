import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships } from "@/db/schema";
import { getSessionInfo } from "@/server/authz";
import { WORLD } from "@/showcase/data";
import { isShowcase } from "@/showcase/flag";
import { PersonaLogin } from "@/showcase/persona-login";
import { ledgerFromCookie } from "@/showcase/store";

/** /console opens the signed-in user's active event, or their first one. The event layout checks membership. */
export default async function ConsoleIndex() {
  if (isShowcase()) {
    // One recorded event. Before a persona is chosen, choose one here.
    const l = ledgerFromCookie((await headers()).get("cookie") ?? undefined);
    if (l.persona) redirect(`/console/${WORLD.eventId}`);
    return (
      <main id="main" className="mx-auto flex max-w-xl flex-col gap-8 px-4 py-12 md:py-16">
        <h1 className="text-3xl font-medium md:text-4xl">Open the console</h1>
        <PersonaLogin next="/console" eventId={WORLD.eventId} />
      </main>
    );
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
