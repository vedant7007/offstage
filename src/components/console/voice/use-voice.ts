"use client";

// The voice Commander's client: mic and VAD, STT upload, the streamed turn, sentence-by-sentence Murf playback with
// barge-in, the plan strip, and per-turn latency (end of speech to first audio) and cost.

import * as React from "react";
import type { TranscribeResponse, VoiceEvent, VoiceIntent, VoiceStep } from "@/contracts";
import { Mic, Player, speakFallback } from "./audio";

export type Mode = "off" | "idle" | "listening" | "hearing" | "thinking" | "speaking";
export type VoiceId = "en-US-matthew" | "en-IN-priya" | "en-US-natalie";
export const VOICE_OPTIONS: { id: VoiceId; label: string; detail: string }[] = [
  { id: "en-US-matthew", label: "Matthew", detail: "Warm and steady (default)" },
  { id: "en-IN-priya", label: "Priya", detail: "Indian English, friendly" },
  { id: "en-US-natalie", label: "Natalie", detail: "Calm and assured" },
];
export type Turn = {
  id: string;
  at: string;
  you: string;
  via: "voice" | "keyboard";
  intent?: VoiceIntent;
  by?: string;
  replies: { text: string; kind: string; fallback?: boolean }[];
  /** End of speech (or Enter) to the first sound. */
  latencyMs?: number;
  /** Of which: STT, then the turn's first sentence, then TTS first audio. */
  sttMs?: number;
  firstSayMs?: number;
  costUsd: { stt: number; model: number; voice: number };
  interrupted?: boolean;
};
export type Steps = Record<VoiceStep, { state: "todo" | "active" | "done"; label: string }>;
const EMPTY_STEPS: Steps = {
  plan: { state: "todo", label: "Plan" },
  delegate: { state: "todo", label: "Delegate" },
  execute: { state: "todo", label: "Execute" },
  approve: { state: "todo", label: "Approve" },
};
const WAKE = /^\s*(hey|hi|ok|okay|hello)[\s,.!]+(off\s?stage|of\s?stage|offset|off\s?state)\b[\s,.!?]*/i;
const AWAKE_MS = 10_000;
/** "Hey Offstage" on its own: answered here, nothing goes to the Commander. */
const WAKE_ONLY = "wake:only";
/** Push to talk caught nothing usable: ask again here, nothing goes to the Commander. */
const AGAIN_ONLY = "again:only";
const SAY_AGAIN = "Sorry, say that again or type it.";

// Shared with the Live Stage (node lights, glass box cost) without a context provider.
type Shared = { last: Turn | null };
const shared: Shared = { last: null };
const listeners = new Set<() => void>();
export const voiceShared = {
  subscribe: (f: () => void) => (listeners.add(f), () => listeners.delete(f)),
  get: () => shared.last,
};
const publish = (t: Turn) => {
  shared.last = t;
  listeners.forEach((f) => f());
};

