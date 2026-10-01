"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Dialog as SheetPrimitive } from "radix-ui";
import { CornerClose, DialogOverlay } from "./dialog";

const Sheet = SheetPrimitive.Root;
const SheetTrigger = SheetPrimitive.Trigger;
const SheetClose = SheetPrimitive.Close;

const SIDES = {
  bottom:
    "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-card border-t data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
  right:
    "inset-y-0 right-0 h-dvh w-full max-w-md border-l data-open:slide-in-from-right data-closed:slide-out-to-right",
  // Bottom sheet on phones, side panel from md up.
  responsive: cn(
    "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-card border-t data-open:slide-in-from-bottom data-closed:slide-out-to-bottom",
    "md:inset-x-auto md:inset-y-0 md:right-0 md:h-dvh md:max-h-none md:w-full md:max-w-md md:rounded-none md:border-t-0 md:border-l",
    "md:data-open:slide-in-from-right md:data-closed:slide-out-to-right",
  ),
} as const;

type SheetContentProps = React.ComponentProps<typeof SheetPrimitive.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
  side?: keyof typeof SIDES;
};

function SheetContent({
  title,
  description,
  footer,
  side = "responsive",
  className,
  children,
  ...props
}: SheetContentProps) {
  return (
    <SheetPrimitive.Portal>
      <DialogOverlay />
      <SheetPrimitive.Content
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed z-(--z-modal) flex flex-col border-border bg-surface-raised text-fg shadow-2xl",
          "data-open:animate-in data-closed:animate-out duration-(--duration-slow) ease-out",
          "pb-[env(safe-area-inset-bottom)]",
          SIDES[side],
          className,
        )}
        {...props}
      >
        {side !== "right" ? (
          <div
            aria-hidden
            className={cn(
              "mx-auto mt-2 h-1.5 w-10 rounded-full bg-border-strong",
              side === "responsive" && "md:hidden",
            )}
          />
        ) : null}
        <div className="flex flex-col gap-1 p-6 pr-14">
          <SheetPrimitive.Title className="text-xl font-medium tracking-[-0.02em]">
            {title}
          </SheetPrimitive.Title>
          {description ? (
            <SheetPrimitive.Description className="text-sm text-fg-muted">
              {description}
            </SheetPrimitive.Description>
          ) : null}
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
        {footer ? <div className="flex flex-col gap-2 border-t border-border p-4">{footer}</div> : null}
        <CornerClose />
      </SheetPrimitive.Content>
    </SheetPrimitive.Portal>
  );
}

export { Sheet, SheetTrigger, SheetClose, SheetContent };
