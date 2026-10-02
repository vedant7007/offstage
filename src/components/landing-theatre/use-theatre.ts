"use client";

import { useEffect, type RefObject } from "react";
import { collectCommander, updateCommander } from "./act-commander";
import { collectFeatures, updateFeatures } from "./act-features";
import { collectShow, updateShow } from "./act-show";
import { CHAOS, actLabel } from "./content";
import s from "./theatre.module.css";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const TAU = Math.PI * 2;

/**
 * How fast each act's eased progress follows the scroll, per 60 Hz frame. Lenis already smooths
 * the wheel, so this only rounds off native jumps (scrollbar drag, keys, touch). Measured under a
 * scripted wheel scroll at 1440x900: 0.11 trailed the scroll by 38px on average (95px on a fast
 * flick) and floated up to 370ms after it stopped; 0.3 trails by 9px (23px on a flick) and
 * settles within a frame of the scroll.
 */
const DP_LERP = 0.3;

/**
 * How far open the opening curtains sit before any scroll, as a share of their full travel.
 * theatre.module.css sets the same resting transform, so the first paint matches the first frame.
 */
const CURTAIN_START = 0.8;
const CURTAIN_START_NARROW = 1;

/** Acts that keep a slow drift while on screen. While one is visible the loop keeps running. */
const AMBIENT = new Set(["chaos", "crew"]);

type Act = { id: string; el: HTMLElement; sc: HTMLElement; p: number; dp: number; on: boolean };

const tf = (el: HTMLElement | null | undefined, v: string) => {
  if (el) el.style.transform = v;
};
const op = (el: HTMLElement | null | undefined, v: number) => {
  if (el) el.style.opacity = String(v);
};

/**
 * The scroll-driven theatre. One requestAnimationFrame loop: it reads every act's rect once a
 * frame, eases each act's progress toward the scroll position, and writes transforms only for
 * acts on screen. It stops when the scroll is still, the easing has settled and no drifting act
 * is visible, and restarts on scroll or resize. With `film` off (reduced motion) it only keeps
 * the chrome in step: the nav cue, the rail and the progress bar.
 */
