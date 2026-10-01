"use client";

import { useSyncExternalStore } from "react";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";

const KEY = "offstage.showcase.banner.dismissed";
const CONTACT = "mailto:vedantidlgave16@gmail.com?subject=OFFSTAGE%20enquiry";

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}
function readDismissed(): boolean {
  try {
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
// Kept in memory too, so dismissing still works when storage is blocked.
let dismissedInMemory = false;
function dismiss() {
  dismissedInMemory = true;
  try {
    window.sessionStorage.setItem(KEY, "1");
  } catch {
    // Storage blocked: the in-memory flag keeps it hidden until reload.
  }
  listeners.forEach((cb) => cb());
}

/**
 * Slim showcase notice above every app screen. In the page flow (never fixed), so it pushes
 * content down instead of covering controls. The landing page has its own notice.
 */
export function ShowcaseBanner() {
  const pathname = usePathname();
  const dismissed = useSyncExternalStore(
    subscribe,
    () => dismissedInMemory || readDismissed(),
    () => false,
  );
  if (dismissed || pathname === "/") return null;

  return (
    <aside
      aria-label="Showcase notice"
      className="flex items-center gap-2 border-b border-border bg-info-soft px-4 py-1 text-sm text-info-soft-fg"
    >
      <p className="min-w-0 flex-1 py-1.5">
        Showcase demo · simulated data, no real messages sent ·{" "}
        <a
          href={CONTACT}
          className="font-medium underline underline-offset-2 hover:decoration-2 focus-visible:rounded-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          Contact us
        </a>
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss showcase notice"
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-full hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:size-8"
      >
        <X className="size-4" aria-hidden="true" />
      </button>
    </aside>
  );
}
