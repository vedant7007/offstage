// Browser audio for the voice Commander: a mic tap with voice activity detection and pre-roll (so the first
// syllable is never cut), WAV encoding at 16 kHz for the STT upload, and a streaming PCM player that starts on the
// first chunk and stops at once for barge-in. No dependencies: AudioWorklet, AnalyserNode and AudioBufferSourceNode.

const WORKLET = `class Tap extends AudioWorkletProcessor {
  process(inputs) { const ch = inputs[0] && inputs[0][0]; if (ch) this.port.postMessage(ch.slice(0)); return true; }
}
registerProcessor("offstage-tap", Tap);`;

export const VAD = {
  /** End of speech after this much silence (the brief asks for 500 to 700 ms). */
  silenceMs: 600,
  /** Speech must last this long to count, so a cough or a click does not start a turn. */
  minSpeechMs: 180,
  /** Kept from before the speech started. */
  preRollMs: 300,
  /** Longest single command. */
  maxUtteranceMs: 15_000,
  /** Over the measured noise floor by this factor, and never below the absolute floor. */
  ratio: 3,
  minRms: 0.012,
  /** While Offstage is talking, the bar to interrupt it is higher (its own voice leaks past echo cancellation). */
  bargeInRatio: 2.2,
};

export type MicEvents = {
  level: (rms: number, speaking: boolean) => void;
  speechStart: () => void;
  /** The utterance as 16 kHz WAV, and when the silence that ended it began (performance.now()). */
  utterance: (wav: Blob, lastVoiceAt: number, endedAt: number) => void;
};

/** The microphone, always listening while open; `armed` decides whether speech becomes an utterance. */
export class Mic {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private node: AudioWorkletNode | null = null;
  private rate = 48000;
  private ring: Float32Array[] = [];
  private ringMs = 0;
  private chunks: Float32Array[] = [];
  private noise = 0.01;
  private aboveMs = 0;
  private belowMs = 0;
  private inSpeech = false;
  private speechMs = 0;
  private lastVoiceAt = 0;
  armed = false;
  /** Raised while Offstage speaks, for barge-in. */
  playing = false;

  constructor(private on: MicEvents) {}

  async open() {
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    this.ctx = new AudioContext();
    this.rate = this.ctx.sampleRate;
    const url = URL.createObjectURL(new Blob([WORKLET], { type: "text/javascript" }));
    await this.ctx.audioWorklet.addModule(url);
    URL.revokeObjectURL(url);
    const src = this.ctx.createMediaStreamSource(this.stream);
    this.node = new AudioWorkletNode(this.ctx, "offstage-tap");
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.frame(e.data);
    src.connect(this.node);
  }

  close() {
    this.node?.disconnect();
    this.stream?.getTracks().forEach((t) => t.stop());
    void this.ctx?.close();
    this.ctx = null;
    this.armed = false;
  }

  get isOpen() {
    return Boolean(this.ctx);
  }

  private frame(f: Float32Array) {
    const ms = (f.length / this.rate) * 1000;
    let sum = 0;
    for (let i = 0; i < f.length; i++) sum += f[i]! * f[i]!;
    const rms = Math.sqrt(sum / f.length);
    const bar = Math.max(VAD.minRms, this.noise * VAD.ratio) * (this.playing ? VAD.bargeInRatio : 1);
    const voiced = rms > bar;
    if (!this.inSpeech && !voiced) this.noise = this.noise * 0.995 + rms * 0.005; // the room's floor, slowly
    this.on.level(rms, this.inSpeech);

    // Pre-roll ring.
    this.ring.push(f);
    this.ringMs += ms;
    while (this.ringMs > VAD.preRollMs && this.ring.length > 1)
      this.ringMs -= (this.ring.shift()!.length / this.rate) * 1000;

    if (!this.armed) {
      this.reset();
      return;
    }
    if (!this.inSpeech) {
      this.aboveMs = voiced ? this.aboveMs + ms : 0;
      if (this.aboveMs >= VAD.minSpeechMs) {
        this.inSpeech = true;
        this.chunks = [...this.ring];
        this.speechMs = this.ringMs;
        this.belowMs = 0;
        this.lastVoiceAt = performance.now();
        this.on.speechStart();
      }
      return;
    }
    this.chunks.push(f);
    this.speechMs += ms;
    if (voiced) {
      this.belowMs = 0;
      this.lastVoiceAt = performance.now();
    } else this.belowMs += ms;
    if (this.belowMs >= VAD.silenceMs || this.speechMs >= VAD.maxUtteranceMs) {
      const wav = encodeWav(this.chunks, this.rate);
      const last = this.lastVoiceAt;
      this.reset();
      this.on.utterance(wav, last, performance.now());
    }
  }

