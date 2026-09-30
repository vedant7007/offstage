/**
 * Personal data at rest. Email and phone are stored encrypted (AES-256-GCM with PII_ENCRYPTION_KEY)
 * next to a keyed lookup hash, so we can find duplicates and log people in without decrypting everything.
 *
 * Lookup hashes are HMAC-SHA256 with a key derived from PII_ENCRYPTION_KEY, not plain sha256:
 * a plain hash of an email can be reversed by hashing a list of likely emails.
 */
import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes } from "node:crypto";

export { maskEmail, maskPhone } from "@/lib/format";

const ALG = "aes-256-gcm";
const VERSION = "v1";

let cachedKeys: { enc: Buffer; mac: Buffer } | undefined;

function keys(): { enc: Buffer; mac: Buffer } {
  if (cachedKeys) return cachedKeys;
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) throw new Error("PII_ENCRYPTION_KEY is not set. Run `pnpm keys` and add it to .env.");
  const master = Buffer.from(raw, "base64");
  if (master.length !== 32) throw new Error("PII_ENCRYPTION_KEY must be 32 bytes, base64 encoded.");
  cachedKeys = {
    enc: master,
    mac: Buffer.from(hkdfSync("sha256", master, Buffer.alloc(0), "sutradhar-pii-lookup-v1", 32)),
  };
  return cachedKeys;
}

/** For tests: forget the cached key after changing PII_ENCRYPTION_KEY. */
export function resetPiiKeysForTests(): void {
  cachedKeys = undefined;
}

/** Encrypt to `v1.<iv>.<tag>.<ciphertext>`, all base64url. A fresh IV every call. */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALG, keys().enc, iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), ct.toString("base64url")].join(".");
}

export function decrypt(token: string): string {
  const [v, iv, tag, ct] = token.split(".");
  if (v !== VERSION || !iv || !tag || ct === undefined) throw new Error("Malformed encrypted value");
  const decipher = createDecipheriv(ALG, keys().enc, Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ct, "base64url")), decipher.final()]).toString("utf8");
}

export function encryptOptional(plain: string | null | undefined): string | null {
  return plain ? encrypt(plain) : null;
}

export function decryptOptional(token: string | null | undefined): string | undefined {
  return token ? decrypt(token) : undefined;
}

/** Keyed hash for lookups and uniqueness. Input should already be normalised. */
export function lookupHash(value: string): string {
  return createHmac("sha256", keys().mac).update(value, "utf8").digest("hex");
}

/**
 * Lowercase and trim; drop a "+tag" from the local part; for Gmail also drop dots and
 * treat googlemail.com as gmail.com. Returns the input lowercased if it is not an email.
 */
export function normaliseEmail(email: string): string {
  const e = email.trim().toLowerCase();
  const at = e.lastIndexOf("@");
  if (at <= 0) return e;
  let local = e.slice(0, at);
  let domain = e.slice(at + 1);
  const plus = local.indexOf("+");
  if (plus > 0) local = local.slice(0, plus);
  if (domain === "googlemail.com") domain = "gmail.com";
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `${local}@${domain}`;
}

/**
 * E.164 with +91 as the default country. Accepts "98765 43210", "09876543210",
 * "919876543210" and "+44 20 7946 0000". Returns null when it cannot be a phone number.
 */
export function normalisePhone(phone: string): string | null {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  let e164: string;
  if (trimmed.startsWith("+")) e164 = `+${digits}`;
  else if (digits.length === 10 && /^[6-9]/.test(digits)) e164 = `+91${digits}`;
  else if (digits.length === 11 && digits.startsWith("0")) e164 = `+91${digits.slice(1)}`;
  else if (digits.length === 12 && digits.startsWith("91")) e164 = `+${digits}`;
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

export function emailHash(email: string): string {
  return lookupHash(`email:${normaliseEmail(email)}`);
}

export function phoneHash(phone: string): string | null {
  const n = normalisePhone(phone);
  return n ? lookupHash(`phone:${n}`) : null;
}
