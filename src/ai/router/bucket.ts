// Per provider-model rate bucket (ADR-001 section 2). We skip a provider before Groq returns a 429, not after.
// Tracks requests/min and tokens/min over a sliding 60s window, plus a daily token counter,
// and resyncs from Groq's x-ratelimit-* response headers after every call.

type Limits = { rpm: number; tpm: number; tpd: number };

const num = (v: string | undefined, d: number) => (v ? Number(v) : d);
const env = process.env;

// Groq free tier, verified 2026-09-30 at console.groq.com/docs/rate-limits. Raise via env after the paid upgrade.
const GROQ_CHAT: Limits = {
  rpm: num(env.GROQ_RPM, 30),
  tpm: num(env.GROQ_TPM, 8000),
  tpd: num(env.GROQ_TPD, 200_000),
};
const LIMITS: Record<string, Limits> = {
  "groq:openai/gpt-oss-120b": GROQ_CHAT,
  "groq:openai/gpt-oss-20b": GROQ_CHAT,
  "groq:meta-llama/llama-prompt-guard-2-86m": { rpm: 30, tpm: 15_000, tpd: 500_000 },
};

const MINUTE = 60_000;
const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10); // Groq resets daily limits on UTC days.

/** "2m59.56s", "7.66s", "120ms" -> milliseconds */
export function parseReset(v: string | null | undefined): number | undefined {
  if (!v) return undefined;
  const m = /^(?:(\d+)h)?(?:(\d+)m(?!s))?(?:([\d.]+)s)?(?:([\d.]+)ms)?$/.exec(v.trim());
  if (!m || !m[0]) return undefined;
  const [, h, min, s, ms] = m;
  return ((Number(h ?? 0) * 60 + Number(min ?? 0)) * 60 + Number(s ?? 0)) * 1000 + Number(ms ?? 0);
}

export class Bucket {
  private window: { at: number; tokens: number }[] = [];
  private day = "";
  private dayTokens = 0;
  // Server view from the last response headers, trusted until its reset time passes.
  private hdrTokens?: { remaining: number; until: number };
  private hdrRequests?: { remaining: number; until: number };

  constructor(readonly limits: Limits) {}

  private prune(now: number) {
    this.window = this.window.filter((e) => now - e.at < MINUTE);
    if (utcDay(now) !== this.day) {
      this.day = utcDay(now);
      this.dayTokens = 0;
    }
  }

  canTake(tokens: number, now = Date.now()): boolean {
    this.prune(now);
    const used = this.window.reduce((s, e) => s + e.tokens, 0);
    if (this.window.length >= this.limits.rpm) return false;
    if (used + tokens > this.limits.tpm) return false;
    if (this.dayTokens + tokens > this.limits.tpd) return false;
    if (this.hdrTokens && now < this.hdrTokens.until && this.hdrTokens.remaining < tokens) return false;
    if (this.hdrRequests && now < this.hdrRequests.until && this.hdrRequests.remaining < 1) return false;
    return true;
  }

  /** Reserve an estimate before the call. Returns a settle function for the actual count. */
  take(estimate: number, now = Date.now()): (actual: number) => void {
    this.prune(now);
    const entry = { at: now, tokens: estimate };
    this.window.push(entry);
    this.dayTokens += estimate;
    return (actual) => {
      this.dayTokens += actual - entry.tokens;
      entry.tokens = actual;
    };
  }

  /** Groq: remaining-tokens is per minute, remaining-requests is per day. */
  sync(headers: Record<string, string | undefined> | undefined, now = Date.now()) {
    if (!headers) return;
    const tok = headers["x-ratelimit-remaining-tokens"];
    const req = headers["x-ratelimit-remaining-requests"];
    if (tok !== undefined)
      this.hdrTokens = {
        remaining: Number(tok),
        until: now + (parseReset(headers["x-ratelimit-reset-tokens"]) ?? MINUTE),
      };
    if (req !== undefined)
      this.hdrRequests = {
        remaining: Number(req),
        until: now + (parseReset(headers["x-ratelimit-reset-requests"]) ?? MINUTE),
      };
  }
}

const buckets = new Map<string, Bucket>();

/** Bucket for a provider-model, or undefined when that model has no known limits (Bedrock, Ollama). */
export function bucketFor(provider: string, model: string): Bucket | undefined {
  const key = `${provider}:${model}`;
  const limits = LIMITS[key];
  if (!limits) return undefined;
  let b = buckets.get(key);
  if (!b) buckets.set(key, (b = new Bucket(limits)));
  return b;
}
