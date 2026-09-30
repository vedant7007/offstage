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
import { formatDateTime } from "@/lib/time";

/** Which agent card to show: the proposing agent, or the Commander for a person's own proposal. */
export function agentOf(p: ActionProposal): string {
  return p.proposedBy.kind === "agent" ? p.proposedBy.agent : "commander";
}

export function metaOf(p: ActionProposal): string {
  const parts = [`Proposed ${formatDateTime(p.createdAt)}`];
  if (p.status === "pending") parts.push(`expires ${formatDateTime(p.expiresAt)}`);
  if (p.requiredApprovals > 1) parts.push(`${p.approvals.length} of ${p.requiredApprovals} approvals`);
  if (p.facultyApprovalRequired) parts.push("faculty approval required");
  return parts.join(" · ");
}

const message = (e: unknown) =>
  e instanceof ApiClientError ? e.message : e instanceof Error ? e.message : "Something went wrong";

/** Approve with the diff hash the approver saw, so a changed plan cannot be approved blind. */
export function ApproveButton({
  eventId,
  proposal,
  onDone,
  disabled,
}: {
  eventId: string;
  proposal: ActionProposal;
  onDone: () => void;
  disabled?: boolean;
}) {
  const [busy, setBusy] = React.useState(false);
  return (
    <Button
      disabled={disabled || busy}
      onClick={async () => {
        setBusy(true);
        try {
          await api.call("approveProposal", {
            params: { eventId, proposalId: proposal.id },
            body: { diffHash: proposal.diffHash },
          });
          toast.success("Approved");
          onDone();
        } catch (e) {
          toast.error(message(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "Approving..." : "Approve"}
    </Button>
  );
}

export function RejectButton({
  eventId,
  proposal,
  onDone,
  disabled,
}: {
  eventId: string;
  proposal: ActionProposal;
  onDone: () => void;
  disabled?: boolean;
}) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="secondary" disabled={disabled}>
          Reject
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Reject this proposal"
        description="The agent sees your reason and will not propose it again."
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
          <Field label="Reason">
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
