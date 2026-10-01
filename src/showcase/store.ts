/**
 * The showcase visitor's state. Small on purpose: which persona they chose, which recorded phases have
 * played, who approved what, and which demo tickets were scanned. Every response is derived from this
 * plus the fixtures (src/showcase/data.ts), so the same state can travel in a cookie and server pages
 * render exactly what the browser sees. Kept in localStorage (memory if that fails) and mirrored to the
 * cookie; other tabs of the same visitor follow through the storage event.
 */
import * as React from "react";
import { z } from "zod";
import { DemoPersona } from "@/contracts/api";

export const Ledger = z.object({
  v: z.literal(1),
  /** Signed-in persona, null when signed out. */
  persona: DemoPersona.nullable(),
  /** Real time when this demo started; the demo clock runs from world.demoClock at this instant. */
  t0: z.number(),
  /** Played phases in order, as "scenario/phaseId". Their snapshots overlay world.json in this order. */
  phases: z.array(z.string().max(80)).max(40),
  /** Phases still streaming. A reload finishes them at once. */
  playing: z.array(z.string().max(80)).max(40),
  /** Proposal id to the personas who approved it. */
  approvals: z.record(z.string(), z.array(DemoPersona)),
  rejected: z.array(z.string()).max(100),
  /** Ticket id to the check-in time (ISO, demo clock). */
  checkins: z.record(z.string(), z.string()),
});
export type Ledger = z.infer<typeof Ledger>;

export const COOKIE = "offstage_showcase";
const KEY = "offstage:showcase";

export const fresh = (now = Date.now()): Ledger => ({
  v: 1,
  persona: null,
  t0: now,
  phases: [],
  playing: [],
  approvals: {},
  rejected: [],
  checkins: {},
});

export function decode(raw: string | null | undefined): Ledger | null {
  if (!raw) return null;
  try {
    const r = Ledger.safeParse(JSON.parse(raw));
    return r.success ? r.data : null;
  } catch {
    return null;
  }
}

/** The ledger from a Cookie request header, for server components. Signed out when absent. */
export function ledgerFromCookie(cookieHeader: string | undefined): Ledger {
  const m = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]*)`));
  let raw: string | undefined;
  try {
    raw = m?.[1] ? decodeURIComponent(m[1]) : undefined;
  } catch {
    raw = undefined;
  }
  return decode(raw) ?? fresh();
}

// ---------------------------------------------------------------- browser store

let memory: Ledger | null = null;
const listeners = new Set<() => void>();

function writeCookie(l: Ledger) {
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(l))}; path=/; max-age=2592000; samesite=lax`;
}

function load(): Ledger {
  let l: Ledger | null = null;
  try {
    l = decode(localStorage.getItem(KEY));
  } catch {
    // Storage blocked: fall back to the cookie, then to a fresh demo.
  }
  l ??= ledgerFromCookie(document.cookie);
  // A reload cut a phase short: finish it, so the state matches what the recording ended with.
  if (l.playing.length) l = finishPlaying(l);
  persist(l);
  return l;
}

function finishPlaying(l: Ledger): Ledger {
  return { ...l, phases: [...l.phases, ...l.playing.filter((p) => !l.phases.includes(p))], playing: [] };
}

function persist(l: Ledger) {
  try {
    localStorage.setItem(KEY, JSON.stringify(l));
  } catch {
    // Memory only for this page.
  }
  try {
    writeCookie(l);
  } catch {
    // No document (tests): memory only.
  }
}

export function getLedger(): Ledger {
  if (typeof window === "undefined") return memory ?? fresh(0);
  if (!memory) {
    memory = load();
    window.addEventListener("storage", (e) => {
      if (e.key !== KEY) return;
      const next = decode(e.newValue);
      if (!next) return;
      memory = next;
      listeners.forEach((f) => f());
    });
  }
  return memory;
}

export function setLedger(change: (l: Ledger) => Ledger): Ledger {
  memory = change(getLedger());
  persist(memory);
  listeners.forEach((f) => f());
  return memory;
}

export function subscribe(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

/** For React: re-renders when the ledger changes here or in another tab. Null during server render. */
export function useLedger(): Ledger | null {
  return React.useSyncExternalStore(subscribe, getLedger, () => null);
}

/** Tests only. */
export function resetMemoryForTests(l: Ledger | null = null) {
  memory = l;
  listeners.clear();
}

/** Demo clock offset in ms: world time at t0 is the recorded demo clock. */
export const clockOffset = (l: Ledger, demoClock: string) => Date.parse(demoClock) - l.t0;
