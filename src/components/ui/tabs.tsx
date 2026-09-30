"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Tabs as TabsPrimitive } from "radix-ui";

const Tabs = TabsPrimitive.Root;

/** Scrolls sideways on narrow screens instead of wrapping. Arrow keys move between tabs. */
function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        "flex w-full gap-1 overflow-x-auto border-b border-border [scrollbar-width:none]",
        className,
      )}
      {...props}
    />
  );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px inline-flex min-h-11 shrink-0 items-center gap-2 border-b-2 border-transparent px-4 text-base font-medium text-fg-muted",
        "transition-colors duration-(--duration-fast) ease-out hover:text-fg",
        "data-[state=active]:border-curtain data-[state=active]:font-semibold data-[state=active]:text-fg",
        "[&_svg]:size-4",
        className,
      )}
      {...props}
    />
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-4", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
