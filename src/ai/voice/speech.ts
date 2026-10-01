// Speech in and out for the voice Commander. STT: Groq whisper-large-v3-turbo (measured about 200 to 250 ms for a
// short clip). TTS: Murf Falcon streaming from the global host (measured first byte about 110 ms for MP3, 290 ms
// for PCM on a cold connection). Both count toward the daily model spend cap. Keys never leave the server.

import { dailyCapHit, recordUsage } from "@/ai/router/budget";
import { WHISPER_USD_PER_HOUR } from "@/ai/router/pricing";

/** Murf Falcon API, USD per 1000 characters (murf.ai/pricing, checked 2026-10-01). */
export const MURF_USD_PER_1K_CHARS = 0.01;
const MURF_URL = "https://global.api.murf.ai/v1/speech/stream";
const GROQ_STT_URL = "https://api.groq.com/openai/v1/audio/transcriptions";
/** Groq bills at least 10 seconds of audio per request. */
const MIN_BILLED_SECONDS = 10;
// Forcing English with a Hinglish prompt keeps Hinglish in Roman letters ("lunch kahan milega"), which intent
// matching and captions need; without it whisper writes Devanagari.
const HINGLISH_PROMPT =
  "Event organiser speaking English or Hinglish, written in Roman letters: lunch kahan milega, kya hua, theek hai. Offstage, HackNova, Lab 204, keynote, volunteer, Scheduler, Crew Chief.";

/**
 * Three warm, confident Falcon voices; the first is the default (the voice of the earlier Murf agents, which use
 * style "Conversation", not "Conversational"). en-US-ken and en-IN-rohan are not available on Falcon.
 */
export const VOICES = [
  {
    id: "en-US-matthew",
    label: "Matthew",
    detail: "American English, warm and steady",
    style: "Conversation",
  },
  {
    id: "en-IN-priya",
    label: "Priya",
    detail: "Indian English, friendly and clear",
    style: "Conversational",
  },
  {
    id: "en-US-natalie",
    label: "Natalie",
    detail: "American English, calm and assured",
    style: "Conversational",
  },
] as const;
export type VoiceId = (typeof VOICES)[number]["id"];
export const DEFAULT_VOICE: VoiceId = VOICES[0].id;

export class SpeechError extends Error {
  constructor(
    readonly code: "cap" | "provider" | "config",
    message: string,
  ) {
    super(message);
  }
}

export async function transcribe(
  audio: Blob,
  runId: string,
): Promise<{ text: string; ms: number; costUsd: number; seconds: number }> {
  if (!process.env.GROQ_API_KEY) throw new SpeechError("config", "Speech to text is not configured");
  if (dailyCapHit()) throw new SpeechError("cap", "Today's model budget is spent");
  const fd = new FormData();
  fd.append("file", audio, "speech.webm");
  fd.append("model", "whisper-large-v3-turbo");
  fd.append("response_format", "verbose_json");
  fd.append("temperature", "0");
  fd.append("language", "en");
  fd.append("prompt", HINGLISH_PROMPT);
  const t0 = performance.now();
  const res = await fetch(GROQ_STT_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}` },
    body: fd,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new SpeechError("provider", `Transcription failed (${res.status})`);
  const j = (await res.json()) as { text?: string; duration?: number };
  const seconds = Number(j.duration ?? 0);
  const costUsd = (Math.max(seconds, MIN_BILLED_SECONDS) / 3600) * WHISPER_USD_PER_HOUR;
  recordUsage(runId, 0, costUsd);
  return { text: (j.text ?? "").trim(), ms: Math.round(performance.now() - t0), costUsd, seconds };
}

/** Raw 16-bit little-endian mono PCM at 24 kHz, streamed, so the browser can play the first chunk at once. */
export const TTS_SAMPLE_RATE = 24000;

export async function speak(
  text: string,
  voiceId: VoiceId,
  runId: string,
  signal?: AbortSignal,
): Promise<{ body: ReadableStream<Uint8Array>; costUsd: number }> {
  const key = process.env.MURF_API_KEY;
  if (!key) throw new SpeechError("config", "Murf is not configured");
  if (dailyCapHit()) throw new SpeechError("cap", "Today's model budget is spent");
  const voice = VOICES.find((v) => v.id === voiceId) ?? VOICES[0];
  const res = await fetch(MURF_URL, {
    method: "POST",
    headers: { "api-key": key, "content-type": "application/json" },
    body: JSON.stringify({
      text,
      voiceId: voice.id,
      style: voice.style,
      model: "falcon-2",
      format: "PCM",
      sampleRate: TTS_SAMPLE_RATE,
      channelType: "MONO",
    }),
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  });
  if (!res.ok || !res.body) throw new SpeechError("provider", `Murf failed (${res.status})`);
  const costUsd = (text.length / 1000) * MURF_USD_PER_1K_CHARS;
  recordUsage(runId, 0, costUsd);
  return { body: res.body, costUsd };
}
