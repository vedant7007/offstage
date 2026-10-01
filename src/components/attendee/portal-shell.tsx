"use client";

import * as React from "react";
import { CalendarDays, Ellipsis, MessageCircle, Ticket } from "lucide-react";
import { AppShell, LanguageSwitcher, ThemeToggle, type NavItem } from "@/components/ui";
import { SignOutButton } from "@/components/ui/shell-bits";
import { useT } from "@/lib/i18n/provider";

type Props = {
  title: string;
  /** Tabs that exist so far; the rest are added as their pages ship. */
  tabs: ("ticket" | "schedule" | "chat" | "more")[];
  children: React.ReactNode;
};

const ICONS = {
  ticket: <Ticket aria-hidden />,
  schedule: <CalendarDays aria-hidden />,
  chat: <MessageCircle aria-hidden />,
  more: <Ellipsis aria-hidden />,
};
const HREFS = { ticket: "/me", schedule: "/me/schedule", chat: "/me/chat", more: "/me/more" };

/** Attendee portal chrome: bottom tabs on phones (Ticket, Schedule, Chat, More), sidebar on desktop. */
export function PortalShell({ title, tabs, children }: Props) {
  const t = useT();
  const nav: NavItem[] = tabs.map((tab) => ({
    href: HREFS[tab],
    label: t(`me.tabs.${tab}`),
    icon: ICONS[tab],
    exact: tab === "ticket",
  }));

  return (
    <AppShell
      title={title}
      homeHref="/me"
      nav={nav}
      actions={
        <>
          <LanguageSwitcher className="hidden sm:inline-flex" />
          <ThemeToggle />
          <SignOutButton />
        </>
      }
    >
      {children}
    </AppShell>
  );
}
