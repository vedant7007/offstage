// Redaction for trace rows. Reuses the logger's PII key list but applies it at any depth,
// because tool output is often a list of rows, and masks email and phone patterns inside free text.

import { REDACTED, REDACT_PATHS } from "@/lib/logger";

const KEYS = new Set(
  REDACT_PATHS.map((p) => p.replace(/^(\*\.)+/, ""))
    .filter((p) => /^\w+$/.test(p))
    .map((k) => k.toLowerCase()),
);
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const PHONE = /(?:\+?91[\s-]?)?\b[6-9]\d{4}[\s-]?\d{5}\b/g;
const MAX_STRING = 500;
const MAX_ITEMS = 25;

export function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[truncated]";
  if (typeof value === "string") {
    const masked = value.replace(EMAIL, "[email]").replace(PHONE, "[phone]");
    return masked.length > MAX_STRING ? `${masked.slice(0, MAX_STRING)}...[truncated]` : masked;
  }
  if (Array.isArray(value)) {
    const items = value.slice(0, MAX_ITEMS).map((v) => redact(v, depth + 1));
    return value.length > MAX_ITEMS ? [...items, `[${value.length - MAX_ITEMS} more]`] : items;
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, KEYS.has(k.toLowerCase()) ? REDACTED : redact(v, depth + 1)]),
    );
  }
  return value;
}
