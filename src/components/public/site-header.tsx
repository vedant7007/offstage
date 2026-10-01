import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { LanguageSwitcher, ThemeToggle } from "@/components/ui";
import { ScrollHeader, SiteMenu } from "@/components/ui/shell-bits";
import { getT } from "@/lib/i18n/server";
import { CONSOLE_PATH, DEMO_EVENT_SLUG, eventPath } from "./links";

const navLink =
  "relative hidden min-h-11 items-center rounded-full px-3 font-mono text-xs font-medium tracking-[0.12em] text-fg-muted uppercase transition-colors duration-(--duration-fast) ease-out hover:text-fg md:flex";

/** Wordmark with the lime cue dot. Shared by the header and footer. */
export function Wordmark() {
  return (
    <>
      <span aria-hidden className="size-2.5 rounded-full bg-[#c1ff00] ring-1 ring-black/40" />
      OFFSTAGE
    </>
  );
}

/** Top bar for public pages: flush at the top, solid with a hairline once the page scrolls. */
export async function SiteHeader() {
  const t = await getT();
  const links = [
    { href: eventPath(DEMO_EVENT_SLUG), label: t("landing.demoCta") },
    { href: "/about-ai", label: t("site.aboutAi") },
  ];
  const cta = { href: CONSOLE_PATH, label: "Enter live demo" };
  return (
    <ScrollHeader className="sticky top-0 z-(--z-appbar)">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
        <Link
          href="/"
          aria-label={t("site.home")}
          className="flex min-h-11 items-center gap-2.5 text-xl font-medium tracking-[-0.03em]"
        >
          <Wordmark />
        </Link>
        <nav aria-label={t("nav.main")} className="flex items-center gap-1">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className={navLink}>
              {l.label}
            </Link>
          ))}
          <LanguageSwitcher className="hidden md:inline-flex" />
          <ThemeToggle />
          <Link
            href={cta.href}
            className="ml-1 hidden min-h-11 items-center gap-1.5 rounded-full bg-curtain px-4 text-sm font-medium text-on-curtain transition-[background-color,transform] duration-(--duration-slow) ease-out hover:bg-curtain-hover motion-safe:hover:-translate-y-0.5 sm:inline-flex"
          >
            {cta.label}
            <ArrowUpRight aria-hidden className="size-4" />
          </Link>
          <SiteMenu links={links} cta={cta} />
        </nav>
      </div>
    </ScrollHeader>
  );
}
