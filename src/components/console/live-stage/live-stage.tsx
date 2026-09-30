"use client";

import * as React from "react";
import { Badge, PageHeader } from "@/components/ui";
import { formatTime } from "@/lib/time";
import { GlassBox } from "./glass-box";
import { PersonaDock } from "./persona-dock";
import { StageCanvas } from "./stage-canvas";
import { LOG_TONE as TONE } from "./theme";
import { useStage } from "./use-stage";

const DATA = [
  ["data:schedule", "Schedule", "Sessions, rooms, speakers"],
  ["data:crew", "Crew and floor", "Shifts, tasks, incidents"],
  ["data:registrations", "Registrations", "People, tickets, check-ins"],
  ["data:money", "Money", "Budget, ledger, sponsors"],
  ["data:kb", "Knowledge", "Documents the helpdesk cites"],
] as const;
const CHANNELS = [
  ["in_app", "In-app"],
  ["email", "Email"],
  ["whatsapp", "WhatsApp"],
  ["telegram", "Telegram"],
  ["sms", "SMS"],
] as const;

/** The Live Stage: the Commander and its agents at work, from real runs and proposals, as they happen. */
export function LiveStage({ eventId }: { eventId: string }) {
  const s = useStage(eventId);
  const [open, setOpen] = React.useState<string | null>(null);

  const two = s.pending.filter((p) => p.riskTier === "T3").length;
  const needsPerson = s.pending.filter((p) => p.riskTier === "T2" || p.riskTier === "T3").length;
  const boxes = {
    gates: [
      { id: "gate:head", title: "Event head", detail: `${needsPerson} waiting for approval` },
      { id: "gate:faculty", title: "Faculty approver", detail: `${two} need a second approval` },
    ],
    data: DATA.map(([id, title, detail]) => ({
      id,
      title,
      detail:
        id === "data:registrations" && s.metrics
          ? `${s.metrics.checkins.count} of ${s.metrics.registrations.confirmed} checked in`
          : detail,
    })),
    channels: CHANNELS.map(([key, title]) => {
      const c = s.delivery.find((d) => d.channel === key);
      return {
        id: `channel:${key}`,
        title,
        detail:
          key === "in_app"
            ? "Notifications in the portal"
            : c
              ? `${c.real} real, ${c.mock} mock`
              : "Nothing sent yet",
      };
    }),
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Live stage"
        description="The Commander and thirteen agents, live. Click any node to see what it did and why."
        actions={
          <Badge tone={s.connected ? "approved" : "pending"}>{s.connected ? "Live" : "Connecting"}</Badge>
        }
      />
      <StageCanvas
        agents={s.agents}
        stateOf={s.stateOf}
        waitingOf={(a) => s.waitingBy.get(a)?.length ?? 0}
        pulses={s.pulses}
        boxes={boxes}
        onOpen={setOpen}
      />
      {/* Keyboard and screen reader route to every node's glass box; visible when focused. */}
      <nav aria-label="Agents on the stage" className="sr-only focus-within:not-sr-only">
        <ul className="flex flex-wrap gap-2">
          {s.agents.map((a) => (
            <li key={a}>
              <button
                type="button"
                className="rounded-control border border-border px-2 py-1 text-sm"
                onClick={() => setOpen(`agent:${a}`)}
              >
                {s.label(a)}: {s.stateOf(a)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <section aria-labelledby="stage-log" className="rounded-card border border-border bg-surface">
        <h2 id="stage-log" className="border-b border-border px-3 py-2 text-sm font-semibold">
          What is happening
        </h2>
        {/* Newest first; the hook keeps at most 200 lines. */}
        <ol role="log" className="h-40 overflow-y-auto px-3 py-2 font-mono text-xs leading-relaxed">
          {s.log.length ? (
            [...s.log].reverse().map((l) => (
              <li key={l.id} className={TONE[l.tone ?? "system"]}>
                <span className="text-fg-muted tabular-nums">{formatTime(l.at)}</span> {l.text}
              </li>
            ))
          ) : (
            <li className="text-fg-muted">Waiting for the next thing to happen.</li>
          )}
        </ol>
      </section>
      <PersonaDock eventId={eventId} tick={s.feedTick} live={s.connected} />
      <GlassBox
        eventId={eventId}
        open={open}
        onClose={() => setOpen(null)}
        pending={s.pending}
        delivery={s.delivery}
        onChanged={() => void s.reload()}
        label={s.label}
      />
    </div>
  );
}