  private reset() {
    this.inSpeech = false;
    this.aboveMs = 0;
    this.belowMs = 0;
    this.speechMs = 0;
    this.chunks = [];
  }
}

/** Mono 16-bit WAV at 16 kHz (what whisper wants), downsampled by averaging. */
export function encodeWav(chunks: Float32Array[], rate: number, out = 16000): Blob {
  const total = chunks.reduce((n, c) => n + c.length, 0);
  const all = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  const step = rate / out;
  const n = Math.floor(total / step);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.floor(i * step);
    const b = Math.min(total, Math.floor((i + 1) * step));
    let s = 0;
    for (let j = a; j < b; j++) s += all[j]!;
    const v = Math.max(-1, Math.min(1, s / Math.max(1, b - a)));
    pcm[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  const h = new DataView(new ArrayBuffer(44));
  const w = (p: number, s: string) => [...s].forEach((c, i) => h.setUint8(p + i, c.charCodeAt(0)));
  w(0, "RIFF");
  h.setUint32(4, 36 + pcm.byteLength, true);
  w(8, "WAVE");
  w(12, "fmt ");
  h.setUint32(16, 16, true);
  h.setUint16(20, 1, true);
  h.setUint16(22, 1, true);
  h.setUint32(24, out, true);
  h.setUint32(28, out * 2, true);
  h.setUint16(32, 2, true);
  h.setUint16(34, 16, true);
  w(36, "data");
  h.setUint32(40, pcm.byteLength, true);
  return new Blob([h.buffer, pcm.buffer], { type: "audio/wav" });
}

/**
 * Plays streamed 16-bit mono PCM, sentence after sentence, without gaps. `stop()` silences everything at once
 * (barge-in). An analyser on the output drives the speaking waveform.
 */
export class Player {
  readonly ctx: AudioContext;
  readonly analyser: AnalyserNode;
  private sources = new Set<AudioBufferSourceNode>();
  private nextAt = 0;
  private generation = 0;
  onIdle: (() => void) | null = null;

  constructor() {
    this.ctx = new AudioContext();
    this.analyser = this.ctx.createAnalyser();
    this.analyser.fftSize = 256;
    this.analyser.connect(this.ctx.destination);
  }

  get busy() {
    return this.sources.size > 0;
  }

  /** Streams one sentence's PCM; resolves when it has been fully scheduled. Calls onFirst at the first sound. */
  async play(body: ReadableStream<Uint8Array>, rate: number, onFirst: () => void): Promise<void> {
    const gen = this.generation;
    if (this.ctx.state === "suspended") await this.ctx.resume();
    const reader = body.getReader();
    let carry: Uint8Array | null = null;
    let first = true;
    for (;;) {
      const { done, value } = await reader.read();
      if (gen !== this.generation) {
        void reader.cancel();
        return;
      }
      if (done) break;
      let bytes = value;
      if (carry) {
        bytes = new Uint8Array(carry.length + value.length);
        bytes.set(carry);
        bytes.set(value, carry.length);
        carry = null;
      }
      if (bytes.length % 2) {
        carry = bytes.slice(-1);
        bytes = bytes.slice(0, -1);
      }
      if (!bytes.length) continue;
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const buf = this.ctx.createBuffer(1, bytes.length / 2, rate);
      const ch = buf.getChannelData(0);
      for (let i = 0; i < ch.length; i++) ch[i] = view.getInt16(i * 2, true) / 0x8000;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.connect(this.analyser);
      const at = Math.max(this.ctx.currentTime + 0.02, this.nextAt);
      src.start(at);
      this.nextAt = at + buf.duration;
      this.sources.add(src);
      src.onended = () => {
        this.sources.delete(src);
        if (!this.sources.size) this.onIdle?.();
      };
      if (first) {
        first = false;
        onFirst();
      }
    }
  }

  stop() {
    this.generation++;
    for (const s of this.sources) {
      try {
        s.stop();
      } catch {
        // already ended
      }
    }
    this.sources.clear();
    this.nextAt = 0;
  }
}

/** Browser speech when Murf is unavailable, tagged "fallback voice" in the UI. */
export function speakFallback(text: string): Promise<void> {
  return new Promise((resolve) => {
    if (!("speechSynthesis" in window)) return resolve();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "en-IN";
    u.onend = () => resolve();
    u.onerror = () => resolve();
    window.speechSynthesis.speak(u);
  });
}
