"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp, Mic, Square } from "lucide-react";
import { Alert, Badge, Button, Input, type Tone } from "@/components/ui";
import { formatTime } from "@/lib/time";
import { useReducedMotion } from "../fx";
import { useVoice, VOICE_OPTIONS, type Mode, type Steps, type VoiceId } from "./use-voice";

// Every voice state is a word and a colour (tokens only); the waveform is extra and stops with reduced motion.
const STATE: Record<Mode, { label: string; tone: Tone; ring: string }> = {
  off: { label: "Off", tone: "neutral", ring: "border-border bg-surface" },
  idle: { label: "Ready", tone: "neutral", ring: "border-border-strong bg-surface" },
  listening: { label: "Listening", tone: "info", ring: "border-info bg-info-soft" },
  hearing: { label: "Hearing you", tone: "info", ring: "border-info bg-info-soft" },
  thinking: { label: "Thinking", tone: "agent", ring: "border-agent bg-agent-soft" },
  speaking: { label: "Speaking", tone: "approved", ring: "border-approved bg-approved-soft" },
};
const STEP_ORDER = ["plan", "delegate", "execute", "approve"] as const;
const STEP_NAME = { plan: "Plan", delegate: "Delegate", execute: "Execute", approve: "Approve" };
const usd = (x: number) => `$${x.toFixed(4)}`;

function Waveform({
  mode,
  level,
  analyser,
}: {
  mode: Mode;
  level: number;
  analyser: () => AnalyserNode | null;
}) {
  const ref = React.useRef<HTMLCanvasElement>(null);
  const levelRef = React.useRef(level);
  React.useEffect(() => {
    levelRef.current = level;
  }, [level]);
  React.useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d");
    if (!g) return;
    const color = getComputedStyle(c).color;
    const data = new Uint8Array(128);
    let raf = 0;
    const draw = () => {
      const w = c.width;
      const h = c.height;
      g.clearRect(0, 0, w, h);
      g.fillStyle = color;
      const a = mode === "speaking" ? analyser() : null;
      if (a) a.getByteFrequencyData(data);
      const bars = 24;
      for (let i = 0; i < bars; i++) {
        const v = a
          ? data[Math.floor((i / bars) * 64)]! / 255
          : mode === "listening" || mode === "hearing"
            ? Math.min(1, levelRef.current * 12) * (0.55 + 0.45 * Math.sin(i * 1.7 + performance.now() / 120))
            : 0.04;
        const bh = Math.max(2, v * h);
        g.fillRect((i * w) / bars + 1, (h - bh) / 2, w / bars - 3, bh);
      }
      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, [mode, analyser]);
  return <canvas ref={ref} width={240} height={36} aria-hidden className="h-9 w-full text-curtain" />;
}

