"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Tooltip as TooltipPrimitive } from "radix-ui";

/**
 * Extra hint on hover or keyboard focus. Touch screens do not show tooltips reliably,
 * so never put anything essential only in a tooltip.
 */
function Tooltip({
  content,
  side = "top",
  delay,
  children,
}: {
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  /** Open delay in ms. Default: the provider's 300. */
  delay?: number;
  children: React.ReactElement;
}) {
  return (
    <TooltipPrimitive.Root delayDuration={delay}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-(--z-tooltip) max-w-64 rounded-[0.625rem] bg-fg px-3 py-1.5 text-sm font-medium text-bg depth-3",
            "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-[0.97] data-[state=delayed-open]:duration-(--duration-base) data-[state=delayed-open]:ease-(--ease-out-expo)",
            "data-closed:animate-out data-closed:fade-out-0 data-closed:duration-(--duration-fast)",
          )}
        >
          {content}
          <TooltipPrimitive.Arrow className="fill-fg" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

const TooltipProvider = TooltipPrimitive.Provider;

export { Tooltip, TooltipProvider };
