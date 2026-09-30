"use client";

import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import { badgeVariants, type Tone } from "./badge";
import { Tooltip } from "./tooltip";

const TIERS = {
  T0: "neutral",
  T1: "info",
  T2: "pending",
  T3: "curtain",
} satisfies Record<string, Tone>;

export type TierKind = keyof typeof TIERS;

/** Risk tier with its meaning available to screen readers and on hover or focus. */
export function TierBadge({
  tier,
  showMeaning = false,
  className,
}: {
  tier: TierKind;
  showMeaning?: boolean;
  className?: string;
}) {
  const t = useT();
  const meaning = t(`tier.${tier}`);
  const badge = (
    <span
      data-slot="tier-badge"
      tabIndex={showMeaning ? undefined : 0}
      className={cn(
        badgeVariants({ tone: TIERS[tier] }),
        "font-mono",
        // With the meaning spelled out the text can be long, so let it wrap on narrow screens.
        showMeaning && "w-auto max-w-full items-start rounded-control py-1 whitespace-normal",
        className,
      )}
    >
      <span aria-hidden>{tier}</span>
      <span className="sr-only">{t("tier.label", { tier })}: </span>
      {showMeaning ? (
        <span className="font-sans font-medium">{meaning}</span>
      ) : (
        <span className="sr-only">{meaning}</span>
      )}
    </span>
  );
  return showMeaning ? badge : <Tooltip content={meaning}>{badge}</Tooltip>;
}
