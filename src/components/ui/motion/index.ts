// Premium kit: motion and depth primitives. CSS half in src/styles/motion.css and theme.css (utilities
// depth-1/2/3, edge, edge-live, press, lift, spot, spot-edge, grain, text-fade, text-hero, text-section,
// measure, measure-lede, measure-tight). Usage: docs/design-tokens.md, "Premium kit".

export { useReducedMotion, prefersReducedMotion } from "./reduced-motion";
export { observeOnce } from "./observe";
export { PointerFx } from "./pointer-fx";
export { Reveal, type RevealProps } from "./reveal";
export { TextReveal, type TextRevealProps } from "./text-reveal";
export { NumberTicker, type NumberTickerProps } from "./number-ticker";
export {
  Magnetic,
  Tilt,
  SpotlightCard,
  LivePulse,
  ConfirmBurst,
  Backdrop,
  Kicker,
  vtAnchor,
  type MagneticProps,
  type TiltProps,
} from "./bits";
export { PageTransition, SlidingIndicator, Morph, NAV_FORWARD, NAV_BACK } from "./transitions";
export { SkeletonText, SkeletonCard, SkeletonRow } from "./skeletons";

/** Everything in the kit, for a showcase page: name, kind and a one-line use. */
export const PREMIUM_KIT = [
  { name: "Reveal", kind: "component", use: "Fade or rise once on enter; index staggers a list" },
  { name: "TextReveal", kind: "component", use: "Masked word reveal for the one signature headline" },
  { name: "NumberTicker", kind: "component", use: "Count up on enter, or roll digits for live values" },
  {
    name: "Magnetic",
    kind: "component",
    use: "Magnetic pull on the one primary action (or Button magnetic)",
  },
  { name: "SpotlightCard", kind: "component", use: "Cursor spotlight and lit border on interactive cards" },
  { name: "Tilt", kind: "component", use: "Leaning pass with glare; one sheen sweep on touch" },
  { name: "LivePulse", kind: "component", use: "Pulsing dot, always next to the word Live" },
  { name: "ConfirmBurst", kind: "component", use: "Rays on approve and successful check-in" },
  { name: "Backdrop", kind: "component", use: "Ambient lights, faint grid, static grain; stage variant" },
  { name: "SkeletonText / SkeletonCard / SkeletonRow", kind: "component", use: "Content-shaped loading" },
  {
    name: "PageTransition",
    kind: "component",
    use: "Route crossfade, or directional slide with NAV_FORWARD",
  },
  { name: "SlidingIndicator", kind: "component", use: "Active pill or underline that glides between items" },
  { name: "Morph", kind: "component", use: "Shared element morph between two routes" },
  { name: "Kicker", kind: "component", use: "Mono uppercase label above a heading, with a short rule" },
  { name: "vtAnchor", kind: "helper", use: "Keeps chrome still during route transitions" },
  { name: "depth-1 / depth-2 / depth-3", kind: "utility", use: "Inner highlight plus soft long shadow" },
  { name: "edge / edge-live", kind: "utility", use: "Gradient hairline; the one moving border per page" },
  { name: "press", kind: "utility", use: "Spring press on buttons, chips, persona cards" },
  { name: "lift", kind: "utility", use: "2px hover lift, border firms" },
  { name: "spot / spot-edge", kind: "utility", use: "Spotlight on any element, no component needed" },
  { name: "grain", kind: "utility", use: "Static grain on a positioned surface" },
  {
    name: "text-fade / text-hero / text-section",
    kind: "utility",
    use: "Hero tone fade and fluid display sizes",
  },
  { name: "measure / measure-lede / measure-tight", kind: "utility", use: "65ch, 52ch, 44ch reading widths" },
] as const;
