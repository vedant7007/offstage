"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Tabs as TabsPrimitive } from "radix-ui";
import { SlidingIndicator } from "./motion/transitions";

// The active underline glides between tabs (a shared view transition), so Tabs tracks the value
// itself and changes it inside startTransition. Controlled and uncontrolled use work as before.
const TabsState = React.createContext<{ value: string | undefined; name: string } | null>(null);

function Tabs({
  value: controlled,
  defaultValue,
  onValueChange,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  const [own, setOwn] = React.useState(defaultValue);
  const value = controlled ?? own;
  const name = `tabs-${React.useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const change = (next: string) => {
    React.startTransition(() => {
      setOwn(next);
      onValueChange?.(next);
    });
  };
  return (
    <TabsState.Provider value={{ value, name }}>
      <TabsPrimitive.Root value={value} onValueChange={change} {...props} />
    </TabsState.Provider>
  );
}

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

function TabsTrigger({ className, children, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  const state = React.useContext(TabsState);
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "relative inline-flex min-h-11 shrink-0 items-center gap-2 px-4 text-base font-medium text-fg-muted",
        "transition-colors duration-(--duration-slow) ease-out hover:text-fg",
        "data-[state=active]:text-fg",
        "[&_svg]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      {state && state.value === props.value ? (
        <SlidingIndicator
          name={state.name}
          className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-curtain forced-colors:bg-[CanvasText]"
        />
      ) : null}
    </TabsPrimitive.Trigger>
  );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content className={cn("pt-4", className)} {...props} />;
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
