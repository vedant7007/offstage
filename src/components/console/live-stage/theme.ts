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
    "dark relative h-[34rem] w-full overflow-hidden rounded-card border border-white/10 bg-black text-fg shadow-[0_30px_60px_-30px_rgb(7_27_223/0.45)] md:h-[40rem]",
  spot: "pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_30%,rgb(26_47_251/0.22),transparent_65%),radial-gradient(120%_80%_at_50%_120%,rgb(7_27_223/0.45),transparent_60%)]",
  floor:
    "pointer-events-none absolute inset-x-0 bottom-0 h-1/2 [mask-image:linear-gradient(transparent,black_60%)] opacity-40 [background-image:linear-gradient(rgb(7_27_223)_1px,transparent_1px),linear-gradient(90deg,rgb(7_27_223)_1px,transparent_1px)] [background-size:48px_48px]",
  kicker: "pointer-events-none absolute top-3 left-4 z-10 kicker text-white/60",
  agent:
    "relative flex w-44 cursor-pointer flex-col items-start gap-1.5 rounded-card border bg-[#0a0b14] p-2.5 text-fg shadow-[0_12px_28px_-12px_rgb(0_0_0/0.8)] transition-[translate,border-color] duration-300 ease-[cubic-bezier(.4,0,.1,1)] motion-safe:hover:-translate-y-0.5",
  centre:
    "w-52 border-[#c1ff00] bg-[#071bdf] shadow-[0_0_0_4px_rgb(193_255_0/0.18),0_0_48px_rgb(26_47_251/0.6)]",
  glow: "pointer-events-none absolute -inset-6 -z-10 rounded-full",
  chip: "font-mono text-[0.6875rem] uppercase tracking-[0.08em]",
  box: "flex w-40 cursor-pointer flex-col gap-0.5 border border-white/12 bg-white/[0.04] p-2 text-fg transition-colors duration-300 hover:border-white/30",
  boxShape: { gate: "rounded-full px-4", channel: "rounded-full px-4", data: "rounded-card" },
  boxTitle: "text-sm font-medium",
  boxDetail: "font-mono text-[0.6875rem] text-fg-muted",
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

export const PHONE = {
  frame:
    "flex h-[26rem] w-full max-w-[17rem] flex-col overflow-hidden rounded-[2.25rem] border-[7px] border-black bg-surface shadow-[0_30px_60px_-30px_rgb(7_27_223/0.5)] ring-1 ring-border transition-[translate] duration-300 ease-[cubic-bezier(.4,0,.1,1)] motion-safe:hover:-translate-y-1",
  header: "flex flex-col items-center gap-0.5 border-b border-border bg-surface-raised px-3 pt-2 pb-2",
  name: "text-sm font-medium tracking-[-0.01em]",
  role: "font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-fg-muted",
  screen: "flex flex-1 flex-col gap-2 overflow-y-auto bg-surface-sunken p-2",
  bubble:
    "mr-4 rounded-[14px] rounded-tl-[4px] border border-border bg-surface p-2.5 text-xs shadow-[0_6px_14px_-10px_rgb(0_0_0/0.35)]",
  chip: "font-mono text-[0.625rem] uppercase tracking-[0.08em]",
} as const;
