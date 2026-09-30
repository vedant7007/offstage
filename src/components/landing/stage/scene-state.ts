import { Color } from "three";
import { CHAPTERS, TUNGSTEN } from "../chapters";
import { bump, lerp, local, window01 } from "../scroll-store";

/** The scene state blended for the current scroll position, before damping. Reused every frame. */
export interface Blended {
  r: number;
  theta: number;
  phi: number;
  tx: number;
  ty: number;
  tz: number;
  fov: number;
  dutch: number;
  key: Color;
  keyIntensity: number;
  spot: number;
  rim: number;
  ambient: number;
  curtain: number;
  /** +1 puts the box on the left of the screen (text right), -1 on the right, 0 centred. */
  side: number;
}

const keyColors = CHAPTERS.map((c) => new Color(c.scene.key));
const tungsten = new Color(TUNGSTEN);
const SIDE = { left: -1, right: 1, center: 0 } as const;

/**
 * Chapter i holds its state for the first half of its scroll, then eases into chapter i + 1,
 * finishing just before the next text reveals so the two never move together.
 */
export function blendT(f: number) {
  return window01(f, 0.45, 0.82);
}

export function blend(p: number, out: Blended): Blended {
  const last = CHAPTERS.length - 1;
  const i = Math.min(last, Math.max(0, Math.floor(p)));
  const j = Math.min(last, i + 1);
  const t = i === j ? 0 : blendT(p - i);
  const a = CHAPTERS[i]!.scene;
  const b = CHAPTERS[j]!.scene;

  out.r = lerp(a.r, b.r, t);
  out.theta = lerp(a.theta, b.theta, t);
  out.phi = lerp(a.phi, b.phi, t);
  out.tx = lerp(a.target[0], b.target[0], t);
  out.ty = lerp(a.target[1], b.target[1], t);
  out.tz = lerp(a.target[2], b.target[2], t);
  out.fov = lerp(a.fov, b.fov, t);
  out.dutch = lerp(a.dutch, b.dutch, t);
  out.key.copy(keyColors[i]!).lerp(keyColors[j]!, t);
  out.keyIntensity = lerp(a.keyIntensity, b.keyIntensity, t);
  out.spot = lerp(a.spot, b.spot, t);
  out.rim = lerp(a.rim, b.rim, t);
  out.ambient = lerp(a.ambient, b.ambient, t);
  out.curtain = lerp(a.curtain, b.curtain, t);
  out.side = lerp(SIDE[CHAPTERS[i]!.side], SIDE[CHAPTERS[j]!.side], t);

  // Approval: the tungsten flood is tied to the button press, not to the chapter boundary.
  const flood = window01(local(p, 6), 0.5, 0.64);
  if (flood > 0) {
    out.key.lerp(tungsten, flood);
    out.keyIntensity += 0.9 * flood;
    out.spot += 0.6 * flood;
    out.ambient += 0.3 * flood;
  }
  return out;
}

export function newBlended(): Blended {
  return {
    r: 12,
    theta: 0,
    phi: 6,
    tx: 0,
    ty: 1,
    tz: 0,
    fov: 30,
    dutch: 0,
    key: new Color(TUNGSTEN),
    keyIntensity: 0.5,
    spot: 1,
    rim: 0,
    ambient: 0.3,
    curtain: 0,
    side: 0,
  };
}

/** How red the chaos chapter is right now: drives the key light flicker. */
export function chaosAmount(p: number) {
  return bump(p, 0.55, 1.0, 1.55, 2.0);
}

/** Damped values the props read, written by the rig each frame. */
export const live = {
  curtain: 0,
  time: 0,
};
