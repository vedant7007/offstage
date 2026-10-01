/**
 * PII scrubbing for the showcase fixtures. Deterministic: the same input in the same order gives
 * the same output, and one person keeps one placeholder across every file of a recording.
 *   phones   -> +91 90000 000NN
 *   emails   -> firstname@example.com
 *   chat ids -> 100000NN
 */
const PHONE = /(?<![\w-])(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\w-])/g;
const SAFE_PHONE = /^\+91 90000 000\d\d$/;
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const SAFE_EMAIL = /@example\.com$/i;
const CHAT_ID_KEY = /chat_?id$/i;

/** Every string in `value` that still looks like a real Indian mobile number or a non-example email. */
export function findPii(value: unknown): string[] {
  const found: string[] = [];
  const visit = (v: unknown) => {
    if (typeof v === "string") {
      for (const m of v.match(PHONE) ?? []) if (!SAFE_PHONE.test(m)) found.push(m);
      for (const m of v.match(EMAIL) ?? []) if (!SAFE_EMAIL.test(m)) found.push(m);
    } else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        visit(k);
        visit(x);
      }
    }
  };
  visit(value);
  return found;
}

export function createScrubber() {
  const phones = new Map<string, string>();
  const emails = new Map<string, string>();
  const taken = new Set<string>();
  const chats = new Map<string, string>();

  const phone = (raw: string) => {
    if (SAFE_PHONE.test(raw)) return raw;
    const digits = raw.replace(/\D/g, "").slice(-10);
    let out = phones.get(digits);
    if (!out) {
      if (phones.size >= 99) throw new Error("More than 99 distinct phone numbers to scrub");
      out = `+91 90000 000${String(phones.size + 1).padStart(2, "0")}`;
      phones.set(digits, out);
    }
    return out;
  };

  const email = (raw: string) => {
    if (SAFE_EMAIL.test(raw)) return raw;
    const lower = raw.toLowerCase();
    let out = emails.get(lower);
    if (!out) {
      const first =
        lower
          .split("@")[0]!
          .split(/[._+\-\d]/)
          .find(Boolean) ?? "user";
      const base = first.replace(/[^a-z]/g, "") || "user";
      let name = base;
      for (let i = 2; taken.has(name); i++) name = `${base}${i}`;
      taken.add(name);
      out = `${name}@example.com`;
      emails.set(lower, out);
    }
    return out;
  };

  const chat = (raw: string) => {
    let out = chats.get(raw);
    if (!out) {
      out = `100000${String(chats.size + 1).padStart(2, "0")}`;
      chats.set(raw, out);
    }
    return out;
  };

  const scrub = <T>(value: T): T => {
    const walk = (v: unknown, key?: string): unknown => {
      if (key && CHAT_ID_KEY.test(key) && (typeof v === "string" || typeof v === "number")) {
        const s = chat(String(v));
        return typeof v === "number" ? Number(s) : s;
      }
      if (typeof v === "string") return v.replace(PHONE, phone).replace(EMAIL, email);
      if (Array.isArray(v)) return v.map((x) => walk(x));
      if (v && typeof v === "object")
        return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
      return v;
    };
    return walk(value) as T;
  };

  return { scrub };
}
