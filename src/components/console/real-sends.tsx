"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Radio } from "lucide-react";
import type { RealSendsResponse } from "@/contracts";
import { api } from "@/lib/api-client";
import { Badge, Button, toast } from "@/components/ui";

const EVENT = "offstage:real-sends";

/** Current real-sends state for this event, refreshed every 15 seconds and after a switch. */
function useRealSends(eventId: string | undefined) {
  const [state, setState] = React.useState<RealSendsResponse | null>(null);
  React.useEffect(() => {
    if (!eventId) return;
    let live = true;
    const load = () =>
      api.call("realSends", { params: { eventId } }).then(
        (r) => live && setState(r),
        () => undefined,
      );
    void load();
    const id = setInterval(() => void load(), 15_000);
    const onChange = (e: Event) => live && setState((e as CustomEvent<RealSendsResponse>).detail);
    window.addEventListener(EVENT, onChange);
    return () => {
      live = false;
      clearInterval(id);
      window.removeEventListener(EVENT, onChange);
    };
  }, [eventId]);
  return state;
}

/** Console header: a loud badge while allowlisted phones really get messages. */
export function RealSendsBadge({ eventId }: { eventId: string }) {
  const state = useRealSends(eventId);
  if (!state?.on) return null;
  return (
    <Badge tone="danger" role="status" title="Allowlisted phones and chats receive real messages">
      <Radio aria-hidden className="motion-safe:animate-pulse" />
      REAL SENDS ON
    </Badge>
  );
}

/**
 * Demo scenarios panel, event owner only: switch real sends. Off saves the Twilio trial's 50 messages
 * a day for the real demo; allowlisted messages then go to the mock driver like everyone else's.
 */
export function RealSendsToggle() {
  const { eventId } = useParams<{ eventId: string }>();
  const state = useRealSends(eventId);
  const [busy, setBusy] = React.useState(false);
  if (!state?.canChange) return null;
  const flip = () => {
    setBusy(true);
    api
      .call("setRealSends", { params: { eventId }, body: { on: !state.on } })
      .then(
        (r) => {
          window.dispatchEvent(new CustomEvent(EVENT, { detail: r }));
          toast.success(r.on ? "Real sends on: allowlisted phones get real messages" : "Real sends off");
        },
        (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not switch real sends"),
      )
      .finally(() => setBusy(false));
  };
  return (
    <div className="flex flex-wrap items-center gap-3 border-t border-border pt-3">
      <Button
        variant={state.on ? "destructive" : "secondary"}
        size="sm"
        role="switch"
        aria-checked={state.on}
        loading={busy}
        onClick={flip}
      >
        {state.on ? "Turn real sends off" : "Turn real sends on"}
      </Button>
      <p className="text-sm text-fg-muted">
        {state.on
          ? "Allowlisted phones and chats get real WhatsApp and Telegram messages."
          : "Off: every message goes to the mock driver, saving the Twilio daily cap."}
      </p>
    </div>
  );
}
