// The showcase's ears and voice: the browser's own Web Speech API, so the demo makes no paid speech calls.

/** The part of SpeechRecognition the dock uses (not in every TypeScript DOM lib, and prefixed in Chrome and Safari). */
type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }>;
      }) => void)
    | null;
  onspeechstart: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};
type RecognitionCtor = new () => Recognition;

function ctor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => ctor() !== null;
export const TYPE_ONLY = "Type to talk in this browser";

/**
 * Listens once (or continuously for hands-free) and hands over each final transcript.
 * Returns a stop function, or null when this browser cannot listen.
 */
export function listen(opts: {
  continuous: boolean;
  onSpeech: () => void;
  onText: (text: string) => void;
  onError: (message: string) => void;
  onEnd: () => void;
}): (() => void) | null {
  const C = ctor();
  if (!C) return null;
  const r = new C();
  r.lang = "en-IN";
  r.continuous = opts.continuous;
  r.interimResults = false;
  r.onspeechstart = opts.onSpeech;
  r.onresult = (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i]!;
      if (res.isFinal) opts.onText(res[0]?.transcript ?? "");
    }
  };
  r.onerror = (e) => {
    if (e.error === "no-speech" || e.error === "aborted") return;
    opts.onError(
      e.error === "not-allowed" || e.error === "service-not-allowed"
        ? "Microphone blocked. Allow it in the browser, or type below."
        : "I could not hear that",
    );
  };
  r.onend = opts.onEnd;
  try {
    r.start();
  } catch {
    return null;
  }
  return () => r.abort();
}

/** The most natural English voice on this device: Indian English first, then the chosen accent, then any English. */
export function pickVoice(voices: SpeechSynthesisVoice[], prefer: string): SpeechSynthesisVoice | null {
  const en = voices.filter((v) => /^en[-_]/i.test(v.lang));
  const rank = (v: SpeechSynthesisVoice) =>
    (/natural|neural|online|premium|enhanced|google/i.test(v.name) ? 2 : 0) +
    (v.lang.replace("_", "-").toLowerCase() === prefer.toLowerCase() ? 4 : 0) +
    (/en[-_]in/i.test(v.lang) ? 1 : 0);
  return en.sort((a, b) => rank(b) - rank(a))[0] ?? null;
}

/** Speaks one line with speechSynthesis; resolves when it ends (or at once when the browser has no voice). */
export function speak(text: string, prefer = "en-IN"): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    const v = pickVoice(window.speechSynthesis.getVoices(), prefer);
    if (v) u.voice = v;
    u.lang = v?.lang ?? prefer;
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}
