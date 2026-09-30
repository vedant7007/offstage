"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { controlClass, useFieldControl } from "./field";

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  const wired = useFieldControl(props);
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(controlClass, "min-h-11 py-2", className)}
      {...props}
      {...wired}
    />
  );
}

export { Input };
