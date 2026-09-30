import { Faker, base, en, en_IN } from "@faker-js/faker";
import { istToUtc } from "@/lib/time";

/** A faker with Indian English data, seeded so every run produces the same values. */
export function makeFaker(seed: number): Faker {
  const f = new Faker({ locale: [en_IN, en, base] });
  f.seed(seed);
  return f;
}

/** 32-bit string hash (FNV-1a). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic UUID-shaped id from a namespace and key. The same inputs always give the
 * same id, so seeded rows keep their ids across `pnpm demo:reset` and fixtures match the DB.
 * Not cryptographic; only for fixtures and seed data.
 */
export function stableId(namespace: string, key: string | number): string {
  const s = `${namespace}:${key}`;
  const parts = [hash32(s), hash32(`a${s}`), hash32(`b${s}`), hash32(`c${s}`)].map((n) =>
    n.toString(16).padStart(8, "0"),
  );
  const hex = parts.join("");
  // Set the version (4) and variant (8 to b) nibbles so it parses as a v4 UUID.
  const variant = ((parseInt(hex[16] ?? "0", 16) & 0x3) | 0x8).toString(16);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${variant}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** UTC ISO string for an IST wall clock time, e.g. ist("2026-10-24", "09:30"). */
export function ist(date: string, time = "00:00"): string {
  return istToUtc(`${date}T${time}`).toISOString();
}

export function addMinutesIso(iso: string, minutes: number): string {
  return new Date(new Date(iso).getTime() + minutes * 60_000).toISOString();
}

/** Deterministically pick `n` distinct items. */
export function sample<T>(f: Faker, items: readonly T[], n: number): T[] {
  return f.helpers.shuffle([...items]).slice(0, Math.min(n, items.length));
}
