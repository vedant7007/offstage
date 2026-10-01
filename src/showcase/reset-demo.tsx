"use client";

import * as React from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogTrigger } from "@/components/ui/dialog";

/** Header control: put the recorded world back as it started, after a confirm. */
export function ResetDemoButton() {
  const [busy, setBusy] = React.useState(false);
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="secondary" size="sm" className="shrink-0">
          <RotateCcw aria-hidden />
          <span className="max-sm:sr-only">Reset demo</span>
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Reset the demo?"
        description="Scenarios, approvals and check-ins go back to the start of the day. You stay signed in as the same persona."
      >
        <div className="flex justify-end gap-2">
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const { resetDemo } = await import("./engine");
              resetDemo();
              window.location.reload();
            }}
          >
            Reset demo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
