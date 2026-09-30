// Offline check-in for the crew app: verify a ticket with the event's cached Ed25519 public key (WebCrypto,
// no server), and queue scans in IndexedDB until the network is back. The server re-verifies every scan
// when it syncs; this check only lets a volunteer wave people in while the WiFi is down.

import type { CheckinRequest, CheckinResult, TicketClaims } from "@/contracts";

export type EventKey = { eventId: string; publicKey: string; keyId: string; revoked: string[]; at: string };

export type LocalCheck =
  | { ok: true; claims: TicketClaims; payload: string; signature: string }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_event" | "revoked" };

export type QueuedScan = CheckinRequest & {
  ticketId: string;
  state: "queued" | "synced";
  result?: CheckinResult;
};

const b64 = (s: string): Uint8Array<ArrayBuffer> => {
  const std = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

/** Split `payload.signature` as the QR encodes it (see src/server/checkin/ticket.ts). */
export function splitToken(token: string): { payload: string; signature: string } | null {
  const parts = token.trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { payload: parts[0], signature: parts[1] };
}

/** Signature first, claims only after it checks out, like the server. `now` is the demo clock. */
export async function verifyOffline(token: string, key: EventKey, now: number): Promise<LocalCheck> {
  const parts = splitToken(token);
  if (!parts) return { ok: false, reason: "malformed" };
  let sig: Uint8Array<ArrayBuffer>;
  try {
    sig = b64(parts.signature);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (sig.length !== 64) return { ok: false, reason: "bad_signature" };
  try {
    const pub = await crypto.subtle.importKey("spki", b64(key.publicKey), { name: "Ed25519" }, false, [
      "verify",
    ]);
    const data = new TextEncoder().encode(parts.payload);
    if (!(await crypto.subtle.verify({ name: "Ed25519" }, pub, sig, data)))
      return { ok: false, reason: "bad_signature" };
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  let claims: TicketClaims;
  try {
    claims = JSON.parse(new TextDecoder().decode(b64(parts.payload))) as TicketClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (claims.eventId !== key.eventId) return { ok: false, reason: "wrong_event" };
  if (claims.exp * 1000 < now) return { ok: false, reason: "expired" };
  if (key.revoked.includes(claims.ticketId)) return { ok: false, reason: "revoked" };
  return { ok: true, claims, ...parts };
}

// The public key and revocation list, kept on the device for when the network drops.
const keyName = (slug: string) => `offstage:crew-key:${slug}`;
export function loadKey(slug: string): EventKey | null {
  try {
    const raw = localStorage.getItem(keyName(slug));
    return raw ? (JSON.parse(raw) as EventKey) : null;
  } catch {
    return null;
  }
}
export function saveKey(slug: string, key: EventKey): void {
  try {
    localStorage.setItem(keyName(slug), JSON.stringify(key));
  } catch {
    // Private mode or full storage: the key still lives in memory for this page.
  }
}

// The scan queue, in IndexedDB so it survives a reload or a closed tab.
const DB = "offstage-crew";
const STORE = "scans";
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "clientId" });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function tx<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).finally(() => db.close());
}
export const putScan = (s: QueuedScan) => tx("readwrite", (st) => st.put(s));
export const allScans = () => tx<QueuedScan[]>("readonly", (st) => st.getAll() as IDBRequest<QueuedScan[]>);
