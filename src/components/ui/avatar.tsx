"use client";

import * as React from "react";
import { cn } from "cn";
import { Avatar as AvatarPrimitive } from "radix-ui";

const SIZES = { sm: "size-8 text-xs", md: "size-10 text-sm", lg: "size-14 text-lg" } as const;

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

type AvatarProps = {
  /** Full name: used for the alt text and the initials fallback. */
  name: string;
  src?: string;
  size?: keyof typeof SIZES;
  /** Set when a visible name sits right next to the avatar, so it is not read twice. */
  decorative?: boolean;
  className?: string;
};

/** A person's photo, falling back to their initials. */
function Avatar({ name, src, size = "md", decorative = false, className }: AvatarProps) {
  return (
    <AvatarPrimitive.Root
      data-slot="avatar"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : name}
      aria-hidden={decorative || undefined}
      className={cn("relative inline-flex shrink-0 overflow-hidden rounded-full border border-border bg-surface-sunken", SIZES[size], className)}
    >
      {src ? <AvatarPrimitive.Image src={src} alt="" className="size-full object-cover" /> : null}
      <AvatarPrimitive.Fallback className="flex size-full items-center justify-center font-semibold text-fg-muted">
        {initials(name)}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  );
}

export { Avatar };
