// Every style the Live Stage and the phone dock use, in one place, so a restyle touches only this file.
// Colours are design tokens (src/styles/tokens.css); a state is always a word plus a colour.

import type { Tone } from "@/components/ui";
import type { NodeState } from "./use-stage";

// The stage is always ink (it carries the `dark` class, so tokens inside it are the ink set in both themes).
// `glow` is a soft halo behind a busy node; it pulses unless the viewer asked for less motion.
export const NODE_STATE: Record<NodeState, { label: string; tone: Tone; ring: string; glow?: string }> = {
  idle: { label: "Idle", tone: "neutral", ring: "border-white/15" },
  thinking: {
    label: "Thinking",
    tone: "info",
    ring: "border-info",
    glow: "bg-[radial-gradient(closest-side,rgb(26_47_251/0.55),transparent)]",
  },
  proposing: {
    label: "Proposing",
    tone: "agent",
    ring: "border-agent",
    glow: "bg-[radial-gradient(closest-side,rgb(136_50_247/0.5),transparent)]",
  },
  waiting: { label: "Waiting for approval", tone: "pending", ring: "border-pending" },
  done: { label: "Done", tone: "approved", ring: "border-approved/70" },
  failed: { label: "Failed", tone: "danger", ring: "border-danger" },
  paused: { label: "Paused", tone: "neutral", ring: "border-dashed border-white/20 opacity-60" },
};

const LIME = "#c1ff00";

export const STAGE = {
  /** Black stage, a faint blue-dark grid floor and a soft spotlight from above. */
  canvas:
    "dark relative h-[20rem] w-full overflow-hidden rounded-card border border-white/10 bg-black text-fg shadow-[0_30px_60px_-30px_rgb(7_27_223/0.45)] sm:h-[30rem] md:h-[44rem]",
  spot: "pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_30%,rgb(26_47_251/0.22),transparent_65%),radial-gradient(120%_80%_at_50%_120%,rgb(7_27_223/0.45),transparent_60%)]",
  floor:
    "pointer-events-none absolute inset-x-0 bottom-0 h-1/2 [mask-image:linear-gradient(transparent,black_60%)] opacity-40 [background-image:linear-gradient(rgb(7_27_223)_1px,transparent_1px),linear-gradient(90deg,rgb(7_27_223)_1px,transparent_1px)] [background-size:48px_48px]",
  kicker: "pointer-events-none absolute top-4 left-5 z-10 kicker text-white/60",
  legend:
    "pointer-events-none absolute bottom-4 left-5 z-10 hidden items-center gap-4 font-mono text-[0.6875rem] tracking-[0.06em] text-white/55 md:flex",
  // Names read in white; the purple avatar already says "agent".
  agent:
    "relative flex w-40 cursor-pointer flex-col items-start gap-2 rounded-card border bg-[#0b0c16] p-3 text-sm text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.06),0_12px_28px_-12px_rgb(0_0_0/0.8)] transition-[translate,border-color] duration-300 ease-[cubic-bezier(.4,0,.1,1)] motion-safe:hover:-translate-y-0.5 [&_.text-agent-text]:text-fg",
  centre:
    "w-48 border-[#c1ff00] bg-[#060a2a] text-base shadow-[0_0_0_4px_rgb(193_255_0/0.14),0_0_60px_rgb(26_47_251/0.55)]",
  glow: "pointer-events-none absolute -inset-6 -z-10 rounded-full",
  chip: "font-mono text-xs uppercase tracking-[0.06em]",
  box: "flex w-36 cursor-pointer flex-col gap-1 border border-white/12 bg-white/[0.04] px-3 py-2.5 text-fg transition-colors duration-300 hover:border-white/35",
  boxShape: { gate: "rounded-card", channel: "rounded-card", data: "rounded-card" },
  /** A human gate with proposals waiting glows gold, so the decision point is obvious. */
  gateWaiting: "border-pending/70 bg-pending/[0.08] shadow-[0_0_32px_-8px_rgb(255_228_94/0.45)]",
  boxKicker: "font-mono text-[0.625rem] uppercase tracking-[0.1em] text-white/50",
  boxTitle: "text-sm font-medium",
  boxDetail: "font-mono text-xs text-fg-muted",
  edge: "rgb(255 255 255 / 0.16)",
  edgeActive: LIME,
  dot: LIME,
} as const;

export const LOG_TONE = {
  agent: "text-agent-text",
  human: "text-curtain-text",
  system: "text-fg-muted",
  warn: "text-danger-text",
} as const;

export const DOCK_CHANNEL: Record<string, { label: string; tone: Tone }> = {
  in_app: { label: "In-app", tone: "neutral" },
  email: { label: "Email", tone: "info" },
  sms: { label: "SMS", tone: "info" },
  whatsapp: { label: "WhatsApp", tone: "approved" },
  telegram: { label: "Telegram", tone: "agent" },
  task: { label: "Task", tone: "pending" },
};

/** Always a word next to the tick, never the tick alone. */
export const DOCK_STATUS: Record<string, { tick: string; label: string; className: string }> = {
  queued: { tick: "○", label: "Queued", className: "text-fg-muted" },
  delivered: { tick: "✓✓", label: "Delivered", className: "text-approved-text" },
  delivered_mock: { tick: "✓", label: "Delivered (mock)", className: "text-fg-muted" },
  read: { tick: "✓✓", label: "Read", className: "text-info-text" },
  failed: { tick: "✕", label: "Failed", className: "text-danger-text" },
};

