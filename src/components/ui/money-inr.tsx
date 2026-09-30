import { cn } from "cn";
import { formatInr, formatInrCompact } from "@/lib/format";

type MoneyInrProps = {
  /** Whole rupees, as stored. */
  amount: number;
  /** Short form like ₹3L for tight spaces. The exact figure stays available to screen readers. */
  compact?: boolean;
  className?: string;
};

/** Rupee amount with Indian digit grouping and tabular figures. */
function MoneyInr({ amount, compact = false, className }: MoneyInrProps) {
  const exact = formatInr(amount);
  return (
    <data value={amount} className={cn("tabular-nums", className)} title={compact ? exact : undefined}>
      {compact ? (
        <>
          <span aria-hidden>{formatInrCompact(amount)}</span>
          <span className="sr-only">{exact}</span>
        </>
      ) : (
        exact
      )}
    </data>
  );
}

export { MoneyInr };
