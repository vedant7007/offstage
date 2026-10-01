"use client";

import type { MetricsSnapshot } from "@/contracts";
import { Badge } from "@/components/ui";
import { cn } from "@/lib/utils";
import { humanize } from "../text";
import { NODE_STATE } from "./theme";
import type { NodeState } from "./use-stage";

type Signal = { key: string; label: string; value: number; color: string };

const LIME = "#c1ff00";
const INFO = "#8a95ff";
const GOLD = "#ffe45e";
const RED = "#ff6b61";

/** What Radar watches, straight from the live metrics feed. Nothing here is estimated. */
function signalsOf(m: MetricsSnapshot): Signal[] {
  return [
    { key: "checkins", label: "Check-ins, last 10 min", value: m.checkins.lastTenMinutes, color: LIME },
    {
      key: "questions",
      label: "Helpdesk questions, last 10 min",
      value: m.helpdesk.lastTenMinutes,
      color: INFO,
    },
    ...m.helpdesk.clusters.slice(0, 3).map((c) => ({
      key: `cluster:${c.key}`,
      label: `Asking about ${humanize(c.key).toLowerCase()}`,
      value: c.count,
      color: GOLD,
    })),
    { key: "incidents", label: "Open incidents", value: m.incidentsOpen, color: GOLD },
    { key: "emergencies", label: "Open emergencies", value: m.emergenciesOpen, color: RED },
  ];
}

/** A fixed spot per signal (golden-angle spread), so a blip stays put between updates. */
const spot = (i: number) => {
  const a = ((i * 137.5 + 35) * Math.PI) / 180;
  const r = 22 + ((i * 23) % 22);
  return { left: `${50 + Math.cos(a) * r}%`, top: `${50 + Math.sin(a) * r}%` };
};

/**
 * Radar's scope: a sweep over concentric rings, one blip for every watched signal above zero.
 * The disc opens Radar's glass box, like its node on the stage.
 */
export function RadarPanel({
  state,
  metrics,
  onOpen,
}: {
  state: NodeState;
  metrics: MetricsSnapshot | null;
  onOpen: () => void;
}) {
  const st = NODE_STATE[state];
  const signals = metrics ? signalsOf(metrics) : [];
  const hot = signals.filter((s) => s.value > 0);
  return (
    <section
      aria-labelledby="radar-title"
      className="dark relative isolate flex flex-col gap-4 overflow-hidden rounded-card border border-white/10 bg-black p-5 text-fg shadow-[0_30px_60px_-30px_rgb(7_27_223/0.45)]"
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(70%_60%_at_50%_35%,rgb(26_47_251/0.25),transparent_70%)]"
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="kicker inline-flex items-center gap-2 text-curtain-text after:h-px after:w-8 after:bg-current">
            Radar
          </span>
          <h2 id="radar-title" className="text-base font-medium tracking-[-0.015em]">
            What Radar is watching
          </h2>
        </div>
        <Badge tone={st.tone} className="font-mono text-[0.6875rem] tracking-[0.06em] uppercase">
          {st.label}
        </Badge>
      </div>

      <button
        type="button"
        onClick={onOpen}
        aria-label="Open Radar's glass box"
        className="group relative mx-auto aspect-square w-full max-w-[15rem] rounded-full border border-[#c1ff00]/30 bg-[radial-gradient(circle,rgb(7_27_223/0.35),rgb(0_0_0/0.9)_70%)] shadow-[0_0_0_6px_rgb(193_255_0/0.05),0_0_60px_-10px_rgb(26_47_251/0.6)] transition-[translate,box-shadow] duration-300 ease-[cubic-bezier(.4,0,.1,1)] motion-safe:hover:-translate-y-0.5 hover:shadow-[0_0_0_6px_rgb(193_255_0/0.1),0_0_70px_-10px_rgb(26_47_251/0.8)]"
      >
        {/* Rings and cross hairs. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-[repeating-radial-gradient(circle,transparent_0,transparent_calc(25%-1px),rgb(193_255_0/0.18)_calc(25%-1px),rgb(193_255_0/0.18)_25%)]"
        />
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-[#c1ff00]/15" />
        <span aria-hidden className="absolute inset-y-0 left-1/2 w-px bg-[#c1ff00]/15" />
        {/* The sweep: a lime wedge that fades behind its leading edge. Still under reduced motion. */}
        <span
          aria-hidden
          className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_0deg,transparent_290deg,rgb(193_255_0/0.08)_320deg,rgb(193_255_0/0.4)_359deg,transparent_360deg)] motion-safe:animate-[spin_4s_linear_infinite]"
        />
        {hot.map((s) => {
          const i = signals.indexOf(s);
          return (
            <span key={s.key} aria-hidden className="absolute size-2.5 -translate-1/2" style={spot(i)}>
              <span
                className="absolute inset-0 rounded-full opacity-60 motion-safe:animate-ping"
                style={{ background: s.color }}
              />
              <span
                className="absolute inset-0 rounded-full"
                style={{ background: s.color, boxShadow: `0 0 10px ${s.color}` }}
              />
            </span>
          );
        })}
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 size-2 -translate-1/2 rounded-full bg-[#c1ff00]"
        />
      </button>

      {metrics ? (
        <dl className="flex flex-col gap-1.5 text-sm">
          {signals.map((s) => (
            <div key={s.key} className="flex items-center gap-2.5">
              <span
                aria-hidden
                className={cn("size-2 shrink-0 rounded-full", s.value ? "" : "opacity-30")}
                style={{ background: s.color }}
              />
              <dt className="min-w-0 flex-1 truncate text-fg-muted">{s.label}</dt>
              <dd className="font-mono tabular-nums">{s.value.toLocaleString("en-IN")}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="text-sm text-fg-muted">Waiting for the first metrics from the event.</p>
      )}
      <p className="font-mono text-[0.6875rem] tracking-[0.04em] text-fg-muted">
        Live metrics feed. A blip is a signal above zero.
      </p>
    </section>
  );
}
