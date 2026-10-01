/**
 * Demo tickets for the showcase: a throwaway Ed25519 key pair signs three tickets, then the private key
 * is dropped. Only the public key, the signed tokens and their QR images are written, to
 * src/showcase/tickets.json. Rerun to rotate: `pnpm tsx scripts/showcase/make-tickets.ts`.
 */
import { generateKeyPairSync, randomUUID, sign } from "node:crypto";
import { writeFileSync } from "node:fs";
import QRCode from "qrcode";
import world from "../../src/showcase/fixtures/world.json" with { type: "json" };

const reg = (
  world.responses as Record<string, { registration?: { id: string; name: string; college: string } }>
)["persona:attendee myRegistration"]!.registration!;

const people = [
  { registrationId: reg.id, name: reg.name, college: reg.college },
  { registrationId: randomUUID(), name: "Arjun Mehta", college: "Hyderabad Institute of Technology" },
  { registrationId: randomUUID(), name: "Fatima Khan", college: "Osmania College of Engineering" },
];
// Valid to the end of the event's second day (IST), like the real tickets.
const exp = Math.floor(Date.parse("2026-10-25T18:29:00.000Z") / 1000);

const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const spki = publicKey.export({ format: "der", type: "spki" }).toString("base64");

const tickets = await Promise.all(
  people.map(async (p) => {
    const ticketId = randomUUID();
    const claims = { ticketId, registrationId: p.registrationId, eventId: world.eventId, exp };
    const payload = Buffer.from(JSON.stringify(claims), "utf8").toString("base64url");
    const signature = sign(null, Buffer.from(payload, "utf8"), privateKey).toString("base64url");
    const token = `${payload}.${signature}`;
    const qrPngDataUrl = await QRCode.toDataURL(token, { errorCorrectionLevel: "M", margin: 2, width: 320 });
    return { ...p, ticketId, token, qrPngDataUrl };
  }),
);

writeFileSync(
  "src/showcase/tickets.json",
  `${JSON.stringify({ publicKey: spki, keyId: spki.slice(-12), exp, tickets }, null, 2)}\n`,
);
console.log(`Wrote ${tickets.length} demo tickets; the private key was never written.`);
