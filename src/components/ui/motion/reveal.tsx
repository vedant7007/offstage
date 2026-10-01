"use client";

import * as React from "react";
import { observeOnce } from "./observe";

type RevealTag = "div" | "section" | "article" | "header" | "footer" | "li" | "ul" | "ol" | "p" | "span";

type RevealProps = React.HTMLAttributes<HTMLElement> & {
  /** Element to render. Default div. */
  as?: RevealTag;
  /** rise: fade up 12px (default). fade: opacity only. scale: from 97%. */
  variant?: "rise" | "fade" | "scale";
  /** Extra delay in ms before this item starts. */
  delay?: number;
  /** Position in a list: each step adds --stagger (40ms), capped at 8 items. */
  index?: number;
};

const ref = (el: HTMLElement | null) => (el ? observeOnce(el) : undefined);

/**
 * Fades or rises its content in once, the first time it scrolls into view. Content stays visible without
 * JavaScript and under reduced motion. Animates translate and opacity only.
 * Never wrap an overlay, a fixed element or a popover in it.
 */
function Reveal({ as = "div", variant = "rise", delay, index, style, ...props }: RevealProps) {
  const Tag = as as React.ElementType;
  const vars: Record<string, string | number> = {};
  if (index) vars["--i"] = index;
  if (delay) vars["--reveal-delay"] = `${delay}ms`;
  return <Tag ref={ref} data-reveal={variant} style={{ ...vars, ...style }} {...props} />;
}

export { Reveal, type RevealProps };
