"use client";

import * as React from "react";
import { Activity } from "lucide-react";
import { AgentAvatar, Badge, PageHeader, Skeleton } from "@/components/ui";
import { Backdrop, LivePulse, NumberTicker } from "@/components/ui/motion";
import { formatTime } from "@/lib/time";
import { GlassBox } from "./glass-box";
import { PersonaDock } from "./persona-dock";
import { RadarPanel } from "./radar-panel";
import { StageCanvas } from "./stage-canvas";
import { NODE_STATE, LOG_TONE as TONE } from "./theme";
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

/** One telemetry cell: a mono label over a rolling number. Numbers come straight from the feed. */
function Telemetry({
  label,
  value,
  of,
  tone,
}: {
  label: string;
  value: number | null;
  of?: string;
  tone?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 bg-surface px-4 py-3 md:px-5 md:py-4">
      <dt className="kicker truncate text-fg-muted">{label}</dt>
      <dd className="flex items-baseline gap-1.5">
        {value === null ? (
          <Skeleton className="h-6 w-12 rounded-full md:h-7" />
        ) : (
          <NumberTicker
            mode="roll"
            value={value}
            className={`text-2xl leading-none font-medium tracking-[-0.04em] md:text-3xl ${tone ?? ""}`}
          />
        )}
        {of ? <span className="truncate font-mono text-xs text-fg-muted">{of}</span> : null}
      </dd>
    </div>
  );
}

/** The Live Stage: the Commander and its agents at work, from real runs and proposals, as they happen. */
export function LiveStage({ eventId, demo }: { eventId: string; demo?: React.ReactNode }) {
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
      {
        id: "gate:head",
        title: "Event head",
        detail: needsPerson ? `${needsPerson} waiting for approval` : "Nothing waiting",
        waiting: needsPerson > 0,
      },
      {
        id: "gate:faculty",
        title: "Faculty approver",
        detail: two ? `${two} need a second approval` : "Nothing waiting",
        waiting: two > 0,
      },
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

  const atWork = s.agents.filter((a) => {
    const st = s.stateOf(a);
    return st === "thinking" || st === "proposing";
  }).length;
  const sent = s.delivery.reduce((n, c) => n + c.real + c.mock, 0);

  return (
    <div className="flex flex-col gap-4">
      <Backdrop stage />
      <PageHeader
        className="pb-4"
        eyebrow="Console, live"
        title="Live stage"
        description="The Commander and thirteen agents, live. Click any node to see what it did and why."
        actions={
          <Badge tone={s.connected ? "approved" : "pending"} className="gap-2 font-mono uppercase">
            {s.connected ? (
              <LivePulse className="size-1.5 text-current" />
            ) : (
              <span aria-hidden className="size-1.5 rounded-full bg-current" />
            )}
            {s.connected ? "Live feed" : "Connecting"}
          </Badge>
        }
      />
      {demo}
      {/* The control room's instrument strip, read off the same feed as the stage below. */}
      <dl
        aria-label="Right now"
        className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border depth-2 md:grid-cols-4"
      >
        <Telemetry
          label="Checked in"
          value={s.metrics ? s.metrics.checkins.count : null}
          of={s.metrics ? `of ${s.metrics.registrations.confirmed.toLocaleString("en-IN")}` : undefined}
        />
        <Telemetry
          label="Waiting for you"
          value={needsPerson}
          tone={needsPerson ? "text-pending-text" : undefined}
        />
        <Telemetry label="Agents at work" value={atWork} of={`of ${s.agents.length}`} />
        <Telemetry label="Messages sent" value={sent} />
      </dl>
      <StageCanvas
        agents={s.agents}
        stateOf={s.stateOf}
        waitingOf={(a) => s.waitingBy.get(a)?.length ?? 0}
        pulses={s.pulses}
        boxes={boxes}
        onOpen={setOpen}
      />
      {/* Every node as a button: the stage on a phone, and the keyboard and screen reader route on desktop. */}
      <nav aria-label="Agents on the stage" className="md:sr-only md:focus-within:not-sr-only">
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:flex md:flex-wrap">
          {s.agents.map((a) => {
            const st = NODE_STATE[s.stateOf(a)];
            const waiting = s.waitingBy.get(a)?.length ?? 0;
            return (
              <li key={a}>
                <button
                  type="button"
                  className="press flex min-h-11 w-full items-center gap-2 rounded-card border border-border bg-surface px-3 py-2 text-start text-sm depth-1 hover:border-border-strong"
                  onClick={() => setOpen(`agent:${a}`)}
                >
                  <span aria-hidden className="contents">
                    <AgentAvatar agent={a} size="sm" />
                  </span>
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate font-medium">{s.label(a)}</span>
                    <span className="font-mono text-[0.6875rem] tracking-[0.04em] text-fg-muted uppercase">
                      {waiting ? `${waiting} to approve` : st.label}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <RadarPanel state={s.stateOf("radar")} metrics={s.metrics} onOpen={() => setOpen("agent:radar")} />
        <section
          aria-labelledby="stage-log"
          className="flex flex-col overflow-hidden rounded-card border border-border bg-surface depth-2"
        >
          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 id="stage-log" className="text-sm font-medium tracking-[-0.01em]">
              What is happening
            </h2>
            <span className="kicker flex items-baseline gap-1 text-fg-muted">
              <NumberTicker mode="roll" value={s.log.length} /> cues
            </span>
          </div>
          {/* Newest first; the hook keeps at most 200 lines. Beside the radar it fills the row's height. */}
          <div className="relative h-56 lg:h-auto lg:flex-1">
            <ol
              role="log"
              className="absolute inset-0 overflow-y-auto px-4 py-3 font-mono text-xs leading-relaxed"
            >
              {s.log.length ? (
                [...s.log].reverse().map((l) => (
                  // A new cue drops in from above (@starting-style); older ones just shift down.
                  <li
                    key={l.id}
                    className={`flex gap-3 py-0.5 transition-[opacity,translate] duration-(--duration-slow) ease-(--ease-out-expo) starting:-translate-y-1.5 starting:opacity-0 ${TONE[l.tone ?? "system"]}`}
                  >
                    <span className="shrink-0 text-fg-muted tabular-nums">{formatTime(l.at)}</span>
                    <span>{l.text}</span>
                  </li>
                ))
              ) : (
                <li className="flex h-full flex-col items-center justify-center gap-2 text-center font-sans">
                  <span className="flex size-10 items-center justify-center rounded-[0.75rem] bg-surface-sunken text-fg-muted">
                    <Activity aria-hidden className="size-5" />
                  </span>
                  <span className="text-sm font-medium text-fg">Quiet for now</span>
                  <span className="max-w-xs text-sm text-fg-muted">
                    Cues appear here the moment an agent wakes, proposes or hands off.
                  </span>
                </li>
              )}
            </ol>
          </div>
        </section>
      </div>
      <PersonaDock eventId={eventId} tick={s.feedTick} live={s.connected} clock={s.clock} />
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
