import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { LanguageSwitcher, ThemeToggle, buttonVariants, vtAnchor } from "@/components/ui";
import { ScrollHeader, SiteMenu, SiteNavLinks } from "@/components/ui/shell-bits";
import { cn } from "@/lib/utils";
import { getT } from "@/lib/i18n/server";
import { DEMO_EVENT_SLUG, LOGIN_PATH, eventPath } from "./links";

/** Wordmark with the lime cue dot. Shared by the header and footer. */
export function Wordmark() {
  return (
    <>
      <span aria-hidden className="size-2.5 rounded-full bg-[#c1ff00] ring-1 ring-black/40" />
      OFFSTAGE
    </>
  );
}

/**
 * Top bar for public pages: flush at the top, frosted with a hairline once the page scrolls. Anchored, so
 * it stays still while the page below cross-fades.
 */
export async function SiteHeader() {
  const t = await getT();
  const links = [
    { href: eventPath(DEMO_EVENT_SLUG), label: t("landing.demoCta") },
    { href: "/about-ai", label: t("site.aboutAi") },
  ];
  const cta = { href: LOGIN_PATH, label: t("site.demo") };
  return (
    <ScrollHeader {...vtAnchor("site-header")} className="sticky top-0 z-(--z-appbar)">
      <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-4 md:px-8">
        <Link
          href="/"
          aria-label={t("site.home")}
          className="flex min-h-11 items-center gap-2.5 text-xl font-medium tracking-[-0.03em]"
        >
          <Wordmark />
        </Link>
        <nav aria-label={t("nav.main")} className="flex items-center gap-1">
          <SiteNavLinks links={links} />
          <LanguageSwitcher className="hidden md:inline-flex" />
          <ThemeToggle />
          <Link
            href={cta.href}
            className={cn(
              buttonVariants({ size: "sm" }),
              "ml-1 hidden min-h-11 gap-1.5 sm:inline-flex md:min-h-11",
            )}
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
