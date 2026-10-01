import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { AppShell, ThemeToggle } from "@/components/ui";
import { IntakeChat } from "@/components/console/intake-chat";
import { getSessionInfo } from "@/server/authz";
import { isShowcase } from "@/showcase/flag";
import { ledgerFromCookie } from "@/showcase/store";

export default async function NewEventPage() {
  const h = await headers();
  const signedIn = isShowcase()
    ? !!ledgerFromCookie(h.get("cookie") ?? undefined).persona
    : !!(await getSessionInfo(h));
  if (!signedIn) redirect("/login?next=/console/new");
  return (
    <AppShell
      title="OFFSTAGE console"
      homeHref="/console"
      nav={[
        { href: "/console", label: "Back to the console", icon: <ArrowLeft aria-hidden />, exact: true },
        { href: "/console/new", label: "Plan a new event", icon: <Sparkles aria-hidden /> },
      ]}
      actions={<ThemeToggle />}
    >
      <IntakeChat />
    </AppShell>
  );
}
