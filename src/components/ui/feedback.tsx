"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Progress as ProgressPrimitive } from "radix-ui";
import { Check } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

/**
 * Placeholder shape while content loads. Put aria-busy on the region it stands in for. A soft band sweeps
 * across it, and it stays invisible for the first 300ms so fast loads never flash (motion.css).
 * For content-shaped placeholders use SkeletonText, SkeletonCard and SkeletonRow.
 */
function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      aria-hidden
      data-slot="skeleton"
      className={cn("rounded-control bg-[color-mix(in_srgb,var(--fg)_9%,transparent)]", className)}
      {...props}
    />
  );
}

type ProgressProps = {
  label: React.ReactNode;
  value: number;
  max?: number;
  /** Show the percentage next to the label. */
  showValue?: boolean;
  tone?: "curtain" | "agent" | "approved" | "pending";
  className?: string;
};

const barTone = { curtain: "bg-curtain", agent: "bg-agent", approved: "bg-approved", pending: "bg-pending" };

function Progress({ label, value, max = 100, showValue = true, tone = "curtain", className }: ProgressProps) {
  const t = useT();
  const labelId = React.useId();
  const percent = Math.round((Math.min(Math.max(value, 0), max) / max) * 100);
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <div className="flex items-baseline justify-between gap-2 text-sm">
        <span id={labelId} className="font-medium">
          {label}
        </span>
        {showValue ? <span className="tabular-nums text-fg-muted">{percent}%</span> : null}
      </div>
      <ProgressPrimitive.Root
        aria-labelledby={labelId}
        value={value}
        max={max}
        getValueLabel={() => t("progress.value", { value: percent })}
        className="h-2.5 w-full overflow-hidden rounded-full border border-border-strong bg-surface-sunken"
      >
        <ProgressPrimitive.Indicator
          className={cn(
            "h-full w-full rounded-full transition-[translate] duration-(--duration-slower) ease-(--ease-in-out)",
            barTone[tone],
          )}
          style={{ translate: `${percent - 100}% 0` }}
        />
      </ProgressPrimitive.Root>
    </div>
  );
}

type StepperProps = {
  steps: React.ReactNode[];
  /** Zero-based index of the current step. */
  current: number;
  className?: string;
};

/** Numbered steps for multi-step forms. Done, current and upcoming differ by icon and weight, not just colour. */
function Stepper({ steps, current, className }: StepperProps) {
  const t = useT();
  return (
    <nav aria-label={t("stepper.label")} className={className}>
      <p className="mb-2 text-sm text-fg-muted">
        {t("stepper.step", { current: current + 1, total: steps.length })}
        {/* Phones hide the step names in the row below, so name the current one here. */}
        <span className="font-semibold text-fg sm:hidden" aria-hidden>
          {": "}
          {steps[current]}
        </span>
      </p>
      <ol className="flex items-start gap-2">
        {steps.map((step, i) => {
          const state = i < current ? "complete" : i === current ? "current" : "upcoming";
          return (
            <li
              key={i}
              aria-current={state === "current" ? "step" : undefined}
              className="flex flex-1 flex-col gap-1.5"
            >
              {/* The fill grows from the left as the step is reached (scale only, no width animation) */}
              <span className="h-1.5 overflow-hidden rounded-full bg-border" aria-hidden>
                <span
                  className={cn(
                    "block h-full origin-left rounded-full bg-curtain transition-[scale] duration-(--duration-slower) ease-(--ease-in-out)",
                    state === "upcoming" ? "scale-x-0" : "scale-x-100",
                  )}
                />
              </span>
              <span className="flex items-center gap-1.5 text-xs">
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                    state === "complete" && "border-curtain bg-curtain text-on-curtain",
                    state === "current" && "border-2 border-curtain text-curtain-text",
                    state === "upcoming" && "border-border-strong text-fg-muted",
                  )}
                >
                  {state === "complete" ? <Check className="size-3" strokeWidth={3} /> : i + 1}
                </span>
                <span
                  className={cn(
                    "hidden sm:inline",
                    state === "current" ? "font-semibold text-fg" : "text-fg-muted",
                  )}
                >
                  {step}
                </span>
                <span className="sr-only sm:hidden">{step}</span>
                <span className="sr-only">, {t(`stepper.${state}`)}</span>
              </span>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { Skeleton, Progress, Stepper };
