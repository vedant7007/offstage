import { generateKeyPairSync, randomBytes } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";
import {
  decrypt,
  emailHash,
  encrypt,
  normaliseEmail,
  normalisePhone,
  phoneHash,
  resetPiiKeysForTests,
} from "@/server/pii";
import {
  publicKeyRawBase64Url,
  resetTicketKeysForTests,
  signTicket,
  splitToken,
  verifyTicket,
} from "@/server/checkin/ticket";

beforeAll(() => {
  process.env.PII_ENCRYPTION_KEY = randomBytes(32).toString("base64");
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  process.env.TICKET_SIGNING_PRIVATE_KEY = privateKey
    .export({ format: "der", type: "pkcs8" })
    .toString("base64");
  process.env.TICKET_SIGNING_PUBLIC_KEY = publicKey
    .export({ format: "der", type: "spki" })
    .toString("base64");
  resetPiiKeysForTests();
  resetTicketKeysForTests();
});

describe("pii", () => {
  it("round-trips and uses a fresh IV each time", () => {
    const a = encrypt("sneha@example.com");
    const b = encrypt("sneha@example.com");
    expect(a).not.toBe(b);
    expect(a).not.toContain("sneha");
    expect(decrypt(a)).toBe("sneha@example.com");
  });

  it("detects tampering", () => {
    const token = encrypt("secret");
    const parts = token.split(".");
    const ct = Buffer.from(parts[3]!, "base64url");
    ct[0] = ct[0]! ^ 1;
    parts[3] = ct.toString("base64url");
    expect(() => decrypt(parts.join("."))).toThrow();
  });

  it("normalises emails", () => {
    expect(normaliseEmail("  Sneha.Reddy+hack@GMAIL.com ")).toBe("snehareddy@gmail.com");
    expect(normaliseEmail("s.reddy@googlemail.com")).toBe("sreddy@gmail.com");
    expect(normaliseEmail("s.reddy+x@college.edu.in")).toBe("s.reddy@college.edu.in");
  });

  it("normalises Indian and international phones to E.164", () => {
    expect(normalisePhone("98765 43210")).toBe("+919876543210");
    expect(normalisePhone("09876543210")).toBe("+919876543210");
    expect(normalisePhone("919876543210")).toBe("+919876543210");
    expect(normalisePhone("+44 20 7946 0000")).toBe("+442079460000");
    expect(normalisePhone("12345")).toBeNull();
    expect(normalisePhone("5876543210")).toBeNull();
  });

  it("hashes equivalent inputs the same and does not leak the value", () => {
    expect(emailHash("Sneha.Reddy@gmail.com")).toBe(emailHash("snehareddy+x@gmail.com"));
    expect(emailHash("a@b.com")).not.toContain("a@b.com");
    expect(phoneHash("98765 43210")).toBe(phoneHash("+91 98765-43210"));
  });
});

describe("tickets", () => {
  const claims = {
    ticketId: "t1",
    registrationId: "r1",
    eventId: "e1",
    exp: Math.floor(Date.now() / 1000) + 3600,
  };

  it("signs and verifies", () => {
    const parts = splitToken(signTicket(claims))!;
    const r = verifyTicket(parts, { eventId: "e1" });
    expect(r.ok && r.claims.registrationId).toBe("r1");
  });

  it("rejects a signature with one character changed", () => {
    const parts = splitToken(signTicket(claims))!;
    const last = parts.signature.at(-2)!;
    const swapped = last === "A" ? "B" : "A";
    const tampered = {
      ...parts,
      signature: parts.signature.slice(0, -2) + swapped + parts.signature.slice(-1),
    };
    expect(verifyTicket(tampered)).toEqual({ ok: false, reason: "bad_signature" });
  });

  it("rejects an edited payload", () => {
    const parts = splitToken(signTicket(claims))!;
    const forged = Buffer.from(JSON.stringify({ ...claims, registrationId: "someone-else" })).toString(
      "base64url",
    );
    expect(verifyTicket({ ...parts, payload: forged }).ok).toBe(false);
  });

  it("rejects expired tickets and tickets for another event", () => {
    const expired = splitToken(signTicket({ ...claims, exp: 1 }))!;
    expect(verifyTicket(expired)).toEqual({ ok: false, reason: "expired" });
    expect(verifyTicket(splitToken(signTicket(claims))!, { eventId: "other" })).toEqual({
      ok: false,
      reason: "wrong_event",
    });
  });

  it("rejects garbage", () => {
    expect(splitToken("not-a-token")).toBeNull();
    expect(verifyTicket({ payload: "x", signature: "y" }).ok).toBe(false);
  });

  it("exposes a raw 32-byte public key for browser verification", () => {
    expect(Buffer.from(publicKeyRawBase64Url(), "base64url")).toHaveLength(32);
  });
});
