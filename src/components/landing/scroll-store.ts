/*
 * The one value the whole film is driven by: `p`, the master scroll progress, where the integer
 * part is the chapter on screen and the fraction is how far through it the viewport is. Written
 * by the scroll layer, read every frame by the scene and the DOM ticker. A mutable module object
 * on purpose: nothing here should cause a React render.
 */
export const stage = {
  p: 0,
  /** Phone layouts put the text under the box, so the box moves up instead of sideways. */
  mobile: false,
  /** Half the instances and no heavy passes on small screens. */
  lite: false,
  /** Post-processing runs only on GPUs that can afford full-screen passes. */
  post: false,
  /** Quality-loop switches from ?off=a,b (shadow, aniso, hemi, env, figures, fog). */
  off: new Set<string>(),
};

/** 0 below `a`, 1 above `b`, a smoothstep between. */
export function window01(x: number, a: number, b: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Rises over [a, b], holds, then falls over [c, d]. The standard shape for a prop's presence. */
export function bump(x: number, a: number, b: number, c: number, d: number) {
  return window01(x, a, b) * (1 - window01(x, c, d));
}

export function clamp01(x: number) {
  return Math.min(1, Math.max(0, x));
}

export function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

/** Local progress inside chapter `i`, clamped to [0, 1]. */
export function local(p: number, i: number) {
  return clamp01(p - i);
}
