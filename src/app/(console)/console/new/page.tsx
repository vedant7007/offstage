import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppShell, ThemeToggle } from "@/components/ui";
import { IntakeChat } from "@/components/console/intake-chat";
import { getSessionInfo } from "@/server/authz";

export default async function NewEventPage() {
  if (!(await getSessionInfo(await headers()))) redirect("/login?next=/console/new");
  return (
    <AppShell title="OFFSTAGE console" homeHref="/console" nav={[]} actions={<ThemeToggle />}>
      <IntakeChat />
    </AppShell>
  );
}
