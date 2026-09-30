// Every style the Live Stage and the phone dock use, in one place, so a restyle touches only this file.
// Colours are design tokens (src/styles/tokens.css); a state is always a word plus a colour.

import type { Tone } from "@/components/ui";
import type { NodeState } from "./use-stage";

export const NODE_STATE: Record<NodeState, { label: string; tone: Tone; ring: string }> = {
  idle: { label: "Idle", tone: "neutral", ring: "border-border" },
  thinking: {
    label: "Thinking",
    tone: "info",
    ring: "border-info shadow-[0_0_0_4px_var(--color-info-soft)]",
  },
  proposing: {
    label: "Proposing",
    tone: "agent",
    ring: "border-agent shadow-[0_0_0_4px_var(--color-agent-soft)]",
  },
  waiting: { label: "Waiting for approval", tone: "pending", ring: "border-pending" },
  done: { label: "Done", tone: "approved", ring: "border-approved" },
  failed: { label: "Failed", tone: "danger", ring: "border-danger" },
  paused: { label: "Paused", tone: "neutral", ring: "border-dashed border-border opacity-60" },
};

export const STAGE = {
  canvas: "h-[34rem] w-full overflow-hidden rounded-card border border-border bg-surface-sunken md:h-[40rem]",
  agent: "flex w-44 flex-col items-start gap-1.5 rounded-card border-2 bg-surface p-2.5 text-fg",
  centre: "w-52 border-curtain",
  box: "flex w-40 flex-col gap-0.5 border-2 border-border bg-surface-raised p-2 text-fg",
  boxShape: { gate: "rounded-full px-4", channel: "rounded-control", data: "rounded-card" },
  edge: "var(--color-border)",
  edgeActive: "var(--color-agent)",
  dot: "var(--color-agent)",
  grid: "var(--color-border)",
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
    "flex h-[26rem] w-full max-w-[17rem] flex-col overflow-hidden rounded-[2rem] border-[6px] border-fg bg-surface shadow-lg",
  header: "flex flex-col items-center gap-0.5 border-b border-border bg-surface-raised px-3 pt-2 pb-2",
  screen: "flex flex-1 flex-col gap-2 overflow-y-auto bg-surface-sunken p-2",
  bubble: "mr-4 rounded-card rounded-tl-none border border-border bg-surface p-2 text-xs",
} as const;
