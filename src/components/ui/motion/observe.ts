"use client";

import { prefersReducedMotion } from "./reduced-motion";

// One IntersectionObserver for the whole app. Each element is seen once: it gets data-in, its callback
// runs, and it is unobserved. Reveal, TextReveal and NumberTicker all go through here.

const callbacks = new WeakMap<Element, () => void>();
let io: IntersectionObserver | null = null;

function show(el: Element) {
  el.setAttribute("data-in", "");
  callbacks.get(el)?.();
  callbacks.delete(el);
}

/** Marks `el` with data-in the first time it enters the viewport, then calls `onEnter`. Returns a cleanup. */
export function observeOnce(el: Element, onEnter?: () => void): () => void {
  if (prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
    if (onEnter) callbacks.set(el, onEnter);
    show(el);
    return () => {};
  }
  io ??= new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        // 15% in view, or (for elements taller than the screen) a quarter of the viewport filled
        const filled = entry.intersectionRect.height >= (entry.rootBounds?.height ?? innerHeight) * 0.25;
        if (entry.intersectionRatio < 0.15 && !filled) continue;
        io?.unobserve(entry.target);
        show(entry.target);
      }
    },
    { threshold: [0, 0.05, 0.1, 0.15], rootMargin: "0px 0px -10% 0px" },
  );
  if (onEnter) callbacks.set(el, onEnter);
  io.observe(el);
  return () => {
    io?.unobserve(el);
    callbacks.delete(el);
  };
}
