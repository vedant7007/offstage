import { headers } from "next/headers";
import Link from "next/link";
import { Button, EmptyState, ThemeToggle } from "@/components/ui";
import { ConsoleShell } from "@/components/ui/console-shell";
import { EmergencyBanner } from "@/components/console/emergency-banner";
import { PersonaSwitcher } from "@/components/console/persona-switcher";
import { RealSendsBadge } from "@/components/console/real-sends";
import { VoiceDock } from "@/components/console/voice/voice-dock";
import { getSessionInfo, membershipFor } from "@/server/authz";

const demoMode = process.env.DEMO_MODE === "true" || process.env.DEMO_MODE === "1";
const mockApi = process.env.NEXT_PUBLIC_API_MOCK === "1" || process.env.NEXT_PUBLIC_API_MOCK === "true";

/** Console chrome. Only members of this event get in; every action still goes through the authorized API. */
export default async function ConsoleLayout({ children, params }: LayoutProps<"/console/[eventId]">) {
  const { eventId } = await params;
  let role: string | null = null;
  if (!mockApi) {
    const info = await getSessionInfo(await headers());
    const member = info ? await membershipFor(info.userId, eventId) : null;
    role = member?.role ?? null;
    if (!member)
      return (
        <main id="main" className="mx-auto max-w-lg px-4 py-16">
          <EmptyState
            title={info ? "You are not part of this event" : "Sign in to open the console"}
            description={info ? "Ask the event owner to add you." : "The console is for the event team."}
            action={
              <Button asChild>
                <Link href="/">Back to OFFSTAGE</Link>
              </Button>
            }
          />
        </main>
      );
  }
  return (
    <ConsoleShell
      eventId={eventId}
      actions={
        <div className="flex items-center gap-2">
          {demoMode ? <RealSendsBadge eventId={eventId} /> : null}
          {demoMode && role ? <PersonaSwitcher role={role} /> : null}
          <ThemeToggle />
        </div>
      }
    >
      <EmergencyBanner eventId={eventId} />
      {children}
      {role && role !== "viewer" && role !== "sponsor" ? <VoiceDock eventId={eventId} /> : null}
    </ConsoleShell>
  );
}
