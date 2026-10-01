"use client";

// Console motion helpers, now thin aliases over the shared premium kit (src/components/ui/motion), so the
// console and every other surface move the same way. Everything here stands still under reduced motion.

import * as React from "react";
import { NumberTicker, SkeletonCard, SkeletonText } from "@/components/ui/motion";

export { useReducedMotion, Kicker } from "@/components/ui/motion";

/** A number that counts up once when it scrolls into view, then eases to new values. */
export function CountUp({
  to,
  format,
  className,
}: {
  to: number;
  format?: (n: number) => string;
  className?: string;
}) {
  return <NumberTicker value={to} format={format} className={className} />;
}

/**
 * Hover spotlight for an interactive card: a soft accent glow and a lit border that follow the pointer,
 * plus a 2px lift. The app-wide PointerFx writes the cursor position, so no handlers are needed.
 */
export const SPOT = "spot spot-edge lift";

const bar = "rounded-full bg-[color-mix(in_srgb,var(--fg)_9%,transparent)]";

/**
 * Loading placeholder shaped like a console report page: the header, a row of stat tiles and two cards,
 * so nothing jumps when the numbers arrive.
 */
export function PageSkeleton({ tiles = 4 }: { tiles?: 3 | 4 }) {
  return (
    <div aria-busy className="flex flex-col gap-4">
      <div aria-hidden className="flex flex-col gap-3 pb-8">
        <span className={`h-3 w-32 ${bar}`} />
        <span className={`h-9 w-72 max-w-full ${bar}`} />
        <SkeletonText lines={2} className="w-[32rem] max-w-full" />
      </div>
      <div
        aria-hidden
        className={`grid grid-cols-2 gap-3 ${tiles === 3 ? "md:grid-cols-3" : "md:grid-cols-4"}`}
      >
        {Array.from({ length: tiles }, (_, i) => (
          <div
            key={i}
            className="flex h-28 flex-col justify-between rounded-card border border-border bg-surface p-4"
          >
            <span className={`h-9 w-16 ${bar}`} />
            <span className={`h-2.5 w-3/4 ${bar}`} />
          </div>
        ))}
      </div>
      <SkeletonCard />
      <SkeletonCard />
    </div>
  );
}
