"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUpRight, LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { IconButton } from "./button";
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

/** A header that sits flush over the page at the top and turns solid, with a hairline, once you scroll. */
function ScrollHeader({ className, children }: { className?: string; children: React.ReactNode }) {
  const scrolled = useScrolled();
  return (
    <header
      data-scrolled={scrolled || undefined}
      className={cn(
        "border-b border-transparent transition-[background-color,border-color,box-shadow] duration-(--duration-slow) ease-out",
        "data-scrolled:border-border data-scrolled:bg-bg/80 data-scrolled:backdrop-blur-md data-scrolled:backdrop-saturate-150",
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
  "flex min-h-14 items-center justify-between rounded-[0.875rem] px-4 text-lg font-medium tracking-[-0.02em] transition-colors duration-(--duration-fast) ease-out hover:bg-surface-sunken";

/** Public site menu on phones: the header links, the language picker and the live demo. */
function SiteMenu({
  links,
  cta,
}: {
  links: { href: string; label: string }[];
  cta: { href: string; label: string };
}) {
  const t = useT();
  return (
    <Sheet>
      <SheetTrigger asChild>
        <IconButton label={t("nav.menu")} icon={<Menu aria-hidden />} className="md:hidden" />
      </SheetTrigger>
      <SheetContent side="bottom" title="OFFSTAGE">
        <nav aria-label={t("nav.main")} className="flex flex-col gap-1">
          {links.map((l) => (
            <SheetClose asChild key={l.href}>
              <Link href={l.href} className={menuRow}>
                {l.label}
                <ArrowUpRight aria-hidden className="size-5 text-fg-muted" />
              </Link>
            </SheetClose>
          ))}
        </nav>
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
          <LanguageSwitcher className="[&_select]:w-full" />
          <SheetClose asChild>
            <Link
              href={cta.href}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-curtain px-6 text-base font-medium text-on-curtain transition-colors duration-(--duration-slow) ease-out hover:bg-curtain-hover"
            >
              {cta.label}
              <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          </SheetClose>
        </div>
      </SheetContent>
    </Sheet>
  );
}

export { ScrollHeader, SignOutButton, SiteMenu, useScrolled };
