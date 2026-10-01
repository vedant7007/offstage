import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { LanguageSwitcher, ThemeToggle } from "@/components/ui";
import { getT } from "@/lib/i18n/server";
import { CONSOLE_PATH, DEMO_EVENT_SLUG, eventPath } from "./links";

const navLink =
  "hidden min-h-11 items-center rounded-full px-3 font-mono text-xs font-medium tracking-[0.12em] text-fg-muted uppercase transition-colors duration-(--duration-fast) ease-out hover:text-fg md:flex";

/** Wordmark with the lime cue dot. Shared by the header and footer. */
export function Wordmark() {
  return (
    <>
      <span aria-hidden className="size-2.5 rounded-full bg-[#c1ff00] ring-1 ring-black/40" />
      OFFSTAGE
    </>
  );
}

/** Top bar for public pages: wordmark, mono nav, language, theme and the live demo pill. */
export async function SiteHeader() {
  const t = await getT();
  return (
    <header className="sticky top-0 z-(--z-appbar) border-b border-border bg-bg/90 backdrop-blur-sm">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
        <Link
          href="/"
          aria-label={t("site.home")}
          className="flex min-h-11 items-center gap-2.5 text-xl font-medium tracking-[-0.03em]"
        >
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1">
          <Link href={eventPath(DEMO_EVENT_SLUG)} className={navLink}>
            {t("landing.demoCta")}
          </Link>
          <Link href="/about-ai" className={navLink}>
            {t("site.aboutAi")}
          </Link>
          <LanguageSwitcher />
          <ThemeToggle />
          <Link
            href={CONSOLE_PATH}
            className="ml-1 hidden min-h-11 items-center gap-1.5 rounded-full bg-curtain px-4 text-sm font-medium text-on-curtain transition-[background-color,transform] duration-(--duration-slow) ease-out hover:-translate-y-0.5 hover:bg-curtain-hover sm:inline-flex"
          >
            Enter live demo
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
        </nav>
      </div>
    </header>
  );
}
