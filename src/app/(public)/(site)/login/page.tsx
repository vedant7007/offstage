import type { Metadata } from "next";
import { LoginForm } from "@/components/attendee/login-form";
import { safeNext } from "@/components/attendee/next-path";
import { DEMO_EVENT_SLUG } from "@/components/public/links";
import { TextReveal } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import styles from "./login.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("login.title"), robots: { index: false } };
}

/** Shared sign-in for attendees, crew and organisers. Other areas redirect here with ?next=. */
export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const [t, query] = await Promise.all([getT(), searchParams]);
  const next = safeNext(Array.isArray(query.next) ? query.next[0] : query.next);
  const demoMode = process.env.DEMO_MODE === "true";
  return (
    <div className={styles.split}>
      <div className={styles.stage}>
        <div aria-hidden className={styles.spot} />
        <div aria-hidden className={styles.valance} />
        <div aria-hidden className={styles.curtain} />
        <div lang="en" className={styles.copy}>
          <p className={`kicker ${styles.kicker}`}>Backstage pass</p>
          <p className={styles.line}>
            <TextReveal as="span" text="The show is on." className="block" />{" "}
            <TextReveal as="span" text="Take your place." className={`block ${styles.accent}`} />
          </p>
          <p className={styles.lede}>
            One sign-in for the whole crew: event heads, volunteers and attendees.
          </p>
        </div>
      </div>

      <div className={styles.side}>
        <div
          className={`${styles.card} edge rounded-card border border-border bg-surface-raised p-5 text-fg depth-3 sm:p-10`}
        >
          <header className="flex flex-col gap-3 pb-8">
            <h1 className="text-3xl font-medium md:text-4xl">{t("login.title")}</h1>
            {/* In demo mode the form repeats this line beside the email field, where it belongs. */}
            {demoMode ? null : <p className="text-base text-fg-muted">{t("login.intro")}</p>}
          </header>
          <LoginForm
            next={next}
            demoMode={demoMode}
            demoEventSlug={DEMO_EVENT_SLUG}
            turnstileSiteKey={process.env.TURNSTILE_SITE_KEY || null}
          />
        </div>
      </div>
    </div>
  );
}
