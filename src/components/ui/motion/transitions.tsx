"use client";

import * as React from "react";
import { ViewTransition } from "react";

/** Pass to Link transitionTypes (or router.push options) for a directional slide. */
export const NAV_FORWARD = ["nav-forward"];
export const NAV_BACK = ["nav-back"];

const PAGE = { "nav-forward": "nav-forward", "nav-back": "nav-back", default: "page" };

/**
 * Route crossfade: the old page leaves in 120ms, the new one rises in over 240ms. Links tagged with
 * NAV_FORWARD or NAV_BACK slide sideways instead. Put it where a new instance mounts per route: at the
 * root of a page, or in a template.tsx. Refreshes of the same page never animate. Instant under reduced
 * motion. Never put an overlay inside it.
 */
function PageTransition({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <ViewTransition enter={PAGE} exit={PAGE} default="none">
      <div data-vt-page="" className={className}>
        {children}
      </div>
    </ViewTransition>
  );
}

/**
 * The active pill or underline that glides between items. Render it inside the active item only, with one
 * `name` per group (for example "nav-console" or a useId). It glides on route changes and on state set
 * inside startTransition; otherwise it jumps, which is fine. Decorative: aria-hidden.
 */
function SlidingIndicator({ name, className }: { name: string; className?: string }) {
  return (
    <ViewTransition name={name} share="indicator" default="none">
      <span aria-hidden className={className} />
    </ViewTransition>
  );
}

/**
 * Shared element morph between two routes, such as an approval card and the proposal header. Use the
 * same `name` (for example `proposal-${id}`) on both sides, one element per side.
 */
function Morph({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <ViewTransition name={name} share="morph" default="none">
      {children}
    </ViewTransition>
  );
}

export { PageTransition, SlidingIndicator, Morph };
