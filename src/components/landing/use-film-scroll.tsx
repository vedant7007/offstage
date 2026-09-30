"use client";

import * as React from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import Lenis from "lenis";
import { CRISIS_LOG, EVENT_TYPES } from "./chapters";
import { local, stage, window01 } from "./scroll-store";
import styles from "./landing.module.css";

const MOBILE = "(max-width: 767px)";

/** Ids and data attributes the scroll layer finds its DOM by. */
export const DOM = {
  section: "data-cue",
  block: "data-cue-block",
  sticky: "data-cue-sticky",
  rail: "data-cue-rail",
  counter: "landing-counter",
  log: "landing-log",
  eventType: "landing-event-type",
};

/**
 * Smooth scroll (Lenis on GSAP's ticker), the master progress `stage.p` from the chapter
 * sections, one-shot text reveals through ScrollTrigger, and the DOM the film updates every
 * frame (counter, log lines, event type, the cue rail). Returns a scroll-to-chapter function.
 */
export function useFilmScroll(enabled: boolean) {
  const lenisRef = React.useRef<Lenis | null>(null);

  React.useEffect(() => {
    if (!enabled) return;
    gsap.registerPlugin(ScrollTrigger);

    const lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
    lenisRef.current = lenis;
    lenis.on("scroll", ScrollTrigger.update);
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);

    const sections = Array.from(document.querySelectorAll<HTMLElement>(`[${DOM.section}]`));
    const blocks = sections.map((s) => s.querySelector<HTMLElement>(`[${DOM.block}]`));
    const stickies = sections.map((s) => s.querySelector<HTMLElement>(`[${DOM.sticky}]`));
    const fades: string[] = [];
    const rail = Array.from(document.querySelectorAll<HTMLButtonElement>(`[${DOM.rail}]`));
    const counter = document.getElementById(DOM.counter);
    const logItems = Array.from(document.getElementById(DOM.log)?.children ?? []);
    const eventType = document.getElementById(DOM.eventType);

    const tops: number[] = [];
    const heights: number[] = [];
    const measure = () => {
      const y = window.scrollY;
      sections.forEach((s, i) => {
        const r = s.getBoundingClientRect();
        tops[i] = r.top + y;
        heights[i] = r.height;
      });
      stage.mobile = window.matchMedia(MOBILE).matches;
      stage.lite = stage.mobile || window.innerWidth < 1024;
    };
    measure();
    document.fonts?.ready.then(measure);
    const ro = new ResizeObserver(measure);
    sections.forEach((s) => ro.observe(s));
    window.addEventListener("resize", measure);

    const last = sections.length - 1;
    const progress = () => {
      const y = window.scrollY;
      let i = 0;
      while (i < last && y >= (tops[i] ?? 0) + (heights[i] ?? 0)) i++;
      const h = heights[i] ?? 0;
      const f = h ? (y - (tops[i] ?? 0)) / h : 0;
      return Math.max(0, Math.min(last + 0.999, i + f));
    };

    const triggers = blocks.map((block, i) => {
      if (!block) return null;
      return ScrollTrigger.create({
        trigger: sections[i],
        start: i === 0 ? "top bottom" : "top 10%",
        once: true,
        onEnter: () => block.classList.add(styles.in!),
      });
    });

    let railCurrent = -1;
    let lastLog = -1;
    let lastType = -1;
    const update = () => {
      const p = progress();
      stage.p = p;

      const chapter = Math.min(last, Math.floor(p + 0.15));
      if (chapter !== railCurrent) {
        rail.forEach((b, i) => {
          if (i === chapter) b.setAttribute("aria-current", "true");
          else b.removeAttribute("aria-current");
        });
        railCurrent = chapter;
      }

      // Outgoing text fades before the camera starts its move to the next chapter.
      stickies.forEach((el, i) => {
        if (!el || i === last) return;
        const o = (1 - window01(local(p, i), 0.5, 0.62)).toFixed(2);
        if (fades[i] !== o) {
          el.style.opacity = o;
          fades[i] = o;
        }
      });

      if (counter) counter.textContent = String(Math.round(320 * window01(local(p, 4), 0.08, 0.62)));

      const f5 = local(p, 5);
      const shown = CRISIS_LOG.filter((l) => f5 >= l.at).length;
      if (shown !== lastLog) {
        logItems.forEach((li, i) => li.classList.toggle(styles.on!, i < shown));
        lastLog = shown;
      }

      if (eventType) {
        const t = Math.min(
          EVENT_TYPES.length - 1,
          Math.floor(window01(local(p, 9), 0.05, 0.75) * EVENT_TYPES.length),
        );
        if (t !== lastType) {
          eventType.textContent = EVENT_TYPES[t] ?? "";
          lastType = t;
        }
      }
    };
    gsap.ticker.add(update);
    update();

    return () => {
      gsap.ticker.remove(update);
      gsap.ticker.remove(tick);
      triggers.forEach((t) => t?.kill());
      ro.disconnect();
      window.removeEventListener("resize", measure);
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [enabled]);

  return React.useCallback((i: number) => {
    const el = document.querySelector<HTMLElement>(`[${DOM.section}="${i}"]`);
    if (!el) return;
    const lenis = lenisRef.current;
    if (lenis) lenis.scrollTo(el, { offset: 0, duration: 1.6 });
    else el.scrollIntoView();
    el.querySelector<HTMLElement>("h1, h2")?.focus();
  }, []);
}
