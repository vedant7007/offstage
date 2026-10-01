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

// Only the first commit (hydration of server-rendered content) can race the failsafe; later mounts skip
// the check, so it never forces a style flush per element on client navigations.
let firstCommit = true;

/** True once the CSS failsafe (motion.css, reveal-failsafe) has started showing this element or its words. */
function shownByFailsafe(el: Element) {
  return el.getAnimations({ subtree: true }).some(
    (a) =>
      typeof CSSAnimation !== "undefined" &&
      a instanceof CSSAnimation &&
      a.animationName === "reveal-failsafe" &&
      // Past its 1 s delay: showing or shown
      Number(a.currentTime) >= 1000,
  );
}

/** Marks `el` with data-in the first time it enters the viewport, then calls `onEnter`. Returns a cleanup. */
export function observeOnce(el: Element, onEnter?: () => void): () => void {
  // Hydrated: hand over from the CSS failsafe to the observer. If the failsafe already showed it (slow
  // hydration), keep it shown rather than hiding it again.
  let failsafeShown = false;
  if (firstCommit) {
    setTimeout(() => (firstCommit = false));
    failsafeShown = performance.now() > 1000 && shownByFailsafe(el);
  }
  el.setAttribute("data-armed", "");
  if (failsafeShown || prefersReducedMotion() || typeof IntersectionObserver === "undefined") {
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
