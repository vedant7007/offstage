import type { AgentName, Role } from "@/contracts";
import { DraftedByLabel } from "@/components/ui";
import { cn } from "@/lib/utils";

type Props = {
  announcement: { approvedByRole?: Role; draftedBy?: AgentName };
  /** On a coloured background such as the emergency alert, inherit its text colour for contrast. */
  onColour?: boolean;
  className?: string;
};

/**
 * "Drafted by ..., approved by <role>" under an announcement the assistant drafted.
 * Announcements a person wrote directly carry no label.
 */
export function AnnouncementLabel({ announcement, onColour = false, className }: Props) {
  if (!announcement.draftedBy || !announcement.approvedByRole) return null;
  return (
    <DraftedByLabel
      approvedBy={announcement.approvedByRole}
      className={cn("mt-1", onColour && "text-current opacity-95", className)}
    />
  );
}