/** "See what they see": three phones on the same ink stage as the Live Stage. */
export const PHONE = {
  band: "dark relative isolate overflow-hidden rounded-card border border-white/10 bg-black text-fg shadow-[0_30px_60px_-30px_rgb(7_27_223/0.45)]",
  bandSpot:
    "pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(60%_50%_at_50%_0%,rgb(26_47_251/0.28),transparent_70%),radial-gradient(90%_60%_at_50%_120%,rgb(7_27_223/0.4),transparent_60%)]",
  bandFloor:
    "pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-1/2 [mask-image:linear-gradient(transparent,black_70%)] opacity-35 [background-image:linear-gradient(rgb(7_27_223)_1px,transparent_1px),linear-gradient(90deg,rgb(7_27_223)_1px,transparent_1px)] [background-size:48px_48px]",
  head: "flex items-start justify-between gap-4 px-5 py-4 sm:px-6",
  grid: "grid justify-items-center gap-x-6 gap-y-14 border-t border-white/10 px-5 pt-10 pb-14 sm:grid-cols-2 lg:grid-cols-3",
  device: "relative w-full max-w-[17.5rem]",
  // Titanium: a cool metal gradient with a bright inner edge, then the black bezel around the screen.
  frame:
    "relative rounded-[2.9rem] bg-[linear-gradient(145deg,#5b5f69,#1d1f25_30%,#2a2d35_68%,#62666f)] p-[3px] shadow-[inset_0_1px_1px_rgb(255_255_255/0.35),0_40px_70px_-30px_rgb(7_27_223/0.7),0_18px_30px_-18px_rgb(0_0_0/0.9)] transition-[translate] duration-300 ease-[cubic-bezier(.4,0,.1,1)] motion-safe:hover:-translate-y-1",
  bezel: "rounded-[2.75rem] bg-black p-[7px]",
  screen: "relative flex h-[32rem] flex-col overflow-hidden rounded-[2.3rem] bg-[#08090d] text-white",
  island:
    "absolute top-2 left-1/2 z-30 h-[1.55rem] w-[5.5rem] -translate-x-1/2 rounded-full bg-black shadow-[inset_0_0_0_1px_rgb(255_255_255/0.05)]",
  status:
    "relative z-20 flex h-10 shrink-0 items-center justify-between px-6 pt-1 text-[0.75rem] font-semibold tabular-nums [&_svg]:size-3.5",
  reflection:
    "pointer-events-none absolute inset-0 z-40 rounded-[2.3rem] bg-[linear-gradient(120deg,rgb(255_255_255/0.09),transparent_30%,transparent_72%,rgb(255_255_255/0.04))]",
  floor:
    "pointer-events-none absolute -bottom-8 left-1/2 h-10 w-4/5 -translate-x-1/2 rounded-[50%] bg-[radial-gradient(closest-side,rgb(26_47_251/0.5),transparent)] blur-md",
  appbar: "relative z-20 flex shrink-0 items-center gap-2.5 border-b border-white/10 px-4 pt-1 pb-3",
  avatar:
    "flex size-9 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,#1a2ffb,#8832f7)] text-xs font-semibold tracking-[0.02em] text-white",
  name: "truncate text-sm font-medium tracking-[-0.01em]",
  role: "w-fit rounded-full bg-white/10 px-2 py-px font-mono text-[0.625rem] uppercase tracking-[0.08em] text-white/80",
  // Scrolls, but no native scrollbar; the top edge fades so messages slide out under the app bar.
  list: "flex flex-1 flex-col gap-2.5 overflow-y-auto px-3 pt-4 pb-6 [mask-image:linear-gradient(to_bottom,transparent,black_24px)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
  meta: "mt-1.5 flex items-center justify-end gap-1.5 font-mono text-[0.625rem] tabular-nums text-white/75",
  channel:
    "mb-1 flex items-center gap-1 font-mono text-[0.625rem] uppercase tracking-[0.08em] text-white/75 [&_svg]:size-3",
  banner:
    "absolute inset-x-2 top-11 z-30 flex items-start gap-2.5 rounded-2xl border border-white/10 bg-[#1b1c22]/95 p-2.5 shadow-[0_18px_30px_-12px_rgb(0_0_0/0.9)]",
} as const;

/** Each channel looks like its own app: WhatsApp green, Telegram blue, SMS grey, an inbox row, a notification. */
export const BUBBLE: Record<string, string> = {
  whatsapp: "mr-6 rounded-[1.1rem] rounded-tl-[0.35rem] bg-[#0f3b30] px-3 py-2",
  telegram: "mr-6 rounded-[1.1rem] rounded-tl-[0.35rem] bg-[#173659] px-3 py-2",
  sms: "mr-6 rounded-[1.1rem] rounded-tl-[0.35rem] bg-[#2a2b31] px-3 py-2",
  email: "rounded-xl border border-white/10 bg-white/[0.06] p-3",
  in_app: "rounded-2xl border border-white/10 bg-white/[0.09] p-3",
  task: "rounded-xl border border-dashed border-white/25 bg-white/[0.03] p-3",
};
