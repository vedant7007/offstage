/**
 * Signed tickets. The QR encodes `payload.signature`:
 *   payload   = base64url(JSON.stringify(TicketClaims))
 *   signature = base64url(Ed25519 signature over the UTF-8 bytes of `payload`)
 * Scanners verify offline with the event public key (GET /api/public/events/:slug/verify-key).
 */
import { createPrivateKey, createPublicKey, sign, verify, type KeyObject } from "node:crypto";
import { TicketClaims } from "@/contracts";

let cached: { priv: KeyObject; pub: KeyObject } | undefined;

function keys(): { priv: KeyObject; pub: KeyObject } {
  if (cached) return cached;
  const privB64 = process.env.TICKET_SIGNING_PRIVATE_KEY;
  const pubB64 = process.env.TICKET_SIGNING_PUBLIC_KEY;
  if (!privB64 || !pubB64) {
    throw new Error("TICKET_SIGNING_PRIVATE_KEY and TICKET_SIGNING_PUBLIC_KEY must be set. Run `pnpm keys`.");
  }
  cached = {
    priv: createPrivateKey({ key: Buffer.from(privB64, "base64"), format: "der", type: "pkcs8" }),
    pub: createPublicKey({ key: Buffer.from(pubB64, "base64"), format: "der", type: "spki" }),
  };
  return cached;
}

export function resetTicketKeysForTests(): void {
  cached = undefined;
}

/** Public key as base64 DER (SPKI), as stored in env. */
export function publicKeySpkiBase64(): string {
  return keys().pub.export({ format: "der", type: "spki" }).toString("base64");
}

/** Raw 32-byte public key, base64url, for browser libraries such as @noble/ed25519. */
export function publicKeyRawBase64Url(): string {
  const jwk = keys().pub.export({ format: "jwk" });
  if (!jwk.x) throw new Error("Unexpected public key format");
  return jwk.x;
}

export function signTicket(claims: TicketClaims): string {
  const payload = Buffer.from(JSON.stringify(TicketClaims.parse(claims)), "utf8").toString("base64url");
  const signature = sign(null, Buffer.from(payload, "utf8"), keys().priv).toString("base64url");
  return `${payload}.${signature}`;
}

export function splitToken(token: string): { payload: string; signature: string } | null {
  const parts = token.trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  return { payload: parts[0], signature: parts[1] };
}

export type TicketCheck =
  | { ok: true; claims: TicketClaims }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "wrong_event" };

/**
 * Verify a ticket's signature, expiry and event. Never trusts the claims before the
 * signature checks out.
 */
export function verifyTicket(
  parts: { payload: string; signature: string },
  opts: { eventId?: string; now?: Date } = {},
): TicketCheck {
  let sig: Buffer;
  try {
    sig = Buffer.from(parts.signature, "base64url");
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (sig.length !== 64) return { ok: false, reason: "bad_signature" };
  let valid = false;
  try {
    valid = verify(null, Buffer.from(parts.payload, "utf8"), keys().pub, sig);
  } catch {
    return { ok: false, reason: "bad_signature" };
  }
  if (!valid) return { ok: false, reason: "bad_signature" };

  let claims: TicketClaims;
  try {
    const parsed = TicketClaims.safeParse(
      JSON.parse(Buffer.from(parts.payload, "base64url").toString("utf8")),
    );
    if (!parsed.success) return { ok: false, reason: "malformed" };
    claims = parsed.data;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  const nowSec = Math.floor((opts.now ?? new Date()).getTime() / 1000);
  if (claims.exp < nowSec) return { ok: false, reason: "expired" };
  if (opts.eventId && claims.eventId !== opts.eventId) return { ok: false, reason: "wrong_event" };
  return { ok: true, claims };
}
