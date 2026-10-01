"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { observeOnce } from "./observe";
import { useReducedMotion } from "./reduced-motion";

const inr = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });
const formatInt = (n: number) => inr.format(Math.round(n));
const DIGITS = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

type NumberTickerProps = {
  value: number;
  /** count: eases up from `from` when it enters view, then eases to new values (default).
      roll: odometer for live values; only the digits that change roll. */
  mode?: "count" | "roll";
  /** Formats the number. Default: whole number, Indian grouping (1,23,456). */
  format?: (n: number) => string;
  /** Count mode start value. Default 0. */
  from?: number;
  /** Count mode duration in ms. Default 900. */
  duration?: number;
  className?: string;
};

/**
 * Animated number in tabular figures. Screen readers get only the final value, and there is no aria-live,
 * so metrics never chatter. Shows the final value at once under reduced motion.
 */
function NumberTicker({
  value,
  mode = "count",
  format = formatInt,
  from = 0,
  duration = 900,
  className,
}: NumberTickerProps) {
  const still = useReducedMotion();
  const [seen, setSeen] = React.useState(false);
  const [shown, setShown] = React.useState(from);
  const current = React.useRef(from);
  const ref = React.useCallback(
    (el: HTMLElement | null) => (el ? observeOnce(el, () => setSeen(true)) : undefined),
    [],
  );

  React.useEffect(() => {
    if (mode !== "count" || still || !seen) return;
    const a = current.current;
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / duration);
      // expo-out, close to cubic-bezier(.16, 1, .3, 1)
      const v = a + (value - a) * (k === 1 ? 1 : 1 - 2 ** (-10 * k));
      current.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, mode, still, seen, duration]);

  const final = format(value);
  let visual: React.ReactNode;
  if (mode === "roll" && !still) {
    const chars = [...final];
    // Keyed from the right, so a new leading digit mounts without shifting the others.
    visual = chars.map((c, i) => {
      const key = chars.length - i;
      const d = DIGITS.indexOf(c);
      if (d < 0) return <span key={key}>{c}</span>;
      return (
        <span key={key} className="ticker-col">
          <span className="ticker-strip" style={{ "--d": d } as React.CSSProperties}>
            {DIGITS.map((n) => (
              <span key={n}>{n}</span>
            ))}
          </span>
        </span>
      );
    });
  } else {
    visual = mode === "count" && !still ? format(shown) : final;
  }

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      <span aria-hidden>{visual}</span>
      <span className="sr-only">{final}</span>
    </span>
  );
}

export { NumberTicker, type NumberTickerProps };
