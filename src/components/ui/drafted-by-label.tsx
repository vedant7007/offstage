"use client";

import { cn } from "@/lib/utils";
import { PenLine } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

/** Keys match Role in src/contracts. */
export type RoleKey =
  | "owner"
  | "organizer"
  | "lead"
  | "faculty_approver"
  | "volunteer"
  | "attendee"
  | "speaker"
  | "sponsor"
  | "viewer";

type DraftedByLabelProps = {
  /** The role that approved it. Leave empty while the message still waits for approval. */
  approvedBy?: RoleKey;
  className?: string;
};

/** Required on every automated message shown to a person: who drafted it and who approved it. */
function DraftedByLabel({ approvedBy, className }: DraftedByLabelProps) {
  const t = useT();
  return (
    <p
      data-slot="drafted-by"
      className={cn("inline-flex items-center gap-1.5 text-xs text-fg-muted", className)}
    >
      <PenLine aria-hidden className="size-3.5 shrink-0" />
      {approvedBy ? t("drafted.approvedBy", { role: t(`role.${approvedBy}`) }) : t("drafted.awaiting")}
    </p>
  );
}

export { DraftedByLabel };
