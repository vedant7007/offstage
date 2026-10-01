"use client";

import * as React from "react";

// One delegated pointer listener for the whole app, mounted once in Providers. It drives three effects
// through CSS variables only, so the elements that use them need no handlers and can be server
// components:
//   .spot / .spot-edge / [data-spot]  --mx, --my   cursor spotlight and lit border
//   [data-magnetic]                   --tx, --ty   magnetic pull (data-strength, data-max)
//   [data-tilt]                       --rx, --ry, --gx, --gy   tilted pass with glare (data-max)
// Mouse only, one rAF per frame, all reads before writes. Under reduced motion it does nothing.

const SPOT = ".spot, .spot-edge, [data-spot]";

type Live = { el: HTMLElement; rect: DOMRect | null; tx: number; ty: number };

const num = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) && v !== undefined && v !== "" ? n : fallback;
};
const clamp = (v: number, max: number) => Math.max(-max, Math.min(max, v));

function PointerFx() {
  React.useEffect(() => {
    const still = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;
    let last: PointerEvent | null = null;
    let mag: Live | null = null;
    let tilt: Live | null = null;

    const releaseMag = () => {
      if (!mag) return;
      mag.el.removeAttribute("data-fx-active");
      mag.el.style.setProperty("--tx", "0px");
      mag.el.style.setProperty("--ty", "0px");
      mag = null;
    };
    const releaseTilt = () => {
      if (!tilt) return;
      tilt.el.removeAttribute("data-fx-active");
      tilt.el.style.setProperty("--rx", "0deg");
      tilt.el.style.setProperty("--ry", "0deg");
      tilt = null;
    };
    const releaseAll = () => {
      releaseMag();
      releaseTilt();
    };

    const frame = () => {
      raf = 0;
      const e = last;
      if (!e) return;
      const target = e.target instanceof Element ? e.target : null;
      const spotEl = target?.closest<HTMLElement>(SPOT) ?? null;
      const magEl = target?.closest<HTMLElement>("[data-magnetic]") ?? null;
      const tiltEl = target?.closest<HTMLElement>("[data-tilt]") ?? null;

      if (mag && mag.el !== magEl) releaseMag();
      if (tilt && tilt.el !== tiltEl) releaseTilt();
      if (magEl && !mag) mag = { el: magEl, rect: null, tx: 0, ty: 0 };
      if (tiltEl && !tilt) tilt = { el: tiltEl, rect: null, tx: 0, ty: 0 };

      // Reads
      const spotRect = spotEl?.getBoundingClientRect();
      if (mag && !mag.rect) mag.rect = mag.el.getBoundingClientRect();
      if (tilt && !tilt.rect) tilt.rect = tilt.el.getBoundingClientRect();

      // Writes
      if (spotEl && spotRect) {
        spotEl.style.setProperty("--mx", `${e.clientX - spotRect.left}px`);
        spotEl.style.setProperty("--my", `${e.clientY - spotRect.top}px`);
      }
      if (mag?.rect) {
        // The cached rect includes the current pull, so take it back out to find the resting centre.
        const r = mag.rect;
        const cx = r.left - mag.tx + r.width / 2;
        const cy = r.top - mag.ty + r.height / 2;
        const strength = num(mag.el.dataset.strength, 0.3);
        const max = num(mag.el.dataset.max, 8);
        const tx = clamp((e.clientX - cx) * strength, max);
        const ty = clamp((e.clientY - cy) * strength, max);
        mag.rect = new DOMRect(r.left - mag.tx + tx, r.top - mag.ty + ty, r.width, r.height);
        mag.tx = tx;
        mag.ty = ty;
        mag.el.setAttribute("data-fx-active", "");
        mag.el.style.setProperty("--tx", `${tx.toFixed(2)}px`);
        mag.el.style.setProperty("--ty", `${ty.toFixed(2)}px`);
      }
      if (tilt?.rect) {
        const r = tilt.rect;
        const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
        const max = num(tilt.el.dataset.max, 6);
        tilt.el.setAttribute("data-fx-active", "");
        tilt.el.style.setProperty("--ry", `${((px - 0.5) * 2 * max).toFixed(2)}deg`);
        tilt.el.style.setProperty("--rx", `${((0.5 - py) * 2 * max).toFixed(2)}deg`);
        tilt.el.style.setProperty("--gx", `${(px * 100).toFixed(1)}%`);
        tilt.el.style.setProperty("--gy", `${(py * 100).toFixed(1)}%`);
      }
    };

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || still.matches) return;
      last = e;
      if (!raf) raf = requestAnimationFrame(frame);
    };
    // Layout moved under a resting pointer: measure again on the next move.
    const onScroll = () => {
      if (mag) mag.rect = null;
      if (tilt) tilt.rect = null;
    };
    const onLeave = () => {
      last = null;
      releaseAll();
    };

    document.addEventListener("pointermove", onMove, { passive: true });
    document.documentElement.addEventListener("pointerleave", onLeave);
    window.addEventListener("blur", onLeave);
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    window.addEventListener("resize", onScroll, { passive: true });
    still.addEventListener("change", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      releaseAll();
      document.removeEventListener("pointermove", onMove);
      document.documentElement.removeEventListener("pointerleave", onLeave);
      window.removeEventListener("blur", onLeave);
      window.removeEventListener("scroll", onScroll, { capture: true });
      window.removeEventListener("resize", onScroll);
      still.removeEventListener("change", onLeave);
    };
  }, []);
  return null;
}

export { PointerFx };
