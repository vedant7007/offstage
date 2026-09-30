import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyOffline, type EventKey } from "@/components/crew/offline";

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const key: EventKey = {
  eventId: "ev-1",
  publicKey: publicKey.export({ format: "der", type: "spki" }).toString("base64"),
  keyId: "k1",
  revoked: ["t-revoked"],
  at: "2026-10-24T05:00:00.000Z",
};
const NOW = Date.parse("2026-10-24T05:00:00.000Z");
const ticket = (claims: object) => {
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(null, Buffer.from(payload), privateKey).toString("base64url")}`;
};
const claims = { ticketId: "t-1", registrationId: "r-1", eventId: "ev-1", exp: NOW / 1000 + 3600 };

describe("offline ticket check", () => {
  it("accepts a ticket signed with the event key", async () => {
    const r = await verifyOffline(ticket(claims), key, NOW);
    expect(r.ok && r.claims.ticketId).toBe("t-1");
  });
  it("rejects a changed signature, payload or code", async () => {
    const t = ticket(claims);
    const [p, s] = t.split(".") as [string, string];
    const i = Math.floor(s.length / 2);
    const flipped = `${p}.${s.slice(0, i)}${s[i] === "A" ? "B" : "A"}${s.slice(i + 1)}`;
    expect(await verifyOffline(flipped, key, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    const other = ticket({ ...claims, ticketId: "t-2" }).split(".")[0];
    expect(await verifyOffline(`${other}.${s}`, key, NOW)).toEqual({ ok: false, reason: "bad_signature" });
    expect(await verifyOffline("hello", key, NOW)).toEqual({ ok: false, reason: "malformed" });
  });
  it("rejects another event, an expired ticket and a revoked one", async () => {
    expect(await verifyOffline(ticket({ ...claims, eventId: "ev-2" }), key, NOW)).toMatchObject({
      reason: "wrong_event",
    });
    expect(await verifyOffline(ticket({ ...claims, exp: NOW / 1000 - 1 }), key, NOW)).toMatchObject({
      reason: "expired",
    });
    expect(await verifyOffline(ticket({ ...claims, ticketId: "t-revoked" }), key, NOW)).toMatchObject({
      reason: "revoked",
    });
  });
});
