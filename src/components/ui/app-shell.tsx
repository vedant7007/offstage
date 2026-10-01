"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Ellipsis, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { ScrollHeader } from "./shell-bits";
import { Sheet, SheetClose, SheetContent, SheetTrigger } from "./sheet";
import { Tooltip } from "./tooltip";

export type NavItem = {
  href: string;
  label: string;
  /** An icon element, such as <Ticket />. Elements (not components) so server pages can pass them. */
  icon: React.ReactNode;
  /** Small count shown on the tab, such as pending syncs. */
  badge?: number;
  /** Active only on this exact path, not its children. Use for a section's home tab, such as /me. */
  exact?: boolean;
  /** Sidebar section heading, such as "Run the show". Consecutive items with the same group share it. */
  group?: string;
};

type AppShellProps = {
  title: React.ReactNode;
  homeHref?: string;
  /** Sidebar from md up. Bottom tab bar on phones: five fit, beyond that the rest move into a More sheet. */
  nav: NavItem[];
  /** Right side of the top bar: ThemeToggle, LanguageSwitcher, account. */
  actions?: React.ReactNode;
  /** Optional live status shown in the top bar, such as a connection pill. */
  status?: React.ReactNode;
  children: React.ReactNode;
  /** Design review page only: renders inside another page without its own main landmark or skip link. */
  preview?: boolean;
};

function isActive(pathname: string, item: NavItem) {
  return pathname === item.href || (!item.exact && pathname.startsWith(`${item.href}/`));
}

// Collapsed sidebar, remembered per browser. Storage can throw (private mode, blocked site data).
const COLLAPSE_KEY = "offstage:sidebar-collapsed";
const collapseListeners = new Set<() => void>();
function readCollapsed() {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === "1";
  } catch {
    return false;
  }
}
function writeCollapsed(value: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, value ? "1" : "0");
  } catch {
    // Not remembered, still toggles for this page view below.
  }
  memoryCollapsed = value;
  collapseListeners.forEach((l) => l());
}
let memoryCollapsed: boolean | null = null;
function subscribeCollapsed(onChange: () => void) {
  collapseListeners.add(onChange);
  return () => {
    collapseListeners.delete(onChange);
  };
}