function Strip({ steps }: { steps: Steps }) {
  return (
    <ol aria-label="Plan, delegate, execute, approve" className="grid grid-cols-4 gap-1">
      {STEP_ORDER.map((k) => {
        const s = steps[k];
        const tone: Tone =
          s.state === "done"
            ? "approved"
            : s.state === "active"
              ? k === "approve"
                ? "pending"
                : "agent"
              : "neutral";
        return (
          <li key={k} className="flex flex-col gap-0.5">
            <Badge tone={tone} className="justify-center">
              {STEP_NAME[k]}
              <span className="sr-only">: {s.state === "todo" ? "not started" : s.state}</span>
            </Badge>
            <span className="truncate font-mono text-[0.65rem] text-fg-muted" title={s.label}>
              {s.state === "todo" ? "" : s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The voice Commander, docked at the bottom of every console page. */
export function VoiceDock({ eventId }: { eventId: string }) {
  const router = useRouter();
  const v = useVoice({ onOpenProposal: (id) => router.push(`/console/${eventId}/approvals/${id}`) });
  const still = useReducedMotion();
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const s = STATE[v.mode];
  const last = v.turns[0];
  const latencies = v.turns
    .map((t) => t.latencyMs)
    .filter((x): x is number => typeof x === "number" && x > 0);
  const median = latencies.length
    ? [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length / 2)]
    : null;

  return (
    <section
      aria-label="Voice Commander"
      className="fixed right-4 bottom-4 z-40 flex w-[min(26rem,calc(100vw-2rem))] flex-col gap-2.5 rounded-card border border-border bg-surface-raised p-3.5 shadow-[0_28px_56px_-24px_rgb(0_0_0/0.5)]"
    >
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (v.mode === "speaking" || v.mode === "thinking" ? v.stop() : void v.talk())}
          aria-label={v.mode === "speaking" || v.mode === "thinking" ? "Stop Offstage" : "Talk to Offstage"}
          className={`flex size-14 shrink-0 items-center justify-center rounded-full border-2 transition-colors duration-300 ${s.ring} ${
            !still && (v.mode === "listening" || v.mode === "thinking") ? "motion-safe:animate-pulse" : ""
          }`}
        >
          {v.mode === "speaking" || v.mode === "thinking" ? <Square aria-hidden /> : <Mic aria-hidden />}
        </button>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex items-center gap-2">
            <Badge tone={s.tone} aria-live="polite">
              {s.label}
            </Badge>
            {v.handsFree ? <Badge tone="info">Hands-free: say &quot;Hey Offstage&quot;</Badge> : null}
            {last?.replies.some((r) => r.fallback) ? <Badge tone="pending">Fallback voice</Badge> : null}
          </div>
          {still ? null : <Waveform mode={v.mode} level={v.level} analyser={v.analyser} />}
        </div>
        <Button
          variant="ghost"
          size="sm"
          aria-expanded={open}
          aria-controls="voice-panel"
          onClick={() => setOpen((o) => !o)}
        >
          {open ? <ChevronDown aria-hidden /> : <ChevronUp aria-hidden />}
          <span className="sr-only">{open ? "Hide" : "Show"} the voice panel</span>
        </Button>
      </div>

      <div aria-live="polite" className="flex flex-col gap-0.5 text-sm">
        {v.caption.you ? (
          <p>
            <span className="font-semibold">You: </span>
            {v.caption.you}
          </p>
        ) : (
          <p className="text-fg-muted">Press the mic and speak, or type below.</p>
        )}
        {v.caption.offstage ? (
          <p>
            <span className="font-semibold">Offstage: </span>
            {v.caption.offstage}
          </p>
        ) : null}
      </div>
      <Strip steps={v.steps} />
      {v.error ? <Alert variant="warning" title={v.error} /> : null}

      {open ? (
        <div id="voice-panel" className="flex flex-col gap-2 border-t border-border pt-2">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-1">
              <span className="text-fg-muted">Voice</span>
              <select
                className="rounded-control border-[1.5px] border-border-strong bg-surface px-2 py-1"
                value={v.voiceId}
                onChange={(e) => v.setVoiceId(e.target.value as VoiceId)}
              >
                {VOICE_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}: {o.detail}
                  </option>
                ))}
              </select>
            </label>
            <Button
              variant={v.handsFree ? "primary" : "secondary"}
              size="sm"
              role="switch"
              aria-checked={v.handsFree}
              onClick={() => void v.toggleHandsFree()}
            >
              {v.handsFree ? "Hands-free on" : "Hands-free off"}
            </Button>
            {median !== null ? <Badge tone="neutral">Median {median} ms to first audio</Badge> : null}
          </div>
          <ol aria-label="Voice transcript" className="flex max-h-64 flex-col gap-2 overflow-y-auto text-sm">
            {v.turns.map((t) => (
              <li
                key={t.id}
                data-intent={t.intent ?? ""}
                data-latency={t.latencyMs ?? ""}
                className="rounded-[12px] border border-border bg-surface p-2.5"
              >
                <div className="flex flex-wrap items-center gap-1 font-mono text-xs text-fg-muted">
                  <span className="tabular-nums">{formatTime(t.at)}</span>
                  <Badge tone="neutral">{t.via === "voice" ? "Voice" : "Typed"}</Badge>
                  {t.intent ? (
                    <Badge tone={t.intent === "blocked" ? "danger" : "agent"}>
                      {t.intent.replace(/_/g, " ")}
                    </Badge>
                  ) : null}
                  {t.latencyMs ? <span className="tabular-nums">{t.latencyMs} ms to first audio</span> : null}
                  {t.sttMs ? (
                    <span className="tabular-nums">
                      (STT {t.sttMs} ms, first sentence {t.firstSayMs ?? "?"} ms)
                    </span>
                  ) : null}
                  <span className="tabular-nums">
                    {usd(t.costUsd.stt + t.costUsd.model + t.costUsd.voice)}
                  </span>
                  {t.interrupted ? <Badge tone="pending">Interrupted</Badge> : null}
                </div>
                <p>
                  <span className="font-semibold">You: </span>
                  {t.you}
                </p>
                {t.replies.map((r, i) => (
                  <p key={i} className={r.kind === "filler" ? "text-fg-muted" : undefined}>
                    <span className="font-semibold">Offstage: </span>
                    {r.text} {r.fallback ? <Badge tone="pending">Fallback voice</Badge> : null}
                  </p>
                ))}
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) {
            v.type(text.trim());
            setText("");
          }
        }}
      >
        <Input
          aria-label="Type to Offstage"
          placeholder="Or type: what's on today?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <Button type="submit" variant="secondary" disabled={!text.trim()}>
          Send
        </Button>
      </form>
    </section>
  );
}
