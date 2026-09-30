import { CHANNELS, RIPPLE_LABELS } from "./chapters";
import { bump, local, window01 } from "./scroll-store";

/**
 * Small DOM labels pinned to points in the scene: the venue room that goes dark, what the one
 * approval tap touched, and the five channels at the top of the fan-out beams. The label
 * elements live in the page; the projector inside the canvas moves them every frame.
 */
export interface OverlayLabel {
  id: string;
  text: string;
  sub?: string;
  at: [number, number, number];
  opacity: (p: number) => number;
}

const BUTTON_AT: [number, number, number] = [0.5, 0, 0.95];
const RIPPLE_AT: [number, number, number][] = [
  [-2.3, 0.4, 1.5],
  [2.6, 0.4, 1.2],
  [-2.2, 0.4, -1.4],
  [2.2, 0.4, -1.8],
];
const BEAM_X = [-2.3, -1.15, 0, 1.15, 2.3];
const BEAM_TOP = 5.6;

export const OVERLAY_LABELS: OverlayLabel[] = [
  {
    id: "auditorium",
    text: "Main Auditorium",
    at: [-1.7, 1.35, -1.0],
    opacity: (p) => bump(p, 4.8, 5.0, 6.6, 6.9),
  },
  ...RIPPLE_LABELS.map((text, k) => ({
    id: `ripple-${k}`,
    text,
    sub: "illustrative",
    at: RIPPLE_AT[k]!,
    opacity: (p: number) =>
      bump(p, 5.5, 5.95, 6.75, 7.1) * window01(local(p, 6), 0.62 + k * 0.06, 0.7 + k * 0.06),
  })),
  ...CHANNELS.map((text, k) => ({
    id: `channel-${k}`,
    text,
    // Alternate heights so the five labels never collide on narrow screens.
    at: [BEAM_X[k]!, BEAM_TOP + (k % 2) * 0.6, 0.2] as [number, number, number],
    opacity: (p: number) => {
      const vis = bump(p, 6.55, 6.95, 7.6, 8.0);
      const h = window01(local(p, 7), 0.06 + k * 0.07, 0.3 + k * 0.07) * vis;
      return window01(h, 0.85, 1);
    },
  })),
];

export { BUTTON_AT, RIPPLE_AT, BEAM_X };
