"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, Check, History, Mic, Square, X } from "lucide-react";
import { Alert, Badge, Button, IconButton, Input } from "@/components/ui";
import { vtAnchor } from "@/components/ui/motion";
import { formatTime } from "@/lib/time";
import { useReducedMotion } from "../fx";
import { useVoice, VOICE_OPTIONS, type Mode, type Steps, type Turn } from "./use-voice";
import css from "./voice.module.css";

// Every voice state is a word and a colour (tokens only); the orb's motion is extra and stops with reduced motion.
const STATE: Record<Mode, { label: string; dot: string }> = {
  off: { label: "Mic off", dot: "bg-neutral" },
  idle: { label: "Ready", dot: "bg-fg-muted" },
  listening: { label: "Listening", dot: "bg-info" },
  hearing: { label: "Hearing you", dot: "bg-info" },
  thinking: { label: "Thinking", dot: "bg-agent" },
  speaking: { label: "Speaking", dot: "bg-approved" },
};
const STEP_ORDER = ["plan", "delegate", "execute", "approve"] as const;
const STEP_NAME = { plan: "Plan", delegate: "Delegate", execute: "Execute", approve: "Approve" };
/** What use-voice writes as "You" when push to talk caught nothing. */
const NOT_CAUGHT = "(not caught)";
const usd = (x: number) => `$${x.toFixed(4)}`;
const ms = (x: number) => (x < 1000 ? `${x} ms` : `${(x / 1000).toFixed(1)} s`);
/** Safe, read-only questions for the empty state: each one answers from event data and changes nothing. */
const SUGGESTIONS = [
  "What is on today?",
  "How are registrations going?",
  "What if 30 percent more people come?",
];
const FOCUSABLE = "button:not(:disabled), input:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])";

type Phase = "closed" | "opening" | "open" | "closing";

/**
 * The orb: a glass sphere with plasma turning inside and a halo around it, tinted by the state. It breathes when
 * idle, ripples while listening, churns while thinking, and swells and blooms with --amp.
 */
function Orb({ mode, size, children }: { mode: Mode; size: string; children: React.ReactNode }) {
  return (
    <span
      className={`${css.orb} ${css.tone}`}
      data-mode={mode}
      style={{ "--size": size } as React.CSSProperties}
    >
      <span aria-hidden className={css.halo} />
      <span aria-hidden className={css.ripple} />
      <span aria-hidden className={css.ripple} />
      <span aria-hidden className={css.spin} />
      <span className={css.core}>
        <span aria-hidden className={css.plasma} />
        <span aria-hidden className={css.plasma} />
        <span aria-hidden className={css.gloss} />
        <span className={css.icon}>{children}</span>
      </span>
    </span>
  );
}