/** Slides one highlight to whichever item is marked data-active. Runs after every render; it is cheap. */
function useIndicator(axis: "x" | "y") {
  const list = React.useRef<HTMLDivElement>(null);
  const bar = React.useRef<HTMLSpanElement>(null);
  React.useLayoutEffect(() => {
    const l = list.current;
    const b = bar.current;
    if (!l || !b) return;
    const place = () => {
      const active = l.querySelector<HTMLElement>('[data-active="true"]');
      if (!active) {
        b.style.opacity = "0";
        return;
      }
      b.style.opacity = "1";
      if (axis === "y") {
        b.style.height = `${active.offsetHeight}px`;
        b.style.transform = `translateY(${active.offsetTop}px)`;
      } else {
        b.style.transform = `translateX(${active.offsetLeft + (active.offsetWidth - b.offsetWidth) / 2}px)`;
      }
      // The first placement jumps; later moves slide.
      requestAnimationFrame(() => (b.dataset.ready = "true"));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(l);
    return () => observer.disconnect();
  });
  return { list, bar };
}

function Badge({ count, compact }: { count: number; compact?: boolean }) {
  return (
    <span
      className={cn(
        "rounded-full bg-curtain font-mono text-xs leading-5 font-medium tabular-nums text-on-curtain",
        compact ? "absolute -top-1 right-0 min-w-5 px-1 text-center" : "ml-auto px-2",
      )}
    >
      {count}
    </span>
  );
}

function AppShell({ title, homeHref = "/", nav, actions, status, children, preview = false }: AppShellProps) {
  const t = useT();
  const pathname = usePathname();
  const Main = preview ? "div" : "main";
  const navLabel = preview ? t("nav.sections") : t("nav.main");
  const collapsed = React.useSyncExternalStore(
    subscribeCollapsed,
    () => memoryCollapsed ?? readCollapsed(),
    () => false,
  );
  const { list: sideListRef, bar: sideBarRef } = useIndicator("y");
  const { list: tabListRef, bar: tabBarRef } = useIndicator("x");

  const hasSidebar = nav.length > 0;
  const hasTabs = nav.length > 1;
  const overflow = nav.length > 5;
  const primary = overflow ? nav.slice(0, 4) : nav;
  const more = overflow ? nav.slice(4) : [];
  const current = nav.find((item) => isActive(pathname, item));
  const moreActive = more.some((item) => isActive(pathname, item));

  const brand = (
    <Link
      href={homeHref}
      className="flex min-h-11 min-w-0 items-center gap-2.5 text-lg font-medium tracking-[-0.03em]"
    >
      <span aria-hidden className="size-2.5 shrink-0 rounded-full bg-curtain" />
      <span className={cn("truncate", hasSidebar && collapsed && "md:sr-only")}>{title}</span>
    </Link>
  );

  const sideLink = (item: NavItem) => {
    const active = isActive(pathname, item);
    const link = (
      <Link
        key={item.href}
        href={item.href}
        data-active={active}
        aria-current={active ? "page" : undefined}
        className={cn(
          "relative z-10 flex min-h-11 items-center gap-3 rounded-full px-3.5 text-[0.9375rem] [&_svg]:size-[1.125rem] [&_svg]:shrink-0",
          "transition-colors duration-(--duration-fast) ease-out",
          active
            ? "font-medium text-fg [&_svg]:text-curtain-text"
            : "text-fg-muted hover:bg-surface-sunken/70 hover:text-fg",
          collapsed && "justify-center px-0",
        )}
      >
        {item.icon}
        <span className={cn("truncate", collapsed && "sr-only")}>{item.label}</span>
        {item.badge ? <Badge count={item.badge} compact={collapsed} /> : null}
      </Link>
    );
    return collapsed ? (
      <Tooltip key={item.href} content={item.label} side="right">
        {link}
      </Tooltip>
    ) : (
      link
    );
  };

  // Sidebar sections: consecutive items that share a group sit under one heading.
  const groups: { label?: string; items: NavItem[] }[] = [];
  for (const item of nav) {
    const last = groups[groups.length - 1];
    if (last && last.label === item.group) last.items.push(item);
    else groups.push({ label: item.group, items: [item] });
  }

  const tabClass = (active: boolean) =>
    cn(
      "relative z-10 flex flex-1 flex-col items-center gap-1 px-1 pt-2 pb-2 text-[0.6875rem] leading-4 [&_svg]:size-5 [&_svg]:shrink-0",
      "transition-colors duration-(--duration-fast) ease-out",
      active ? "font-medium text-fg [&_svg]:text-curtain-soft-fg" : "text-fg-muted hover:text-fg",
    );

  const tabLink = (item: NavItem) => {
    const active = isActive(pathname, item);
    return (
      <Link
        key={item.href}
        href={item.href}
        data-active={active}
        aria-current={active ? "page" : undefined}
        className={tabClass(active)}
      >
        <span aria-hidden className="relative flex h-8 w-14 items-center justify-center">
          {item.icon}
          {item.badge ? <Badge count={item.badge} compact /> : null}
        </span>
        <span className="max-w-full truncate">{item.label}</span>
      </Link>
    );
  };

  return (
    <div
      className={cn(
        "relative isolate flex min-h-dvh",
        // Height of the phone tab bar, so pages and floating docks can clear it: var(--shell-bottom).
        hasTabs
          ? "[--shell-bottom:calc(4.375rem+env(safe-area-inset-bottom))] md:[--shell-bottom:0px]"
          : "[--shell-bottom:0px]",
        preview && "min-h-full",
      )}
    >
      <div aria-hidden className={cn("shell-backdrop", preview ? "absolute" : "fixed")} />
      {preview ? null : (
        <a
          href="#main"
          className="sr-only z-(--z-toast) rounded-full bg-surface-raised px-5 py-3 font-medium shadow-card focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
        >
          {t("common.skipToContent")}
        </a>
      )}

      {hasSidebar ? (
        <div
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-border bg-surface/55 backdrop-blur-sm md:flex",
            "transition-[width] duration-(--duration-slower) ease-out",
            collapsed ? "w-[4.75rem]" : "w-64",
            preview && "h-auto",
          )}
        >
          <div className={cn("flex h-16 shrink-0 items-center px-5", collapsed && "justify-center px-0")}>
            {brand}
          </div>
          <nav aria-label={navLabel} className="flex-1 overflow-x-hidden overflow-y-auto px-3 pb-3">
            <div ref={sideListRef} className="relative flex flex-col">
              <span
                ref={sideBarRef}
                aria-hidden
                className="absolute inset-x-0 top-0 rounded-full bg-surface-raised opacity-0 shadow-card ring-1 ring-border data-ready:transition-[transform,height,opacity] data-ready:duration-(--duration-slower) data-ready:ease-out"
              />
              {groups.map((group, i) => (
                <div key={`${group.label ?? ""}-${i}`} className="flex flex-col gap-0.5">
                  {group.label && !collapsed ? (
                    <p className="kicker px-3.5 pt-5 pb-2 text-fg-muted">{group.label}</p>
                  ) : i > 0 ? (
                    <span aria-hidden className="mx-3 my-3 h-px bg-border" />
                  ) : null}
                  {group.items.map(sideLink)}
                </div>
              ))}
            </div>
          </nav>
          {preview ? null : (
            <div className={cn("shrink-0 border-t border-border p-3", collapsed && "flex justify-center")}>
              <button
                type="button"
                aria-expanded={!collapsed}
                onClick={() => writeCollapsed(!collapsed)}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-full px-3.5 text-sm text-fg-muted transition-colors duration-(--duration-fast) ease-out hover:bg-surface-sunken/70 hover:text-fg [&_svg]:size-[1.125rem]",
                  collapsed ? "w-11 justify-center px-0" : "w-full",
                )}
              >
                {collapsed ? <PanelLeftOpen aria-hidden /> : <PanelLeftClose aria-hidden />}
                <span className={cn(collapsed && "sr-only")}>
                  {collapsed ? "Expand menu" : "Collapse menu"}
                </span>
              </button>
            </div>
          )}
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <ScrollHeader className="sticky top-0 z-(--z-appbar) pt-[env(safe-area-inset-top)]">
          <div className="flex min-h-14 items-center justify-between gap-3 px-4 md:min-h-16 md:px-8">
            <div className={cn("min-w-0", hasSidebar && "md:hidden")}>{brand}</div>
            {hasSidebar ? (
              <p className="hidden min-w-0 items-center gap-2 truncate text-[0.9375rem] md:flex">
                {current?.group ? (
                  <>
                    <span className="text-fg-muted">{current.group}</span>
                    <span aria-hidden className="text-border-strong">
                      /
                    </span>
                  </>
                ) : null}
                <span className="font-medium">{current?.label ?? title}</span>
              </p>
            ) : null}
            <div className="flex shrink-0 items-center gap-1">
              {status ? <div className="hidden sm:flex">{status}</div> : null}
              {actions}
            </div>
          </div>
        </ScrollHeader>

        <Main
          id={preview ? undefined : "main"}
          tabIndex={preview ? undefined : -1}
          data-shell-main
          className={cn(
            "min-w-0 flex-1 px-4 pt-4 pb-[calc(var(--shell-bottom)+2.5rem)] outline-none md:px-8 md:pt-6 md:pb-12",
          )}
        >
          {children}
        </Main>
      </div>

      {hasTabs ? (
        <nav
          aria-label={navLabel}
          className={cn(
            "z-(--z-appbar) border-t border-border bg-bg/85 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl backdrop-saturate-150 md:hidden",
            preview ? "absolute inset-x-0 bottom-0" : "fixed inset-x-0 bottom-0",
          )}
        >
          <div ref={tabListRef} className="relative flex">
            <span
              ref={tabBarRef}
              aria-hidden
              className="absolute top-2 left-0 h-8 w-14 rounded-full bg-curtain-soft opacity-0 data-ready:transition-[transform,opacity] data-ready:duration-(--duration-slower) data-ready:ease-out"
            />
            {primary.map(tabLink)}
            {overflow ? (
              <Sheet>
                <SheetTrigger asChild>
                  <button type="button" data-active={moreActive} className={tabClass(moreActive)}>
                    <span aria-hidden className="flex h-8 w-14 items-center justify-center">
                      <Ellipsis />
                    </span>
                    <span>{t("common.more")}</span>
                  </button>
                </SheetTrigger>
                <SheetContent side="bottom" title={t("common.more")}>
                  <nav aria-label={t("common.more")} className="flex flex-col gap-1">
                    {more.map((item) => {
                      const active = isActive(pathname, item);
                      return (
                        <SheetClose asChild key={item.href}>
                          <Link
                            href={item.href}
                            aria-current={active ? "page" : undefined}
                            className={cn(
                              "flex min-h-14 items-center gap-4 rounded-[0.875rem] px-4 text-base [&_svg]:size-5 [&_svg]:shrink-0",
                              "transition-colors duration-(--duration-fast) ease-out",
                              active
                                ? "bg-curtain-soft font-medium text-curtain-soft-fg"
                                : "text-fg hover:bg-surface-sunken",
                            )}
                          >
                            {item.icon}
                            <span className="flex-1">{item.label}</span>
                            {item.group ? <span className="kicker text-fg-muted">{item.group}</span> : null}
                            {item.badge ? <Badge count={item.badge} /> : null}
                          </Link>
                        </SheetClose>
                      );
                    })}
                  </nav>
                </SheetContent>
              </Sheet>
            ) : null}
          </div>
        </nav>
      ) : null}
    </div>
  );
}

export { AppShell };
