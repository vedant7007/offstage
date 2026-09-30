"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";

export type NavItem = {
  href: string;
  label: string;
  /** An icon element, such as <Ticket />. Elements (not components) so server pages can pass them. */
  icon: React.ReactNode;
  /** Small count shown on the tab, such as pending syncs. */
  badge?: number;
};

type AppShellProps = {
  title: React.ReactNode;
  homeHref?: string;
  /** Up to five items. Bottom tab bar on phones, sidebar from md up. */
  nav: NavItem[];
  /** Right side of the top bar: ThemeToggle, LanguageSwitcher, account. */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Design review page only: renders inside another page without its own main landmark or skip link. */
  preview?: boolean;
};

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function AppShell({ title, homeHref = "/", nav, actions, children, preview = false }: AppShellProps) {
  const t = useT();
  const pathname = usePathname();
  const Main = preview ? "div" : "main";

  const link = (item: NavItem, variant: "tab" | "side") => {
    const active = isActive(pathname, item.href);
    return (
      <Link
        key={item.href}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative flex items-center [&_svg]:size-5 [&_svg]:shrink-0",
          variant === "tab"
            ? "min-h-14 flex-1 flex-col justify-center gap-0.5 px-1 text-xs"
            : "min-h-11 gap-3 rounded-control px-3 text-base",
          active
            ? variant === "tab"
              ? "font-semibold text-curtain-text"
              : "bg-curtain-soft font-semibold text-curtain-soft-fg"
            : "text-fg-muted hover:text-fg",
          variant === "side" && !active && "hover:bg-surface-sunken",
        )}
      >
        {variant === "tab" && active ? (
          <span aria-hidden className="absolute top-0 h-0.5 w-8 rounded-full bg-curtain" />
        ) : null}
        {item.icon}
        <span className="truncate">{item.label}</span>
        {item.badge ? (
          <span
            className={cn(
              "rounded-full bg-curtain px-1.5 text-xs font-semibold tabular-nums text-on-curtain",
              variant === "tab" ? "absolute top-1.5 left-1/2 ml-2" : "ml-auto",
            )}
          >
            {item.badge}
          </span>
        ) : null}
      </Link>
    );
  };

  return (
    <div className="flex min-h-dvh flex-col">
      {preview ? null : (
        <a
          href="#main"
          className="sr-only z-(--z-toast) rounded-control bg-surface-raised px-4 py-3 font-medium focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {t("common.skipToContent")}
        </a>
      )}

      <header className="sticky top-0 z-(--z-appbar) border-b border-border bg-bg/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex min-h-14 items-center justify-between gap-3 px-4">
          <Link href={homeHref} className="min-w-0 truncate py-2 text-lg font-semibold">
            {title}
          </Link>
          {actions ? <div className="flex shrink-0 items-center gap-1">{actions}</div> : null}
        </div>
      </header>

      <div className="flex flex-1">
        <nav
          aria-label={preview ? t("nav.sections") : t("nav.main")}
          className="sticky top-14 hidden h-[calc(100dvh-3.5rem)] w-60 shrink-0 border-r border-border p-3 md:block"
        >
          <div className="flex flex-col gap-1">{nav.map((item) => link(item, "side"))}</div>
        </nav>

        <Main
          id={preview ? undefined : "main"}
          tabIndex={preview ? undefined : -1}
          className="min-w-0 flex-1 px-4 pt-6 pb-24 outline-none md:px-8 md:pb-10"
        >
          {children}
        </Main>
      </div>

      <nav
        aria-label={preview ? t("nav.sections") : t("nav.main")}
        className="fixed inset-x-0 bottom-0 z-(--z-appbar) border-t border-border bg-bg/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <div className="flex">{nav.map((item) => link(item, "tab"))}</div>
      </nav>
    </div>
  );
}

export { AppShell };
