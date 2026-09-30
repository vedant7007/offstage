"use client";

import { cn } from "@/lib/utils";
import {
  Check,
  CheckCheck,
  Clock,
  FlaskConical,
  Hourglass,
  LoaderCircle,
  PencilLine,
  Siren,
  TimerOff,
  TriangleAlert,
  Undo2,
  X,
  type LucideIcon,
} from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { badgeVariants, type Tone } from "./badge";

/**
 * The one place that decides how a state looks, everywhere in the product.
 * Every state has an icon and a word, so colour is never the only signal.
 */
const STATUS = {
  pending: { tone: "pending", icon: Clock },
  approved: { tone: "approved", icon: Check },
  executed: { tone: "info", icon: CheckCheck },
  rejected: { tone: "neutral", icon: X },
  stale: { tone: "neutral", icon: Hourglass },
  undone: { tone: "neutral", icon: Undo2 },
  simulated: { tone: "agent", icon: FlaskConical },
  emergency: { tone: "emergency", icon: Siren },
  // The remaining proposal lifecycle states, so every ProposalStatus has a look.
  draft: { tone: "outline", icon: PencilLine },
  executing: { tone: "info", icon: LoaderCircle },
  failed: { tone: "danger", icon: TriangleAlert },
  expired: { tone: "neutral", icon: TimerOff },
} satisfies Record<string, { tone: Tone; icon: LucideIcon }>;

export type StatusKind = keyof typeof STATUS;
export const STATUS_KINDS = Object.keys(STATUS) as StatusKind[];

export function StatusBadge({ status, className }: { status: StatusKind; className?: string }) {
  const t = useT();
  const { tone, icon: Icon } = STATUS[status];
  return (
    <span
      data-slot="status-badge"
      data-status={status}
      className={cn(
        badgeVariants({ tone }),
        status === "simulated" && "border-dashed border-agent",
        status === "emergency" && "uppercase tracking-wide",
        className,
      )}
    >
      <Icon aria-hidden className={cn(status === "executing" && "animate-spin")} />
      {t(`status.${status}`)}
    </span>
  );
}
