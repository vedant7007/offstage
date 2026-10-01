"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUpRight, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { IconButton, buttonVariants } from "./button";
import { LanguageSwitcher } from "./language-switcher";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "./sheet";

function subscribeScroll(onChange: () => void) {
  window.addEventListener("scroll", onChange, { passive: true });
  return () => window.removeEventListener("scroll", onChange);
}

/** True once the page has scrolled away from the top. False on the server. */
function useScrolled() {
  return React.useSyncExternalStore(
    subscribeScroll,
    () => window.scrollY > 4,
    () => false,
  );
}

/**
 * A header that sits flush over the page at the top and, once you scroll, turns to frosted glass with a
 * hairline. It owns the one backdrop-filter on the screen. Only colours fade; the blur switches on.
 */
function ScrollHeader({
  className,
  style,
  children,
}: {
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const scrolled = useScrolled();
  return (
    <header
      data-scrolled={scrolled || undefined}
      style={style}
      className={cn(
        "border-b border-transparent transition-[background-color,border-color] duration-(--duration-base) ease-out",
        "data-scrolled:border-border data-scrolled:bg-bg/80 data-scrolled:backdrop-blur-md data-scrolled:backdrop-saturate-[1.4]",
        className,
      )}
    >
      {children}
    </header>
  );
}

/** Signs out and returns to the shared sign-in page. In demo mode it first resets the demo data (404 otherwise). */
function SignOutButton() {
  const t = useT();
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const signOut = async () => {
    setBusy(true);
    await fetch("/api/demo/reset", { method: "POST", credentials: "include" }).catch(() => undefined);
    await fetch("/api/auth/sign-out", { method: "POST", credentials: "include" }).catch(() => undefined);
    router.replace("/login");
    router.refresh();
  };
  return (
    <IconButton
      label={t("me.signOut")}
      icon={<LogOut aria-hidden />}
      disabled={busy}
      aria-busy={busy}
      onClick={() => void signOut()}
    />
  );
}

const menuRow =
  "flex min-h-14 items-center justify-between rounded-inner px-4 text-lg font-medium tracking-[-0.02em] transition-colors duration-(--duration-fast) ease-out hover:bg-surface-sunken";

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Public header links from md up. The current page reads in full ink with a short curtain rule under it;
 * the others are muted until hovered.
 */
function SiteNavLinks({ links }: { links: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return links.map((l) => {
    const current = isCurrent(pathname, l.href);
    return (
      <Link
        key={l.href}
        href={l.href}
        aria-current={current ? "page" : undefined}
        className={cn(
          "relative hidden min-h-11 items-center rounded-full px-3 font-mono text-xs font-medium tracking-[0.12em] uppercase transition-colors duration-(--duration-fast) ease-out md:flex",
          "after:absolute after:inset-x-3 after:bottom-2 after:h-px after:origin-left after:bg-curtain-text after:transition-[scale] after:duration-(--duration-slow) after:ease-(--ease-out-expo)",
          current
            ? "text-fg after:scale-x-100"
            : "text-fg-muted after:scale-x-0 hover:text-fg hover:after:scale-x-100",
        )}
      >
        {l.label}
      </Link>
    );
  });
}

/** Public site menu on phones: the header links, the language picker and the live demo. */
function SiteMenu({
  links,
  cta,
}: {
  links: { href: string; label: string }[];
  cta: { href: string; label: string };
}) {
  const t = useT();
  const pathname = usePathname();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <IconButton label={t("nav.menu")} icon={<Menu aria-hidden />} className="md:hidden" />
      </SheetTrigger>
      <SheetContent side="bottom" title="OFFSTAGE">
        <nav aria-label={t("nav.main")} className="flex flex-col gap-1">
          {links.map((l) => (
            <SheetClose asChild key={l.href}>
              <Link
                href={l.href}
                className={menuRow}
                aria-current={pathname && isCurrent(pathname, l.href) ? "page" : undefined}
              >
                {l.label}
                <ArrowUpRight aria-hidden className="size-5 text-fg-muted" />
              </Link>
            </SheetClose>
          ))}
        </nav>
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <LanguageSwitcher className="[&_select]:w-full" />
          <SheetClose asChild>
            <Link href={cta.href} className={cn(buttonVariants({ size: "lg" }), "text-base")}>
              {cta.label}
              <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { ScrollHeader, SignOutButton, SiteMenu, SiteNavLinks, useScrolled };
