"use client";

// Small motion helpers for the console: count-up numbers, a pointer spotlight on cards, and a kicker line.
// Everything here stands still under prefers-reduced-motion.

import * as React from "react";

/** Whether the viewer asked for less motion. */
export function useReducedMotion() {
  return React.useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(prefers-reduced-motion: reduce)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

const int = (n: number) => Math.round(n).toLocaleString("en-IN");

/** A number that counts up to its value (and eases to a new one). Shows the value at once with reduced motion. */
export function CountUp({
  to,
  format = int,
  className,
}: {
  to: number;
  format?: (n: number) => string;
  className?: string;
}) {
  const still = useReducedMotion();
  const [shown, setShown] = React.useState(0);
  const from = React.useRef(0);
  React.useEffect(() => {
    if (still) return;
    const a = from.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      const v = a + (to - a) * (1 - (1 - k) ** 3);
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, still]);
  return <span className={`tabular-nums ${className ?? ""}`}>{format(still ? to : shown)}</span>;
}

/**
 * Hover spotlight for an interactive card: a soft accent glow that follows the pointer, plus a 2px lift.
 * Spread `spotlight` on any element: `<li {...spotlight} className={cn(SPOT, ...)}>`.
 */
export const SPOT =
  "relative isolate transition-[translate,box-shadow,border-color] duration-300 ease-[cubic-bezier(.4,0,.1,1)] " +
  "hover:border-border-strong hover:shadow-[0_18px_40px_-24px_rgb(7_27_223/0.35)] motion-safe:hover:-translate-y-0.5 " +
  "before:pointer-events-none before:absolute before:inset-0 before:-z-10 before:rounded-[inherit] before:opacity-0 " +
  "before:transition-opacity before:duration-300 hover:before:opacity-100 " +
  "before:bg-[radial-gradient(260px_circle_at_var(--mx,50%)_var(--my,50%),color-mix(in_srgb,var(--curtain)_12%,transparent),transparent_70%)]";

export const spotlight = {
  onPointerMove(e: React.PointerEvent<HTMLElement>) {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  },
};

/** Mono, uppercase label above a heading, with a short rule after it. */
export function Kicker({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`kicker inline-flex items-center gap-2 text-curtain-text after:h-px after:w-8 after:bg-current ${className ?? ""}`}
    >
      {children}
    </span>
  );
}