export function useTheatre(rootRef: RefObject<HTMLElement | null>, film: boolean) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;

    const one = (k: string) => root.querySelector<HTMLElement>(`[data-t="${k}"]`);
    const kids = (k: string) => Array.from(one(k)?.children ?? []) as HTMLElement[];

    const acts: Act[] = Array.from(root.querySelectorAll<HTMLElement>("section[data-act]")).map((el) => ({
      id: el.dataset.act ?? "",
      el,
      sc: el.querySelector<HTMLElement>("[data-scroll]") ?? el,
      p: 0,
      dp: 0,
      on: false,
    }));

    const $ = {
      nav: one("nav"),
      progress: one("progress"),
      cue: one("cue"),
      rail: Array.from(root.querySelectorAll<HTMLElement>("[data-rail]")),
      curtL: one("curtL"),
      curtR: one("curtR"),
      hero: one("hero"),
      hint: one("hint"),
      chaos: kids("chaos"),
      chaosOut: one("chaosOut"),
      ring: kids("ring"),
      plates: kids("plates"),
      emerg: one("emerg"),
      bow: kids("bow"),
      finalMsg: one("finalMsg"),
      team: one("team"),
      cta: one("cta"),
      finL: one("finL"),
      finR: one("finR"),
    };
    // The three scene acts own their markup and scenes; they are found once per render.
    const cmd = collectCommander(root);
    const show = collectShow(root);
    const feat = collectFeatures(root);
    // Pinned stages keep their content clear of the nav; anything else that scrolls under it does not.
    const stages = Array.from(root.querySelectorAll<HTMLElement>(`.${CSS.escape(s.stage ?? "")}`));

    // Depth scale for narrow screens, read on resize, not every frame.
    let D = 1;
    let RY = 210; // how far the front of the crew ring drops below the Commander
    let navH = 76;
    const measure = () => {
      // Stuck cue heads and stage padding clear the fixed nav by this much.
      if ($.nav) {
        navH = $.nav.offsetHeight;
        root.style.setProperty("--nav-h", `${navH}px`);
      }
      const w = window.innerWidth;
      D = w <= 560 ? 0.45 : w <= 860 ? 0.6 : 1;
      RY = Math.min(210, window.innerHeight * 0.24);
    };
    measure();

    const update: Record<string, (dp: number, t: number) => void> = {
      opening(dp) {
        // The house opens already lit: the curtains frame the hero at load and part the rest of
        // the way as the visitor scrolls, while the hero settles back into the dark.
        const start = D < 1 ? CURTAIN_START_NARROW : CURTAIN_START;
        const e = easeOut(clamp(dp / 0.5));
        const o = lerp(start, 1, e);
        // Flat at rest so the folds read as a frame; they swing back only as they part.
        tf($.curtL, `translateX(calc(${-100 * o}% - ${2 * o}vw)) rotateY(${-22 * e}deg)`);
        tf($.curtR, `translateX(calc(${100 * o}% + ${2 * o}vw)) rotateY(${22 * e}deg)`);
        const out = easeOut(clamp((dp - 0.45) / 0.55));
        op($.hero, 1 - 0.9 * out);
        tf($.hero, `translate3d(0,${-40 * out}px,${-160 * out}px)`);
        op($.hint, clamp(1 - dp / 0.07));
      },
      chaos(dp, t) {
        const drift = (0.5 - dp) * 2; // -1 to +1
        $.chaos.forEach((el, i) => {
          const c = CHAOS[i];
          if (!c) return;
          const tx = drift * c.dx * D + Math.sin(t * 0.8 + i * 1.9) * 9 * D;
          const ty = Math.sin(t * 0.65 + i * 2.4) * 11 * D;
          const tz = c.dz * D * (0.45 + 0.55 * Math.sin(t * 0.5 + i * 1.3));
          const rz = c.rz + Math.sin(t * 0.7 + i) * 1.1;
          tf(
            el,
            `translate3d(${tx}px,${ty}px,${tz}px) rotateY(${c.ry * (0.5 + 0.5 * drift)}deg) rotateZ(${rz}deg)`,
          );
        });
        $.chaosOut?.toggleAttribute("data-on", dp > 0.55);
      },
      commander: (dp, t) => updateCommander(cmd, dp, t),
      crew(dp, t) {
        // One tilted ring around the Commander: the front sits low and close, the back high and
        // far, so the Commander in the middle is never covered. Each agent turns to the front once.
        const n = $.ring.length;
        const rx = Math.min(520, window.innerWidth * 0.36);
        const rz = 260 * D;
        const turn = dp * TAU * ((n - 1) / n) + t * 0.02;
        $.ring.forEach((el, i) => {
          const a = (i / n) * TAU - turn;
          const c = Math.cos(a);
          const bob = Math.sin(t * 0.6 + i * 1.3) * 6 * D;
          tf(el, `translate(-50%,-50%) translate3d(${Math.sin(a) * rx}px,${c * RY + bob}px,${c * rz}px)`);
          // Narrow screens have no room for the whole ring: only the agent at the front shows.
          op(el, D < 1 ? clamp((c - 0.86) / 0.12) : clamp(0.22 + 0.78 * ((c + 0.2) / 1.2), 0.12, 1));
          el.toggleAttribute("data-front", c > Math.cos(Math.PI / n));
        });
      },
      show: (dp, t) => updateShow(show, dp, t),
      how(dp) {
        // The four lines arrive one after another out of the dark, then hold still to be read.
        $.plates.forEach((el, i) => {
          const a = easeOut(clamp((dp + 0.15 - i * 0.12) / 0.35));
          const x = (i % 2 ? 1 : -1) * (1 - a) * 90 * D;
          tf(el, `translate3d(${x}px,0,${-(1 - a) * 420 * D}px)`);
          op(el, a);
        });
        $.emerg?.toggleAttribute("data-on", dp > 0.6);
      },
      features: (dp, t) => updateFeatures(feat, dp, t),
      final(dp) {
        $.bow.forEach((li, i) => li.toggleAttribute("data-on", dp > 0.16 + i * 0.07));
        const m = easeOut(clamp((dp - 0.42) / 0.26));
        op($.finalMsg, m);
        tf($.finalMsg, `scale(${lerp(0.92, 1, m)})`);
        op($.team, clamp((dp - 0.56) / 0.24));
        const b = clamp((dp - 0.62) / 0.24);
        op($.cta, b);
        if ($.cta) $.cta.style.pointerEvents = b > 0.5 ? "auto" : "none";
        // The curtains part for the closing tableau, then draw in to frame it, stopping well
        // clear of the text. On narrow screens they stay open.
        const open = easeOut(clamp((dp - 0.08) / 0.3));
        const frame = D < 1 ? 0 : easeOut(clamp((dp - 0.78) / 0.18));
        const w = 100 * open * (1 - 0.4 * frame);
        const turn = 22 * open * (1 - frame / 2);
        tf($.finL, `translateX(calc(${-w}% - ${open}vw)) rotateY(${-turn}deg)`);
        tf($.finR, `translateX(calc(${w}% + ${open}vw)) rotateY(${turn}deg)`);
      },
    };

    let raf = 0;
    let last = 0;
    let current = -1;
    let lastY = window.scrollY;
    let navHidden = false;
    let navTone = "";

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      const k = 1 - (1 - DP_LERP) ** (dt * 60); // the same easing at 60 Hz and 120 Hz
      const t = now / 1000;
      const vh = window.innerHeight;
      let busy = false;
      let cur = 0;
      let under = "";

      // Reads first: one rect per act.
      acts.forEach((a, i) => {
        const r = a.sc.getBoundingClientRect();
        a.p = clamp(-r.top / Math.max(1, r.height - vh));
        if (r.top <= vh * 0.5) cur = i;
        const er = a.el === a.sc ? r : a.el.getBoundingClientRect();
        if (er.top <= 40 && er.bottom > 40) under = a.id;
        const on = r.bottom > 0 && r.top < vh;
        if (on !== a.on) {
          a.on = on;
          a.el.toggleAttribute("data-on", on);
        }
        if (!film || !on) {
          a.dp = a.p; // off screen nothing shows, so it snaps
          return;
        }
        a.dp += (a.p - a.dp) * k;
        if (Math.abs(a.p - a.dp) < 0.0004) a.dp = a.p;
        else busy = true;
        if (AMBIENT.has(a.id)) busy = true;
      });

      // The nav floats bare only over a stage whose empty top padding sits under it (a pinned
      // stage, or one arriving). Over anything else it gets a solid bar, so content never runs
      // under the brand: free-flowing blocks, a stage scrolling away, every still in poster mode.
      let tone = "";
      if (
        !stages.some((el) => {
          const r = el.getBoundingClientRect();
          return r.top >= -1 && r.top <= navH && r.bottom > navH;
        })
      ) {
        const act = acts.find((a) => a.id === under);
        tone = act?.el.classList.contains(s.dark ?? "") ? "dark" : "light";
      }

      // Then writes.
      if (film) for (const a of acts) if (a.on) update[a.id]?.(a.dp, t);

      // Over the red curtains the blended chrome turns cyan; plain white reads better there.
      root.toggleAttribute("data-curtain", film && (under === "opening" || under === "final"));

      if (cur !== current) {
        current = cur;
        if ($.cue) $.cue.textContent = actLabel(cur); // aria-live: only when the act changes
        $.rail.forEach((b, i) =>
          i === cur ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current"),
        );
      }
      const y = window.scrollY;
      const max = document.documentElement.scrollHeight - vh;
      tf($.progress, `scaleX(${clamp(y / Math.max(1, max))})`);

      // The nav slides away while reading down and comes back on any scroll up. It stays put over
      // the first screen and the curtain call.
      const dy = y - lastY;
      lastY = y;
      let hide = navHidden;
      if (y < vh || cur === acts.length - 1) hide = false;
      else if (dy > 1) hide = true;
      else if (dy < -1) hide = false;
      if (tone !== navTone) {
        navTone = tone;
        if (tone) root.setAttribute("data-navbar", tone);
        else root.removeAttribute("data-navbar");
      }
      if (hide !== navHidden) {
        navHidden = hide;
        root.toggleAttribute("data-navhide", hide);
      }

      if (busy) raf = requestAnimationFrame(frame);
      else last = 0;
    };

    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };
    const onResize = () => {
      measure();
      kick();
    };

    // One-shot reveals for the blocks after a pinned scene.
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.setAttribute("data-in", "");
          io.unobserve(e.target);
        }),
      { threshold: 0.18 },
    );
    root.querySelectorAll("[data-reveal]").forEach((el) => io.observe(el));

    window.addEventListener("scroll", kick, { passive: true });
    window.addEventListener("resize", onResize, { passive: true });
    kick();

    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      window.removeEventListener("scroll", kick);
      window.removeEventListener("resize", onResize);
      // Hand the poster layout clean elements if the visitor turns motion off mid-visit.
      const moved = [
        $.curtL,
        $.curtR,
        $.hero,
        $.hint,
        $.finalMsg,
        $.team,
        $.cta,
        $.finL,
        $.finR,
        ...$.chaos,
        ...feat.tiles,
        ...$.ring,
        ...$.plates,
      ];
      for (const el of moved) el?.style.removeProperty("transform");
      for (const el of moved) el?.style.removeProperty("opacity");
      for (const el of $.ring) el.removeAttribute("data-front");
      root.removeAttribute("data-curtain");
      root.removeAttribute("data-navhide");
      root.removeAttribute("data-navbar");
      $.cta?.style.removeProperty("pointer-events");
    };
  }, [rootRef, film]);
}
