"use client";

import * as React from "react";
import { cn } from "cn";
import { controlClass, useFieldControl } from "./field";

function Textarea({ className, rows = 4, ...props }: React.ComponentProps<"textarea">) {
  const wired = useFieldControl(props);
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(controlClass, "min-h-24 resize-y py-2.5", className)}
      {...props}
      {...wired}
    />
  );
}

export { Textarea };
