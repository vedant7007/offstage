import { redirect } from "next/navigation";
import { PortalShell } from "@/components/attendee/portal-shell";
import { getMe } from "@/components/attendee/server";
import { getT } from "@/lib/i18n/server";

/** Every /me page needs a signed-in person; everyone else goes to the shared sign-in page. */
export default async function MeLayout({ children }: LayoutProps<"/me">) {
  const [me, t] = await Promise.all([getMe(), getT()]);
  if (!me) redirect("/login?next=/me");
  const active = me.memberships.find((m) => m.eventId === me.activeEventId) ?? me.memberships[0];
  return (
    <PortalShell title={active?.eventName ?? t("me.tabs.ticket")} tabs={["ticket", "schedule", "chat"]}>
      {children}
    </PortalShell>
  );
}
