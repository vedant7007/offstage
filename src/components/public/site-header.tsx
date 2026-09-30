import Link from "next/link";
import { LanguageSwitcher, ThemeToggle } from "@/components/ui";
import { getT } from "@/lib/i18n/server";

/** Top bar for public pages: wordmark, About link, language and theme. */
export async function SiteHeader() {
  const t = await getT();
  return (
    <header className="border-b border-border">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
        <Link
          href="/"
          aria-label={t("site.home")}
          className="flex min-h-11 items-center gap-2 font-display text-xl font-bold"
        >
          <svg viewBox="0 0 24 24" aria-hidden className="size-6">
            <rect x="3" y="3" width="18" height="3" rx="1.5" className="fill-fg" />
            <line x1="12" y1="6" x2="12" y2="13" strokeWidth="1.5" className="stroke-fg-muted" />
            <circle cx="12" cy="16" r="4" className="fill-curtain" />
          </svg>
          Sutradhar
        </Link>
        <nav className="flex items-center gap-1">
          <Link
            href="/about-ai"
            className="hidden min-h-11 items-center rounded-control px-3 text-sm font-medium text-fg-muted hover:text-fg sm:flex"
          >
            {t("site.aboutAi")}
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}
