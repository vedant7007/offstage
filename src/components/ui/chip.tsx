import * as React from "react";
import { cn } from "@/lib/utils";
import { Check } from "lucide-react";
import { toneClass, type Tone } from "./badge";

const chipBase = cn(
  "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border-[1.5px] px-4 text-sm font-medium whitespace-nowrap md:min-h-9",
  "[&_svg]:size-4 [&_svg]:shrink-0",
);

type ChipProps = Omit<React.ComponentProps<"button">, "type"> & {
  /** Toggle state for filters. Announced as pressed or not pressed. */
  selected?: boolean;
  icon?: React.ReactNode;
  count?: number;
};

/** Toggleable pill for filters and quick choices. A check mark shows selection, not just colour. */
function Chip({ selected = false, icon, count, className, children, ...props }: ChipProps) {
  return (
    <button
      type="button"
      data-slot="chip"
      aria-pressed={selected}
      className={cn(
        chipBase,
        "press",
        selected
          ? "border-fg bg-fg text-bg"
          : "border-border-strong bg-transparent text-fg hover:border-fg hover:bg-surface-raised",
        className,
      )}
      {...props}
    >
      {selected ? <Check aria-hidden /> : icon}
      {children}
      {count !== undefined ? (
        <span className="font-mono text-xs tabular-nums opacity-80">{count}</span>
      ) : null}
    </button>
  );
}

/** Non-interactive pill with an icon, used for impact and evidence. */
function InfoChip({
  tone = "neutral",
  icon,
  className,
  children,
  ...props
}: React.ComponentProps<"span"> & { tone?: Tone; icon?: React.ReactNode }) {
  return (
    <span
      data-slot="info-chip"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium [&_svg]:size-4 [&_svg]:shrink-0",
        toneClass[tone],
        className,
      )}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}

export { Chip, InfoChip };
