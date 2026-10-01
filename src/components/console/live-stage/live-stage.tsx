"use client";

import * as React from "react";
import { Badge, PageHeader } from "@/components/ui";
import { formatTime } from "@/lib/time";
import { Kicker } from "../fx";
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
  // "Approve it" by voice opens the gate's panel here (Approve is still a tap); elsewhere the dock navigates.
  React.useEffect(() => {
    const onOpen = (e: Event) => {
      e.preventDefault();
      setOpen("gate:head");
    };
    window.addEventListener("offstage:open-proposal", onOpen);
    return () => window.removeEventListener("offstage:open-proposal", onOpen);
  }, []);

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
        eyebrow={<Kicker>Console, live</Kicker>}
        title="Live stage"
        description="The Commander and thirteen agents, live. Click any node to see what it did and why."
        actions={
          <Badge tone={s.connected ? "approved" : "pending"} className="gap-1.5 font-mono uppercase">
            <span
              aria-hidden
              className={`size-1.5 rounded-full bg-current ${s.connected ? "motion-safe:animate-pulse" : ""}`}
            />
            {s.connected ? "Live" : "Connecting"}
          </Badge>
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
                className="rounded-full border border-border-strong px-3 py-1 font-mono text-xs"
                onClick={() => setOpen(`agent:${a}`)}
              >
                {s.label(a)}: {s.stateOf(a)}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <section
        aria-labelledby="stage-log"
        className="overflow-hidden rounded-card border border-border bg-surface shadow-[0_18px_40px_-28px_rgb(0_0_0/0.35)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-2.5">
          <h2 id="stage-log" className="text-sm font-medium tracking-[-0.01em]">
            What is happening
          </h2>
          <span className="kicker text-fg-muted">
            <span className="tabular-nums">{s.log.length}</span> cues
          </span>
        </div>
        {/* Newest first; the hook keeps at most 200 lines. */}
        <ol role="log" className="h-40 overflow-y-auto px-4 py-2 font-mono text-xs leading-relaxed">
          {s.log.length ? (
            [...s.log].reverse().map((l) => (
              <li key={l.id} className={`flex gap-3 ${TONE[l.tone ?? "system"]}`}>
                <span className="shrink-0 text-fg-muted tabular-nums">{formatTime(l.at)}</span>
                <span>{l.text}</span>
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
