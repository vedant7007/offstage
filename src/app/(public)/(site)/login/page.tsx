import type { Metadata } from "next";
import { PageHeader } from "@/components/ui";
import { LoginForm } from "@/components/attendee/login-form";
import { safeNext } from "@/components/attendee/next-path";
import { DEMO_EVENT_SLUG } from "@/components/public/links";
import { getT } from "@/lib/i18n/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("login.title"), robots: { index: false } };
}

/** Shared sign-in for attendees, crew and organisers. Other areas redirect here with ?next=. */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [t, query] = await Promise.all([getT(), searchParams]);
  const next = safeNext(Array.isArray(query.next) ? query.next[0] : query.next);
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 pt-10 md:px-8">
      <PageHeader title={t("login.title")} description={t("login.intro")} />
      <LoginForm
        next={next}
        demoMode={process.env.DEMO_MODE === "true"}
        demoEventSlug={DEMO_EVENT_SLUG}
        turnstileSiteKey={process.env.TURNSTILE_SITE_KEY || null}
      />
    </div>
  );
}
