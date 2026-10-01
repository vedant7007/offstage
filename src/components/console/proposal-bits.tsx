"use client";

import * as React from "react";
import type { ActionProposal } from "@/contracts";
import { api, ApiClientError } from "@/lib/api-client";
import {
  Button,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
  Field,
  Textarea,
  toast,
} from "@/components/ui";
import { ConfirmBurst, prefersReducedMotion } from "@/components/ui/motion";
import { formatDateTime, formatTime, istDateKey } from "@/lib/time";
import { Check } from "lucide-react";

/** Which agent card to show: the proposing agent, or the Commander for a person's own proposal. */
export function agentOf(p: ActionProposal): string {
  return p.proposedBy.kind === "agent" ? p.proposedBy.agent : "commander";
}

/** "Proposed 24 Oct 2026, 10:42 AM · Expires 11:12 AM · 0 of 2 approvals · Faculty sign-off needed" */
export function metaOf(p: ActionProposal): string {
  const parts = [`Proposed ${formatDateTime(p.createdAt)}`];
  const sameDay = istDateKey(p.createdAt) === istDateKey(p.expiresAt);
  if (p.status === "pending")
    parts.push(`Expires ${sameDay ? formatTime(p.expiresAt) : formatDateTime(p.expiresAt)}`);
  if (p.requiredApprovals > 1) parts.push(`${p.approvals.length} of ${p.requiredApprovals} approvals`);
  if (p.facultyApprovalRequired) parts.push("Faculty sign-off needed");
  return parts.join(" · ");
}

const message = (e: unknown) =>
  e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : "Something went wrong";

/** How long the approve burst plays before the list moves on. */
const BURST_MS = 380;

/**
 * Approve with the diff hash the approver saw, so a changed plan cannot be approved blind. On success the
 * button confirms in place with a short burst, then hands the updated proposal to `onDone`.
 */
export function ApproveButton({
  eventId,
  proposal,
  onDone,
  disabled,
  size,
  magnetic,
}: {
  eventId: string;
  proposal: ActionProposal;
  onDone: (updated?: ActionProposal) => void;
  disabled?: boolean;
  size?: "md" | "lg";
  magnetic?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  // Bumped per success, so the burst remounts and plays again.
  const [burst, setBurst] = React.useState(0);
  return (
    <span className="relative inline-flex">
      <Button
        size={size}
        magnetic={magnetic}
        // While the burst plays the button stays filled (not greyed) but ignores clicks.
        disabled={disabled || (busy && !ok)}
        aria-disabled={busy || undefined}
        loading={busy && !ok}
        onClick={async () => {
          if (busy) return;
          setBusy(true);
          setOk(false);
          try {
            const res = await api.call("approveProposal", {
              params: { eventId, proposalId: proposal.id },
              body: { diffHash: proposal.diffHash },
            });
            const left = proposal.requiredApprovals - proposal.approvals.length - 1;
            toast.success(
              left > 0
                ? `Approved. ${left} more person must approve before it runs: switch persona to the Event head or Program Lead.`
                : "Approved",
            );
            setOk(true);
            setBurst((n) => n + 1);
            if (!prefersReducedMotion()) await new Promise((r) => setTimeout(r, BURST_MS));
            onDone(res.proposal);
          } catch (e) {
            const text = message(e);
            if (/already approved/i.test(text))
              toast.info(
                "You approved this. A second person must approve it: switch persona to the Event head or Program Lead.",
              );
            else toast.error(text);
          } finally {
            setBusy(false);
          }
        }}
      >
        {ok && busy ? <Check aria-hidden /> : null}
        {ok && busy ? "Approved" : busy ? "Approving..." : "Approve"}
      </Button>
      {burst ? <ConfirmBurst key={burst} /> : null}
    </span>
  );
}

export function RejectButton({
  eventId,
  proposal,
  onDone,
  disabled,
  size,
}: {
  eventId: string;
  proposal: ActionProposal;
  onDone: () => void;
  disabled?: boolean;
  size?: "md" | "lg";
}) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" size={size} disabled={disabled}>
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Reject this proposal"
        description="The agent sees your reason and will not propose this again."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.call("rejectProposal", {
                params: { eventId, proposalId: proposal.id },
                body: { reason },
              });
              toast.success("Rejected");
              setOpen(false);
              onDone();
            } catch (err) {
              toast.error(message(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Field
            label="Reason"
            hint="One line is enough, for example: wrong room, check with the speaker first."
          >
            <Textarea value={reason} onChange={(e) => setReason(e.target.value)} required maxLength={600} />
          </Field>
          <div className="flex justify-end gap-2">
            <DialogClose asChild>
              <Button type="button" variant="secondary">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={busy || !reason.trim()}>
              Reject
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
