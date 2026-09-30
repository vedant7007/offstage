"use client";

import * as React from "react";
import { cn } from "cn";
import { Select as SelectPrimitive } from "radix-ui";
import { Check, ChevronDown } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { controlClass, useFieldControl } from "./field";

type Option = { value: string; label: React.ReactNode; disabled?: boolean };

type SelectProps = Omit<React.ComponentProps<typeof SelectPrimitive.Root>, "children"> & {
  options: Option[];
  placeholder?: string;
  id?: string;
  className?: string;
  "aria-label"?: string;
};

/** Single choice from a list. Wrap in Field for a visible label. */
function Select({ options, placeholder, id, className, "aria-label": ariaLabel, ...props }: SelectProps) {
  const t = useT();
  const wired = useFieldControl({ id, required: props.required });
  return (
    <SelectPrimitive.Root {...props}>
      <SelectPrimitive.Trigger
        data-slot="select-trigger"
        aria-label={ariaLabel}
        {...wired}
        className={cn(
          controlClass,
          "flex min-h-11 items-center justify-between gap-2 py-2 text-left data-placeholder:text-fg-muted",
          className,
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder ?? t("common.selectPlaceholder")} />
        <SelectPrimitive.Icon asChild>
          <ChevronDown aria-hidden className="size-4 text-fg-muted" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          position="popper"
          sideOffset={4}
          className={cn(
            "z-(--z-overlay) max-h-(--radix-select-content-available-height) min-w-(--radix-select-trigger-width) overflow-hidden",
            "rounded-control border border-border bg-surface-raised text-fg shadow-lg",
            "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          )}
        >
          <SelectPrimitive.Viewport className="p-1">
            {options.map((option) => (
              <SelectPrimitive.Item
                key={option.value}
                value={option.value}
                disabled={option.disabled}
                className={cn(
                  "relative flex min-h-11 cursor-default items-center rounded-sm py-2 pr-9 pl-3 text-base outline-none select-none",
                  "data-highlighted:bg-surface-sunken data-disabled:opacity-55",
                )}
              >
                <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
                <SelectPrimitive.ItemIndicator className="absolute right-3 inline-flex">
                  <Check aria-hidden className="size-4 text-curtain-text" />
                </SelectPrimitive.ItemIndicator>
              </SelectPrimitive.Item>
            ))}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

export { Select, type Option as SelectOption };
