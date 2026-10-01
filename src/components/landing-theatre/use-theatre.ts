"use client";

import { useEffect, type RefObject } from "react";
import { CHAOS, actLabel } from "./content";

const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const easeOut = (t: number) => 1 - (1 - t) ** 3;
const TAU = Math.PI * 2;

/** Acts that keep a slow drift while on screen. While one is visible the loop keeps running. */
const AMBIENT = new Set(["chaos", "commander", "crew", "show", "features"]);

type Act = { id: string; el: HTMLElement; sc: HTMLElement; p: number; dp: number; on: boolean };
type Sway = (i: number, t: number, d: number) => number;

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
      progress: one("progress"),
      cue: one("cue"),
      rail: Array.from(root.querySelectorAll<HTMLElement>("[data-rail]")),
      curtL: one("curtL"),
      curtR: one("curtR"),
      hero: one("hero"),
      hint: one("hint"),
      chaos: kids("chaos"),
      chaosOut: one("chaosOut"),
      cmd: kids("cmd"),
      converge: one("converge"),
      show: kids("show"),
      boom: one("boom"),
      impact: one("impact"),
      impactEnd: one("impactEnd"),
      feat: kids("feat"),
      ringIn: kids("ringIn"),
      ringOut: kids("ringOut"),
      plates: kids("plates"),
      emerg: one("emerg"),
      bow: kids("bow"),
      finalMsg: one("finalMsg"),
      team: one("team"),
      cta: one("cta"),
      finL: one("finL"),
      finR: one("finR"),
    };

    // Depth scale for narrow screens, read on resize, not every frame.
    let D = 1;
    const measure = () => {
      const w = window.innerWidth;
      D = w <= 560 ? 0.45 : w <= 860 ? 0.6 : 1;
    };
    measure();

    /* generic fly-through: node i is centred on the camera at p = i / (n - 1) */
    const fly = (nodes: HTMLElement[], p: number, spread: number, sway: Sway, t: number) => {
      const n = nodes.length;
      const sp = spread * D;
      const far = (n - 1) * sp;
      nodes.forEach((node, i) => {
        const z = (p * (n - 1) - i) * sp;
        tf(node, `translate(-50%,-50%) translate3d(${sway(i, t, D)}px,0,${z}px)`);
        const pass = clamp(1 - (z - 110) / 520); // flew past the camera
        const fog = clamp((z + far * 0.92) / 480, 0.07, 1); // still out in the wings
        op(node, pass * fog);
      });
    };

    const update: Record<string, (dp: number, t: number) => void> = {
      opening(dp) {
        const o = easeOut(clamp(dp / 0.5));
        tf($.curtL, `translateX(calc(${-100 * o}% - ${2 * o}vw)) rotateY(${-22 * o}deg)`);
        tf($.curtR, `translateX(calc(${100 * o}% + ${2 * o}vw)) rotateY(${22 * o}deg)`);
        op($.hero, clamp((o - 0.1) / 0.42));
        tf($.hero, `translateZ(${lerp(-170, 60, easeOut(dp))}px) scale(${lerp(0.94, 1, o)})`);
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
      commander(dp, t) {
        fly(
          $.cmd,
          dp,
          740,
          (i, t, d) => ((i % 2 ? 1 : -1) * (44 + (i % 3) * 30) + Math.sin(t * 0.9 + i) * 10) * d,
          t,
        );
        const c = clamp((dp - 0.8) / 0.16);
        op($.converge, c);
        tf($.converge, `translate(-50%,-50%) scale(${lerp(0.6, 1, easeOut(c))})`);
      },
      crew(dp, t) {
        const place = (ring: HTMLElement[], R: number, ang: number) => {
          ring.forEach((el, i) => {
            const a = (i / ring.length) * TAU - Math.PI / 2 + ang;
            const y = Math.sin(t * 0.6 + i * 1.3) * 9 * D;
            tf(el, `translate(-50%,-50%) translate3d(${Math.sin(a) * R}px,${y}px,${Math.cos(a) * R}px)`);
            op(el, clamp((Math.cos(a) + 0.32) / 0.95, 0.05, 1));
          });
        };
        place($.ringIn, 410 * D, dp * TAU * 0.55 + t * 0.035);
        place($.ringOut, 730 * D, -dp * TAU * 0.38 - t * 0.025);
      },
      show(dp, t) {
        fly(
          $.show,
          dp,
          620,
          (i, t, d) => ((i % 2 ? 1 : -1) * (70 + (i % 3) * 44) + Math.sin(t * 0.8 + i * 1.4) * 8) * d,
          t,
        );
        op($.boom, clamp(1 - dp / 0.1));
        $.impact?.toggleAttribute("data-on", dp > 0.84);
        $.impactEnd?.toggleAttribute("data-on", dp > 0.93);
      },
      rule(dp) {
        $.plates.forEach((el, i) => {
          const z = ((i - 1.5) * 150 + (0.5 - dp) * 380) * D;
          const x = (i % 2 ? 1 : -1) * (0.5 - dp) * 54 * D;
          tf(el, `translate3d(${x}px,0,${z}px)`);
        });
        $.emerg?.toggleAttribute("data-on", dp > 0.6);
      },
      features(dp, t) {
        fly(
          $.feat,
          dp,
          690,
          (i, t, d) => ((i % 2 ? 1 : -1) * (90 + (i % 3) * 54) + Math.sin(t * 0.7 + i) * 12) * d,
          t,
        );
      },
      final(dp) {
        $.bow.forEach((li, i) => li.toggleAttribute("data-on", dp > 0.16 + i * 0.07));
        const m = easeOut(clamp((dp - 0.42) / 0.26));
        op($.finalMsg, m);
        tf($.finalMsg, `scale(${lerp(0.92, 1, m)})`);
        op($.team, clamp((dp - 0.56) / 0.24));
        const b = clamp((dp - 0.62) / 0.24);
        op($.cta, b);
        if ($.cta) $.cta.style.pointerEvents = b > 0.5 ? "auto" : "none";
        // The curtains part for the closing tableau, then close behind the call to action.
        // Phones open them further so the text in the middle is never covered.
        const a = easeOut(clamp((dp - 0.24) / 0.22)) * (1 - clamp((dp - 0.86) / 0.14));
        const w = D < 1 ? 92 : 24;
        tf($.finL, `translateX(calc(${-w * a}% - ${a}vw)) rotateY(${-14 * a}deg)`);
        tf($.finR, `translateX(calc(${w * a}% + ${a}vw)) rotateY(${14 * a}deg)`);
      },
    };

    let raf = 0;
    let last = 0;
    let current = -1;

    const frame = (now: number) => {
      raf = 0;
      const dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      last = now;
      const k = 1 - (1 - 0.11) ** (dt * 60); // the same easing at 60 Hz and 120 Hz
      const t = now / 1000;
      const vh = window.innerHeight;
      let busy = false;
      let cur = 0;

      // Reads first: one rect per act.
      acts.forEach((a, i) => {
        const r = a.sc.getBoundingClientRect();
        a.p = clamp(-r.top / Math.max(1, r.height - vh));
        if (r.top <= vh * 0.5) cur = i;
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

      // Then writes.
      if (film) for (const a of acts) if (a.on) update[a.id]?.(a.dp, t);

      if (cur !== current) {
        current = cur;
        if ($.cue) $.cue.textContent = actLabel(cur); // aria-live: only when the act changes
        $.rail.forEach((b, i) =>
          i === cur ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current"),
        );
      }
      const max = document.documentElement.scrollHeight - vh;
      tf($.progress, `scaleX(${clamp(window.scrollY / Math.max(1, max))})`);

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
        $.converge,
        $.boom,
        $.finalMsg,
        $.team,
        $.cta,
        $.finL,
        $.finR,
        ...$.chaos,
        ...$.cmd,
        ...$.show,
        ...$.feat,
        ...$.ringIn,
        ...$.ringOut,
        ...$.plates,
      ];
      for (const el of moved) el?.style.removeProperty("transform");
      for (const el of moved) el?.style.removeProperty("opacity");
      $.cta?.style.removeProperty("pointer-events");
    };
  }, [rootRef, film]);
}
