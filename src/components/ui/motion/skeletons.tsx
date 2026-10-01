import * as React from "react";
import { cn } from "@/lib/utils";
import { Skeleton } from "../feedback";

/** Bars that sit on the real text-sm rhythm: 10px bars, 12px gaps (22px per line). The last line is short. */
function SkeletonText({ lines = 3, className }: { lines?: number; className?: string }) {
  return (
    <div aria-hidden className={cn("flex flex-col gap-3 py-1.5", className)}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          className="h-2.5 rounded-full"
          style={{ width: lines > 1 && i === lines - 1 ? "64%" : i % 2 ? "92%" : "100%" }}
        />
      ))}
    </div>
  );
}

/** A card-shaped placeholder: title bar, two lines, a footer chip. Matches Card padding and radius. */
function SkeletonCard({ className }: { className?: string }) {
  return (
    <div aria-hidden className={cn("rounded-card border border-border bg-surface p-5 md:p-6", className)}>
      <Skeleton className="h-4 w-2/5 rounded-full" />
      <SkeletonText lines={2} className="mt-3" />
      <Skeleton className="mt-6 h-6 w-20 rounded-full" />
    </div>
  );
}

/** One table row placeholder. `cols` are grid track sizes matching the real columns, such as ["2fr", "1fr", "6rem"]. */
function SkeletonRow({ cols, className }: { cols: string[]; className?: string }) {
  return (
    <div
      aria-hidden
      className={cn("grid min-h-11 items-center gap-4 border-b border-border px-4 py-3", className)}
      style={{ gridTemplateColumns: cols.join(" ") }}
    >
      {cols.map((_, i) => (
        <Skeleton key={i} className={cn("h-2.5 rounded-full", i > 0 && "w-3/4")} />
      ))}
    </div>
  );
}

export { SkeletonText, SkeletonCard, SkeletonRow };
