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
  children,
}: {
  content: React.ReactNode;
  side?: "top" | "bottom" | "left" | "right";
  children: React.ReactElement;
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className={cn(
            "z-(--z-tooltip) max-w-64 rounded-control bg-fg px-3 py-1.5 text-sm text-bg",
            "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
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