const newId = () => `v${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
const voiceListeners = new Set<() => void>();
const voiceStore = {
  subscribe: (f: () => void) => (voiceListeners.add(f), () => voiceListeners.delete(f)),
  set: (v: VoiceId) => {
    try {
      localStorage.setItem("offstage:voice", v);
    } catch {
      // private mode: the choice lasts until reload
    }
    memoryVoice = v;
    voiceListeners.forEach((f) => f());
  },
};
let memoryVoice: VoiceId | null = null;
const readVoice = (): VoiceId => {
  if (memoryVoice) return memoryVoice;
  try {
    const v = localStorage.getItem("offstage:voice") as VoiceId | null;
    return VOICE_OPTIONS.some((o) => o.id === v) ? v! : "en-US-matthew";
  } catch {
    return "en-US-matthew";
  }
};

export function useVoice(opts: { onOpenProposal: (id: string) => void }) {
  const [mode, setMode] = React.useState<Mode>("off");
  const [handsFree, setHandsFree] = React.useState(false);
  const voiceId = React.useSyncExternalStore(
    voiceStore.subscribe,
    readVoice,
    () => "en-US-matthew" as VoiceId,
  );
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [steps, setSteps] = React.useState<Steps>(EMPTY_STEPS);
  const [caption, setCaption] = React.useState<{ you: string; offstage: string }>({ you: "", offstage: "" });
  const [level, setLevel] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);
  const mic = React.useRef<Mic | null>(null);
  const player = React.useRef<Player | null>(null);
  const abort = React.useRef<AbortController | null>(null);
  const turnRef = React.useRef<Turn | null>(null);
  const handsFreeRef = React.useRef(false);
  const awakeUntil = React.useRef(0);
  const pttArmed = React.useRef(false);
  const streamDone = React.useRef(true);
  const voiceRef = React.useRef<VoiceId>("en-US-matthew");
  const openRef = React.useRef(opts.onOpenProposal);

  const setVoiceId = (v: VoiceId) => voiceStore.set(v);
  React.useEffect(() => {
    voiceRef.current = voiceId;
  }, [voiceId]);
  React.useEffect(() => {
    openRef.current = opts.onOpenProposal;
  }, [opts.onOpenProposal]);

  const update = React.useCallback((f: (t: Turn) => void) => {
    const t = turnRef.current;
    if (!t) return;
    f(t);
    const copy = { ...t, replies: [...t.replies], costUsd: { ...t.costUsd } };
    setTurns((all) => [copy, ...all.filter((x) => x.id !== t.id)].slice(0, 50));
    publish(copy);
  }, []);

  const settle = React.useCallback(() => {
    if (!streamDone.current || player.current?.busy || window.speechSynthesis?.speaking) return;
    if (mic.current) mic.current.playing = false;
    if (mic.current) mic.current.armed = handsFreeRef.current;
    setMode(mic.current?.isOpen ? (handsFreeRef.current ? "listening" : "idle") : "off");
  }, []);

  const stopSpeaking = React.useCallback(() => {
    abort.current?.abort();
    player.current?.stop();
    window.speechSynthesis?.cancel();
    if (mic.current) mic.current.playing = false;
    if (turnRef.current && !streamDone.current) update((t) => (t.interrupted = true));
    streamDone.current = true;
  }, [update]);

  /** Runs one turn: streams the Commander's events and speaks each sentence as soon as it arrives. */
  const run = React.useCallback(
    async (text: string, via: "voice" | "keyboard", endedAt: number, sttMs?: number, sttCost = 0) => {
      stopSpeaking();
      const ctl = new AbortController();
      abort.current = ctl;
      streamDone.current = false;
      const turn: Turn = {
        id: newId(),
        at: new Date().toISOString(),
        you: text === WAKE_ONLY ? "Hey Offstage" : text === AGAIN_ONLY ? "(not caught)" : text,
        via,
        replies: [],
        sttMs,
        costUsd: { stt: sttCost, model: 0, voice: 0 },
      };
      turnRef.current = turn;
      update(() => undefined);
      setSteps(EMPTY_STEPS);
      setCaption({ you: turn.you, offstage: "" });
      setMode("thinking");
      const sentAt = performance.now();
      let chain = Promise.resolve();
      let inFlight = 0;
      const waiting: (() => void)[] = [];
      const slot = () =>
        new Promise<[() => void]>((resolve) => {
          const take = () => {
            inFlight++;
            resolve([
              () => {
                inFlight--;
                waiting.shift()?.();
              },
            ]);
          };
          if (inFlight < 2) take();
          else waiting.push(take);
        });
      let firstSound = true;
      const speakLine = (line: string, kind: string) => {
        // Ask for the audio now, play it after the sentence before: synthesis overlaps playback. At most two
        // requests are in flight (Murf's per-region concurrency), the rest wait their turn.
        const audio = slot().then(([release]) =>
          fetch("/api/agents/voice/tts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ turnId: turn.id, text: line, voiceId: voiceRef.current }),
            signal: ctl.signal,
          })
            .then(async (r) => {
              // Hold the slot until the audio has fully arrived.
              if (!r.ok || !r.body) {
                release();
                return r;
              }
              const [a, b] = r.body.tee();
              void (async () => {
                const rd = b.getReader();
                while (!(await rd.read().catch(() => ({ done: true }))).done);
                release();
              })();
              return new Response(a, { status: r.status, headers: r.headers });
            })
            .catch(() => (release(), null)),
        );
        chain = chain.then(async () => {
          if (ctl.signal.aborted) return;
          const res = await audio;
          const onFirst = () => {
            setMode("speaking");
            setCaption((c) => ({ ...c, offstage: line }));
            if (mic.current) {
              mic.current.playing = true;
              mic.current.armed = true; // barge-in: speaking over Offstage interrupts it
            }
            if (firstSound) {
              firstSound = false;
              const latencyMs = Math.round(performance.now() - endedAt);
              update((t) => (t.latencyMs = latencyMs));
              console.info(`[voice] end of speech to first audio: ${latencyMs} ms`);
            }
          };
          if (res?.ok && res.body && player.current) {
            update((t) => {
              t.costUsd.voice += Number(res.headers.get("x-cost-usd") ?? 0);
              t.replies.push({ text: line, kind });
            });
            await player.current.play(res.body, Number(res.headers.get("x-sample-rate") ?? 24000), onFirst);
          } else if (!ctl.signal.aborted) {
            update((t) => t.replies.push({ text: line, kind, fallback: true }));
            onFirst();
            await speakFallback(line);
            settle();
          }
        });
      };
      try {
        if (text === WAKE_ONLY) {
          speakLine("Yes, I'm listening.", "answer");
          return;
        }
        if (text === AGAIN_ONLY) {
          speakLine(SAY_AGAIN, "answer");
          return;
        }
        const res = await fetch("/api/agents/voice/turn", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ turnId: turn.id, text, via }),
          signal: ctl.signal,
        });
        if (!res.ok || !res.body)
          throw new Error(
            res.status === 429 ? "Too many commands, wait a minute" : "The Commander did not answer",
          );
        const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
        let buf = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += value;
          let nl: number;
          while ((nl = buf.indexOf("\n")) >= 0) {
            const raw = buf.slice(0, nl);
            buf = buf.slice(nl + 1);
            if (!raw.trim()) continue;
            const e = JSON.parse(raw) as VoiceEvent;
            if (e.type === "intent") update((t) => ((t.intent = e.intent), (t.by = e.by)));
            else if (e.type === "say") {
              if (turn.firstSayMs === undefined)
                update((t) => (t.firstSayMs = Math.round(performance.now() - sentAt)));
              speakLine(e.text, e.kind);
            } else if (e.type === "stage") {
              setSteps((s) => {
                const next = { ...s, [e.step]: { state: e.state, label: e.label } };
                // Earlier steps are done once a later one starts.
                const order: VoiceStep[] = ["plan", "delegate", "execute", "approve"];
                for (const k of order.slice(0, order.indexOf(e.step)))
                  if (next[k].state !== "done") next[k] = { ...next[k], state: "done" };
                return next;
              });
              window.dispatchEvent(new CustomEvent("offstage:voice-stage", { detail: e }));
            } else if (e.type === "open") {
              const ev = new CustomEvent("offstage:open-proposal", { detail: e, cancelable: true });
              if (window.dispatchEvent(ev)) openRef.current(e.proposalId);
              // The stream stays open until the tap, to say what was sent; the dock is free meanwhile.
              streamDone.current = true;
            } else if (e.type === "done") update((t) => (t.costUsd.model = e.costUsd));
            else if (e.type === "error") setError(e.message);
          }
        }
      } catch (err) {
        if (!ctl.signal.aborted) {
          setError(err instanceof Error ? err.message : "The turn failed");
          speakLine("Sorry, I lost the connection. Try again.", "answer");
        }
      } finally {
        await chain.catch(() => undefined);
        if (abort.current === ctl) {
          streamDone.current = true;
          settle();
        }
      }
    },
    [stopSpeaking, update, settle],
  );

  const onUtterance = React.useCallback(
    async (wav: Blob, _lastVoiceAt: number, endedAt: number) => {
      if (!handsFreeRef.current) pttArmed.current = false;
      if (mic.current && !handsFreeRef.current && !player.current?.busy) mic.current.armed = false;
      setMode("thinking");
      setCaption({ you: "...", offstage: "" });
      const fd = new FormData();
      fd.append("audio", wav, "speech.wav");
      const t0 = performance.now();
      const res = await fetch("/api/agents/voice/transcribe", { method: "POST", body: fd }).catch(() => null);
      if (!res?.ok) {
        setError(res?.status === 429 ? "Too many voice commands, wait a minute" : "I could not hear that");
        settle();
        return;
      }
      const stt = (await res.json()) as TranscribeResponse;
      const sttMs = Math.round(performance.now() - t0);
      let text = stt.text.trim();
      if (!text || /^[\s.!?,]*$/.test(text) || /^(thank you\.?|you)$/i.test(text)) {
        // Silence or a whisper hallucination on noise. Push to talk asks again; hands-free stays quiet.
        if (!handsFreeRef.current || Date.now() < awakeUntil.current) {
          void run(AGAIN_ONLY, "voice", endedAt, sttMs, stt.costUsd);
          return;
        }
        setCaption({ you: "", offstage: "" });
        settle();
        return;
      }
      if (handsFreeRef.current && Date.now() > awakeUntil.current) {
        if (!WAKE.test(text)) {
          settle();
          return; // hands-free listens only after "Hey Offstage"
        }
        text = text.replace(WAKE, "").trim();
        awakeUntil.current = Date.now() + AWAKE_MS;
        if (!text) {
          void run(WAKE_ONLY, "voice", endedAt, sttMs, stt.costUsd);
          return;
        }
      }
      awakeUntil.current = Date.now() + AWAKE_MS;
      void run(text, "voice", endedAt, sttMs, stt.costUsd);
    },
    [run, settle],
  );

  const ensureOpen = React.useCallback(async () => {
    if (mic.current?.isOpen) return true;
    try {
      player.current ??= new Player();
      player.current.onIdle = () => settle();
      const m = new Mic({
        level: (rms) => setLevel(rms),
        speechStart: () => {
          // Barge-in: stop talking the moment the organiser speaks.
          if (player.current?.busy || window.speechSynthesis?.speaking || !streamDone.current) stopSpeaking();
          setMode("hearing");
        },
        utterance: (wav, last, ended) => void onUtterance(wav, last, ended),
      });
      await m.open();
      mic.current = m;
      setError(null);
      return true;
    } catch {
      setError("Microphone blocked. Allow it in the browser, or type below.");
      return false;
    }
  }, [onUtterance, settle, stopSpeaking]);

  /** Push to talk: one utterance, ended by silence. Pressing again while it talks interrupts it. */
  const talk = React.useCallback(async () => {
    if (!(await ensureOpen())) return;
    if (player.current?.busy || !streamDone.current) stopSpeaking();
    pttArmed.current = true;
    mic.current!.armed = true;
    awakeUntil.current = Date.now() + AWAKE_MS;
    setMode("listening");
  }, [ensureOpen, stopSpeaking]);

  const toggleHandsFree = React.useCallback(async () => {
    const on = !handsFreeRef.current;
    if (on && !(await ensureOpen())) return;
    handsFreeRef.current = on;
    setHandsFree(on);
    if (mic.current) mic.current.armed = on || pttArmed.current;
    setMode(mic.current?.isOpen ? (on ? "listening" : "idle") : "off");
  }, [ensureOpen]);

  const type = React.useCallback(
    (text: string) => {
      player.current ??= new Player();
      player.current.onIdle = () => settle();
      void run(text, "keyboard", performance.now());
    },
    [run, settle],
  );

  React.useEffect(
    () => () => {
      abort.current?.abort();
      mic.current?.close();
      player.current?.stop();
    },
    [],
  );

  return {
    mode,
    handsFree,
    voiceId,
    setVoiceId,
    turns,
    steps,
    caption,
    level,
    error,
    analyser: () => player.current?.analyser ?? null,
    talk,
    toggleHandsFree,
    type,
    stop: () => {
      stopSpeaking();
      settle();
    },
  };
}
