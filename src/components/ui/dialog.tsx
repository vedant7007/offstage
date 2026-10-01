"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Dialog as DialogPrimitive } from "radix-ui";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      className={cn(
        "fixed inset-0 z-(--z-overlay) bg-overlay backdrop-blur-[2px]",
        "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className,
      )}
      {...props}
    />
  );
}

/** Close button in the corner, labelled for screen readers. */
function CornerClose() {
  const t = useT();
  return (
    <DialogPrimitive.Close
      aria-label={t("common.close")}
      className="absolute top-3 right-3 flex size-11 items-center justify-center rounded-full text-fg-muted transition-colors duration-(--duration-fast) ease-out hover:bg-surface-sunken hover:text-fg"
    >
      <X aria-hidden className="size-5" />
    </DialogPrimitive.Close>
  );
}

type DialogContentProps = React.ComponentProps<typeof DialogPrimitive.Content> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
};

/** Centred modal. Title is required so the dialog always has an accessible name. */
function DialogContent({ title, description, footer, className, children, ...props }: DialogContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogOverlay />
      <DialogPrimitive.Content
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed top-1/2 left-1/2 z-(--z-modal) flex max-h-[85dvh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 flex-col",
          "rounded-card border border-border bg-surface-raised text-fg shadow-2xl",
          "data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          "duration-(--duration-base)",
          className,
        )}
        {...props}
      >
        <div className="flex flex-col gap-1 p-6 pr-14">
          <DialogPrimitive.Title className="text-xl font-medium tracking-[-0.02em]">
            {title}
          </DialogPrimitive.Title>
          {description ? (
            <DialogPrimitive.Description className="text-sm text-fg-muted">
              {description}
            </DialogPrimitive.Description>
          ) : null}
        </div>
        {children ? <div className="overflow-y-auto px-6 pb-2">{children}</div> : null}
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-border p-4 sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
        <CornerClose />
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Dialog, DialogTrigger, DialogClose, DialogContent, DialogOverlay, CornerClose };