function Strip({ steps }: { steps: Steps }) {
  return (
    <ol
      aria-label="Plan, delegate, execute, approve"
      className={`grid w-full max-w-2xl grid-cols-4 gap-1.5 transition-opacity duration-(--duration-slow) md:gap-2 ${
        STEP_ORDER.every((k) => steps[k].state === "todo") ? "opacity-60" : ""
      }`}
    >
      {STEP_ORDER.map((k) => {
        const s = steps[k];
        const look =
          s.state === "done"
            ? "border-transparent bg-approved-soft text-approved-soft-fg"
            : s.state === "active"
              ? k === "approve"
                ? "border-pending bg-pending-soft text-pending-soft-fg"
                : "border-agent bg-agent-soft text-agent-soft-fg"
              : "border-border text-fg-muted";
        return (
          <li key={k} className="flex min-w-0 flex-col items-center gap-1.5">
            <span
              className={`inline-flex w-full items-center justify-center gap-1 rounded-full border px-1.5 py-1.5 font-mono text-xs font-medium transition-colors duration-(--duration-slow) md:gap-1.5 md:px-3 ${look}`}
            >
              {s.state === "done" ? (
                <Check aria-hidden className="size-3 shrink-0" />
              ) : (
                <span
                  aria-hidden
                  className={`size-1.5 shrink-0 rounded-full bg-current ${s.state === "active" ? css.pulse : "opacity-50"}`}
                />
              )}
              {STEP_NAME[k]}
              <span className="sr-only">: {s.state === "todo" ? "not started" : s.state}</span>
            </span>
            <span
              className="min-h-[1.125rem] w-full truncate text-center font-mono text-xs text-fg-muted"
              title={s.label}
            >
              {s.state === "todo" ? "" : s.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** A pill switch with a small track: Conversation and Hands-free. */
function Toggle({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2.5 rounded-full border border-border px-3.5 text-sm transition-colors duration-(--duration-base) hover:border-border-strong md:min-h-9"
    >
      <span
        aria-hidden
        className={`relative h-5 w-8 shrink-0 rounded-full transition-colors duration-(--duration-base) ${
          on ? "bg-curtain" : "bg-surface-sunken ring-1 ring-border-strong"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full transition-transform duration-(--duration-base) ease-out ${
            on ? "translate-x-3 bg-on-curtain" : "bg-fg-muted"
          }`}
        />
      </span>
      {children}
    </button>
  );
}

/** One exchange in voice mode: your words on the right, Offstage's reply below, and any question it asked back. */
function Exchange({
  t,
  latest,
  thinking,
  saying,
}: {
  t: Turn;
  latest: boolean;
  thinking: boolean;
  /** The sentence being spoken right now, if any. */
  saying: string;
}) {
  const replies = t.replies.filter((r) => r.text !== t.followUp);
  return (
    <li className={`${css.turn} flex flex-col gap-3`}>
      <p
        className={`max-w-[85%] self-end rounded-[18px] rounded-br-[6px] border border-border bg-surface-raised px-4 py-2.5 text-base depth-1 transition-colors duration-(--duration-slow) ${
          latest ? "text-fg" : "text-fg-muted"
        }`}
      >
        <span className="sr-only">You: </span>
        {t.you === NOT_CAUGHT ? <span className="text-fg-muted">Nothing heard. Try again.</span> : t.you}
      </p>
      {replies.length ? (
        <p
          className={
            latest
              ? "text-xl font-medium text-pretty md:text-2xl"
              : "text-base text-pretty text-fg-muted transition-colors duration-(--duration-slow) md:text-lg"
          }
        >
          <span className="sr-only">Offstage: </span>
          {replies.map((r, i) => (
            <span
              key={i}
              className={`${css.chunk} ${r.kind === "filler" ? "text-fg-muted" : ""} ${
                saying ? (r.text === saying ? css.saying : css.said) : ""
              }`}
            >
              {r.text}{" "}
            </span>
          ))}
        </p>
      ) : latest && thinking ? (
        <p className="flex items-center gap-1.5 text-fg-muted" aria-label="Offstage is thinking">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              aria-hidden
              className={`size-2 rounded-full bg-agent ${css.pulse}`}
              style={{ animationDelay: `${i * 160}ms` }}
            />
          ))}
        </p>
      ) : null}
      {t.followUp ? (
        <div
          className={`rounded-card px-4 py-3 md:px-5 md:py-4 ${
            latest ? `${css.ask} edge bg-curtain-soft depth-2` : "border border-border"
          }`}
        >
          <p className="kicker text-curtain-soft-fg">Offstage asks</p>
          <p className={`mt-2 font-medium text-fg ${latest ? "text-xl md:text-2xl" : "text-base"}`}>
            {t.followUp}
          </p>
        </div>
      ) : null}
    </li>
  );
}

/**
 * The voice Commander: a floating orb on every console page. Tapping it sends a beam of light from the orb that
 * opens full-screen voice mode, a conversation with Offstage; Escape or Close folds it back into the orb.
 */
export function VoiceDock({ eventId }: { eventId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const v = useVoice({ onOpenProposal: (id) => router.push(`/console/${eventId}/approvals/${id}`) });
  const { talk } = v;
  const still = useReducedMotion();
  const [phase, setPhase] = React.useState<Phase>("closed");
  const [panel, setPanel] = React.useState(false);
  const [converse, setConverse] = React.useState(true);
  const [text, setText] = React.useState("");
  const titleId = React.useId();
  const rootRef = React.useRef<HTMLElement>(null);
  const launcherRef = React.useRef<HTMLButtonElement>(null);
  const overlayRef = React.useRef<HTMLDivElement>(null);
  const orbRef = React.useRef<HTMLButtonElement>(null);
  const convoRef = React.useRef<HTMLDivElement>(null);
  const live = React.useRef({ mode: v.mode, level: v.level, analyser: v.analyser });
  const prevMode = React.useRef(v.mode);

  // Going to another page (for example a proposal a reply opened) folds voice mode away.
  const [seenPath, setSeenPath] = React.useState(pathname);
  if (seenPath !== pathname) {
    setSeenPath(pathname);
    if (phase === "open" || phase === "opening") setPhase("closing");
  }

  const isOpen = phase === "open";
  const s = STATE[v.mode];
  const busy = v.mode === "speaking" || v.mode === "thinking";
  const hearing = v.mode === "listening" || v.mode === "hearing";
  const latest = v.turns[0];
  const asking = latest?.followUp && !latest.interrupted ? latest.followUp : null;
  const convo = v.turns.slice(0, 8).reverse();
  const latencies = v.turns
    .map((t) => t.latencyMs)
    .filter((x): x is number => typeof x === "number" && x > 0);
  const median = latencies.length
    ? [...latencies].sort((a, b) => a - b)[Math.floor(latencies.length / 2)]
    : null;
  const hint =
    v.demo && !v.demo.listens
      ? "Type to talk in this browser. Pick a question below or type one."
      : v.handsFree
        ? 'Hands-free is on. Say "Hey Offstage", then ask anything about the event.'
        : hearing
          ? "Go ahead, Offstage is listening. Ask a question or give a command."
          : "Tap the orb and speak, or type below. Ask anything about the event.";
  const send = (q: string) => {
    if (q) v.type(q);
  };

  React.useEffect(() => {
    live.current = { mode: v.mode, level: v.level, analyser: v.analyser };
  });

  // The orb swells with the mic while listening and with the reply audio while speaking. One CSS variable, no re-render.
  const active = hearing || v.mode === "speaking";
  React.useEffect(() => {
    const el = rootRef.current;
    if (!el || still || !active) return;
    const data = new Uint8Array(128);
    let amp = 0;
    let raf = 0;
    const tick = () => {
      const { mode, level, analyser } = live.current;
      let target = 0;
      if (mode === "speaking") {
        const a = analyser();
        if (a) {
          a.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < 48; i++) sum += data[i]!;
          target = Math.min(1, (sum / 48 / 255) * 1.6);
        }
      } else target = Math.min(1, level * 12);
      amp += (target - amp) * 0.25;
      el.style.setProperty("--amp", amp.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      el.style.setProperty("--amp", "0");
    };
  }, [active, still]);

  // Opening: one frame at zero size, then the beam. Closing: back into the orb, then out of the page entirely.
  React.useEffect(() => {
    if (phase === "opening") {
      void overlayRef.current?.offsetWidth;
      const raf = requestAnimationFrame(() => setPhase("open"));
      return () => cancelAnimationFrame(raf);
    }
    if (phase === "closing") {
      // A frame later, once the browser has let go of the now inert layer, focus returns to the orb.
      const raf = requestAnimationFrame(() => launcherRef.current?.focus({ preventScroll: true }));
      const t = setTimeout(() => setPhase("closed"), still ? 220 : 340);
      return () => {
        cancelAnimationFrame(raf);
        clearTimeout(t);
      };
    }
  }, [phase, still]);

  // Open: lock the page, move focus to the orb, Escape closes (unless an approval card is open on top).
  React.useEffect(() => {
    if (!isOpen) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    const raf = requestAnimationFrame(() => orbRef.current?.focus({ preventScroll: true }));
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector('[role="dialog"][data-state="open"]')) return;
      e.preventDefault();
      setPhase("closing");
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      root.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [isOpen]);

  // Conversation mode: when a spoken reply ends, open the mic again so the organiser can just answer.
  React.useEffect(() => {
    const was = prevMode.current;
    prevMode.current = v.mode;
    if (was !== "speaking" || (v.mode !== "idle" && v.mode !== "off")) return;
    if (!converse || !isOpen || v.handsFree || !latest || latest.interrupted || latest.you === NOT_CAUGHT)
      return;
    if (latest.via === "voice" || latest.followUp) void talk();
  }, [v.mode, v.handsFree, talk, converse, isOpen, latest]);

  // Keep the newest exchange in view.
  React.useEffect(() => {
    const el = convoRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [v.turns, v.caption]);

  const openMode = () => {
    const b = launcherRef.current?.getBoundingClientRect();
    const o = overlayRef.current;
    if (b && o) {
      // The beam starts at the orb's centre and grows to cover the screen from there.
      o.style.setProperty("--ox", `${b.left + b.width / 2}px`);
      o.style.setProperty("--oy", `${b.top + b.height / 2}px`);
      const r = Math.ceil(Math.hypot(window.innerWidth, window.innerHeight));
      o.style.setProperty("--r", `${r}px`);
      // The ring of light on the beam's edge is 240px wide; this scale takes it out to --r.
      o.style.setProperty("--rs", String(r / 120));
    }
    setPhase("opening");
    if (!busy) void v.talk();
  };

  // Keep Tab inside voice mode while it is open.
  const trap = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab") return;
    const f = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.getClientRects().length > 0,
    );
    const first = f[0];
    const end = f.at(-1);
    if (!first || !end) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      end.focus();
    } else if (!e.shiftKey && document.activeElement === end) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <section
      ref={rootRef}
      aria-label="Voice Commander"
      // No page-enter here: its leftover translate would make this the containing block of voice mode's fixed layer.
      style={{ animation: "none" }}
      className={`fixed right-4 bottom-[calc(var(--shell-bottom,0px)+1rem)] md:right-6 md:bottom-[calc(var(--shell-bottom,0px)+1.5rem)] ${
        phase === "closed" ? "z-(--z-overlay)" : "z-(--z-modal)"
      }`}
    >
      {/* The state, for screen readers and the voice tests, whether voice mode is open or not. */}
      <p aria-live="polite" className="sr-only">
        {s.label}
      </p>

      {/* Anchored, so the orb stays perfectly still while the page underneath changes. */}
      <div
        {...vtAnchor("voice-orb")}
        className={`${phase === "opening" || phase === "open" ? "hidden" : "flex"} items-center gap-3`}
      >
        {v.mode !== "off" && v.mode !== "idle" ? (
          <span
            aria-hidden
            className={`${css.pill} inline-flex items-center gap-2 rounded-full border border-border bg-surface-raised px-3 py-1.5 font-mono text-xs text-fg depth-2`}
          >
            <span className={`size-1.5 rounded-full ${s.dot}`} />
            {s.label}
          </span>
        ) : v.handsFree ? (
          <span
            aria-hidden
            className={`${css.pill} hidden rounded-full border border-border bg-surface-raised px-3 py-1.5 font-mono text-xs text-fg-muted depth-2 md:inline-flex`}
          >
            Say &quot;Hey Offstage&quot;
          </span>
        ) : null}
        <button
          ref={launcherRef}
          type="button"
          onClick={openMode}
          aria-label="Talk to Offstage"
          aria-haspopup="dialog"
          className={`${css.launcher} outline-offset-4`}
        >
          <Orb mode={v.mode} size="4rem">
            <Mic aria-hidden />
          </Orb>
        </button>
      </div>

      <div
        ref={overlayRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-hidden={isOpen ? undefined : true}
        inert={!isOpen}
        data-open={isOpen}
        data-mode={v.mode}
        onKeyDown={trap}
        className={`${css.overlay} dark fixed inset-0 overflow-hidden text-fg ${phase === "closed" ? "hidden" : ""}`}
      >
        <div aria-hidden className={css.backdrop} />
        <div aria-hidden className={css.tint} data-tone="listening" />
        <div aria-hidden className={css.tint} data-tone="thinking" />
        <div aria-hidden className={css.tint} data-tone="speaking" />
        <div aria-hidden className="grain pointer-events-none absolute inset-0" />
        <div aria-hidden className={css.wave} />
        <div aria-hidden className={css.rays} />
        <div aria-hidden className={css.flash} />

        <div className="relative flex h-full flex-col">
          <header
            style={{ "--i": 0 } as React.CSSProperties}
            className={`${css.enter} flex items-center gap-3 px-4 pt-[max(0.75rem,env(safe-area-inset-top))] pb-2 md:px-8 md:pt-5`}
          >
            <span aria-hidden className="size-2 rounded-full bg-curtain" />
            <h2 id={titleId} className="kicker text-fg">
              Voice Commander
            </h2>
            {v.demo ? <Badge tone="neutral">Demo voice</Badge> : null}
            <div className="ml-auto flex items-center gap-1">
              <IconButton
                label={panel ? "Hide the voice panel" : "Show the voice panel"}
                icon={<History aria-hidden className="size-5" />}
                aria-expanded={panel}
                aria-controls="voice-panel"
                onClick={() => setPanel((p) => !p)}
                className={panel ? "bg-surface-raised" : undefined}
              />
              <IconButton
                label="Close voice mode"
                icon={<X aria-hidden className="size-5" />}
                onClick={() => setPhase("closing")}
              />
            </div>
          </header>

          <div className="flex min-h-0 flex-1">
            <div className={`min-w-0 flex-1 flex-col items-center ${panel ? "hidden md:flex" : "flex"}`}>
              <div className="flex shrink-0 flex-col items-center gap-2">
                <div className={`${css.stage} ${css.tone} ${css.rise}`} data-mode={v.mode}>
                  <span aria-hidden className={css.ring} />
                  <span aria-hidden className={css.ring} />
                  <span aria-hidden className={css.ring} />
                  <button
                    ref={orbRef}
                    type="button"
                    onClick={() => (busy ? v.stop() : void v.talk())}
                    aria-label={busy ? "Stop Offstage" : "Talk to Offstage"}
                    className={`${css.launcher} relative outline-offset-8`}
                  >
                    <Orb mode={v.mode} size="clamp(5.5rem, 13vh, 8.5rem)">
                      {busy ? <Square aria-hidden fill="currentColor" /> : <Mic aria-hidden />}
                    </Orb>
                  </button>
                </div>
                <div
                  style={{ "--i": 2 } as React.CSSProperties}
                  className={`${css.enter} flex min-h-11 flex-wrap items-center justify-center gap-3`}
                >
                  <p
                    aria-hidden
                    className="flex items-center gap-2 font-mono text-xs tracking-[0.12em] text-fg-muted uppercase"
                  >
                    <span className={`size-1.5 rounded-full ${s.dot}`} />
                    <span key={s.label} className={css.swap}>
                      {hearing && asking ? "Listening for your answer" : s.label}
                    </span>
                  </p>
                  {hearing && !v.handsFree ? (
                    <Button variant="secondary" size="sm" onClick={v.stop}>
                      Stop listening
                    </Button>
                  ) : null}
                  {latest?.replies.some((r) => r.fallback) ? (
                    <Badge tone="pending">Browser voice</Badge>
                  ) : null}
                </div>
              </div>

              <div
                ref={convoRef}
                style={{ "--i": 3 } as React.CSSProperties}
                className={`${css.enter} flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-y-auto px-4 [mask-image:linear-gradient(transparent,#000_3rem)] md:px-8`}
              >
                {convo.length ? (
                  <ol aria-label="Conversation" className="flex flex-col gap-6 pt-8 pb-4">
                    {convo.map((t) => (
                      <Exchange
                        key={t.id}
                        t={t}
                        latest={t === latest}
                        thinking={v.mode === "thinking"}
                        saying={t === latest && v.mode === "speaking" ? v.caption.offstage : ""}
                      />
                    ))}
                  </ol>
                ) : (
                  <div className="m-auto flex flex-col items-center gap-4 py-8 text-center">
                    <p className="text-2xl font-medium text-balance md:text-3xl">Run the event by voice</p>
                    <p className="measure-tight text-base text-pretty text-fg-muted md:text-lg">{hint}</p>
                    <ul aria-label="Try asking" className="mt-4 flex flex-wrap justify-center gap-2">
                      {SUGGESTIONS.map((q, i) => (
                        <li key={q} className={css.suggest} style={{ "--i": i } as React.CSSProperties}>
                          <button
                            type="button"
                            onClick={() => send(q)}
                            className="press inline-flex min-h-11 items-center rounded-full border border-border bg-surface-raised/60 px-4 text-sm text-fg depth-1 hover:border-border-strong hover:bg-surface-raised md:min-h-9"
                          >
                            {q}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              {/* Spoken lines, announced one at a time. */}
              <p aria-live="polite" className="sr-only">
                {v.caption.offstage ? `Offstage: ${v.caption.offstage}` : ""}
              </p>

              <div
                style={{ "--i": 4 } as React.CSSProperties}
                className={`${css.enter} flex w-full shrink-0 flex-col items-center gap-3 px-4 pt-4 md:px-8`}
              >
                <Strip steps={v.steps} />
                {v.error ? <Alert variant="warning" title={v.error} className="w-full max-w-xl" /> : null}
              </div>

              <div
                style={{ "--i": 5 } as React.CSSProperties}
                className={`${css.enter} flex w-full max-w-3xl shrink-0 flex-col gap-3 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] md:px-8 md:pb-8`}
              >
                <form
                  className="relative"
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(text.trim());
                    setText("");
                  }}
                >
                  <Input
                    aria-label="Type to Offstage"
                    placeholder={asking ? "Type your answer" : "Type a question or a command"}
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    className="min-h-14 rounded-full pr-16 pl-5 text-base"
                  />
                  <Button
                    type="submit"
                    disabled={!text.trim()}
                    className="absolute top-1.5 right-1.5 size-11 px-0 motion-safe:hover:translate-y-0"
                  >
                    <ArrowUp aria-hidden className="size-5" />
                    <span className="sr-only">Send</span>
                  </Button>
                </form>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <Toggle on={converse} onClick={() => setConverse((c) => !c)}>
                    Conversation
                  </Toggle>
                  <Toggle on={v.handsFree} onClick={() => void v.toggleHandsFree()}>
                    Hands-free
                  </Toggle>
                  {/* The showcase speaks with the browser's own voice, so there is no voice to pick. */}
                  <fieldset className={`${v.demo ? "hidden" : "flex"} flex-wrap items-center gap-1`}>
                    <legend className="sr-only">Voice</legend>
                    <span aria-hidden className="mx-1 font-mono text-xs text-fg-muted">
                      Voice
                    </span>
                    {VOICE_OPTIONS.map((o) => (
                      <label
                        key={o.id}
                        className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-transparent px-3 text-sm text-fg-muted transition-colors duration-(--duration-base) hover:text-fg has-checked:border-border-strong has-checked:bg-surface-raised has-checked:text-fg has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ring md:min-h-9"
                      >
                        <input
                          type="radio"
                          name="offstage-voice"
                          value={o.id}
                          checked={v.voiceId === o.id}
                          onChange={() => v.setVoiceId(o.id)}
                          className="sr-only"
                        />
                        {o.label}
                        <span className="sr-only">, {o.detail}</span>
                      </label>
                    ))}
                  </fieldset>
                </div>
              </div>
            </div>

            {panel ? (
              <aside
                id="voice-panel"
                aria-label="This session"
                className={`${css.panel} flex w-full min-w-0 flex-col border-border md:w-[26rem] md:border-l`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 pt-2 pb-3 md:px-5">
                  <h3 className="kicker text-fg-muted">This session</h3>
                  {median != null ? (
                    <Badge tone="neutral" className="tabular-nums">
                      Median {ms(median)} to first sound
                    </Badge>
                  ) : null}
                </div>
                {v.turns.length ? null : (
                  <p className="px-4 text-sm text-fg-muted md:px-5">
                    No commands yet. Each one lands here with its timing and cost.
                  </p>
                )}
                <ol
                  aria-label="Voice transcript"
                  className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-4 pb-4 text-sm md:px-5"
                >
                  {v.turns.map((t) => {
                    const cost = t.costUsd.stt + t.costUsd.model + t.costUsd.voice;
                    return (
                      <li
                        key={t.id}
                        data-intent={t.intent ?? ""}
                        data-latency={t.latencyMs ?? ""}
                        className="flex flex-col gap-1.5 rounded-card border border-border bg-surface p-3"
                      >
                        <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs text-fg-muted">
                          <span className="tabular-nums">{formatTime(t.at)}</span>
                          <Badge tone="neutral">{t.via === "voice" ? "Voice" : "Typed"}</Badge>
                          {t.intent ? (
                            <Badge tone={t.intent === "blocked" ? "danger" : "agent"}>
                              {t.intent.replace(/_/g, " ")}
                            </Badge>
                          ) : null}
                          {t.interrupted ? <Badge tone="pending">Interrupted</Badge> : null}
                          {t.replies.some((r) => r.fallback) ? (
                            <Badge tone="pending">Browser voice</Badge>
                          ) : null}
                          {t.latencyMs ? (
                            <span className="tabular-nums">{ms(t.latencyMs)} to first sound</span>
                          ) : null}
                          {t.sttMs ? (
                            <span className="tabular-nums">
                              (heard in {ms(t.sttMs)}
                              {t.firstSayMs !== undefined ? `, first line in ${ms(t.firstSayMs)}` : ""})
                            </span>
                          ) : null}
                          {cost >= 0.00005 ? <span className="tabular-nums">{usd(cost)}</span> : null}
                        </div>
                        <p>
                          <span className="font-semibold">You: </span>
                          {t.you}
                        </p>
                        {t.replies.map((r, i) => (
                          <p key={i} className={r.kind === "filler" ? "text-fg-muted" : undefined}>
                            <span className="font-semibold">Offstage: </span>
                            {r.text}
                          </p>
                        ))}
                        {t.followUp && !t.replies.some((r) => r.text === t.followUp) ? (
                          <p>
                            <span className="font-semibold">Offstage: </span>
                            {t.followUp}
                          </p>
                        ) : null}
                      </li>
                    );
                  })}
                </ol>
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
