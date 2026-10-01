import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/** Colour tones shared by badges, chips and alerts. Each maps to a checked token pair. */
export const toneClass = {
  neutral: "border-transparent bg-neutral-soft text-neutral-soft-fg",
  curtain: "border-transparent bg-curtain-soft text-curtain-soft-fg",
  agent: "border-transparent bg-agent-soft text-agent-soft-fg",
  approved: "border-transparent bg-approved-soft text-approved-soft-fg",
  pending: "border-transparent bg-pending-soft text-pending-soft-fg",
  info: "border-transparent bg-info-soft text-info-soft-fg",
  danger: "border-transparent bg-danger-soft text-danger-soft-fg",
  emergency: "border-emergency bg-emergency text-on-emergency",
  outline: "border-border-strong bg-transparent text-fg",
} as const;

export type Tone = keyof typeof toneClass;

const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-xs font-medium tracking-[0.02em] whitespace-nowrap [&_svg]:size-3.5 [&_svg]:shrink-0",
  { variants: { tone: toneClass }, defaultVariants: { tone: "neutral" } },
);

/** Small non-interactive label. For proposal and action states use StatusBadge instead. */
function Badge({
  className,
  tone,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span data-slot="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

export { Badge, badgeVariants };
