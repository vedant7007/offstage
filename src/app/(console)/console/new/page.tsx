import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import { AppShell, ThemeToggle } from "@/components/ui";
import { IntakeChat } from "@/components/console/intake-chat";
import { getSessionInfo } from "@/server/authz";

export default async function NewEventPage() {
  if (!(await getSessionInfo(await headers()))) redirect("/login?next=/console/new");
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
