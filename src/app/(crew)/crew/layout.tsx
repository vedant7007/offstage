import { redirect } from "next/navigation";
import { House, ScanLine } from "lucide-react";
import { getMe } from "@/components/attendee/server";
import { AppShell, LanguageSwitcher, ThemeToggle } from "@/components/ui";
import { SignOutButton } from "@/components/ui/shell-bits";

/** The crew app is for signed-in volunteers and staff; the check-in API checks the scan permission. */
export default async function CrewLayout({ children }: LayoutProps<"/crew">) {
  const me = await getMe();
  if (!me) redirect("/login?next=/crew");
  return (
    <AppShell
      title={
        <>
          OFFSTAGE <span className="kicker align-middle text-fg-muted">Crew</span>
        </>
      }
      homeHref="/crew"
      nav={[
        { href: "/crew", label: "Home", icon: <House aria-hidden />, exact: true },
        { href: "/crew/checkin", label: "Check-in", icon: <ScanLine aria-hidden /> },
      ]}
      actions={
        <>
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <ThemeToggle />
          <SignOutButton />
        </>
      }
    >
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4">{children}</div>
    </AppShell>
  );
}
