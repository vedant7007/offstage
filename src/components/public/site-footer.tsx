import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { CONTACT_MAILTO, DEMO_EVENT_SLUG, LOGIN_PATH, REPO_URL, eventPath } from "./links";
import { Wordmark } from "./site-header";

const link =
  "inline-flex min-h-11 items-center font-mono text-xs font-medium tracking-[0.12em] uppercase underline-offset-4 hover:text-curtain-text hover:underline";

/** Ink band in both themes: the law of the system in mono, then the ways into the product. */
export async function SiteFooter() {
  const t = await getT();
  return (
    <footer className="dark mt-24 bg-bg text-fg">
      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-12 md:px-8">
        <p className="kicker text-curtain-text">{t("site.law")}</p>
        <div className="flex flex-col gap-4 border-t border-border pt-6 md:flex-row md:items-center md:justify-between">
          <p className="flex items-center gap-2.5 text-lg font-medium tracking-[-0.03em]">
            <Wordmark />
          </p>
          <ul className="flex flex-wrap gap-x-6 text-fg-muted">
            <li>
              <Link href={LOGIN_PATH} className={link}>
                {t("site.demo")}
              </Link>
            </li>
            <li>
              <Link href={eventPath(DEMO_EVENT_SLUG)} className={link}>
                {t("landing.demoCta")}
              </Link>
            </li>
            <li>
              <Link href="/about-ai" className={link}>
                {t("site.aboutAi")}
              </Link>
            </li>
            <li>
              <a href={CONTACT_MAILTO} className={link}>
                {t("site.contact")}
              </a>
            </li>
            <li>
              <a href={REPO_URL} className={link} target="_blank" rel="noopener noreferrer">
                {t("site.github")}
              </a>
            </li>
          </ul>
        </div>
      </div>
    </footer>
  );
}
