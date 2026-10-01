import type { Metadata } from "next";
import { LoginForm } from "@/components/attendee/login-form";
import { safeNext } from "@/components/attendee/next-path";
import { DEMO_EVENT_SLUG } from "@/components/public/links";
import { getT } from "@/lib/i18n/server";
import styles from "./login.module.css";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("login.title"), robots: { index: false } };
}

const ROLES = [
  "Event head: run the console and approve what agents propose",
  "Volunteer: check people in at the gate from your phone",
  "Attendee: your ticket, schedule and answers with sources",
];

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
          <p className={`kicker ${styles.kicker} ${styles.reveal}`}>Backstage pass</p>
          <p className={`${styles.line} ${styles.reveal}`}>
            The show is on. <span className={styles.accent}>Take your place.</span>
          </p>
          <ul className={`${styles.bullets} ${styles.reveal} font-mono text-sm`}>
            {ROLES.map((role, i) => (
              <li key={role}>
                <span aria-hidden className={styles.num}>
                  0{i + 1}
                </span>
                <span>{role}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className={`${styles.side} bg-bg`}>
        <div
          className={`${styles.card} rounded-card border border-border bg-surface-raised p-6 text-fg sm:p-10`}
        >
          <header className="flex flex-col gap-2 pb-8">
            <h1 className={`${styles.title} text-3xl md:text-4xl`}>{t("login.title")}</h1>
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
