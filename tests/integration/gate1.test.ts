import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserActor } from "@/contracts";
import type { PublicRegisterRequest } from "@/contracts/api";
import { fixtures } from "@/contracts/fixtures";

type Mods = {
  client: typeof import("@/db/client");
  seed: typeof import("@/db/seed");
  reg: typeof import("@/server/services/public-registration");
  checkin: typeof import("@/server/services/checkin");
};
let m: Mods;
let owner: Sql;
const hacknova = fixtures.eventFull();
const charity = fixtures.charityDrive();
const SLUG = charity.event.slug;

const scanner: UserActor = {
  kind: "user",
  userId: charity.personas.owner!.userId,
  orgId: charity.org.id,
  eventId: charity.event.id,
  role: "owner",
};

function form(email: string): PublicRegisterRequest {
  return {
    verificationToken: m.reg.signVerificationToken(email, charity.event.id),
    name: `Donor ${email.split("@")[0]}`,
    email,
    college: "Deccan Institute of Technology",
    department: "CSE",
    year: 2,
    section: "B",
    sessionChoices: [],
    foodPref: "veg",
    adultConfirmed: true,
    guardianConsent: false,
    consentVersion: "2026-09",
  };
}

beforeAll(async () => {
  process.env.AUTH_SECRET ??= "integration-test-secret-integration-test-secret";
  process.env.EMAIL_DRIVER = "mock";
  process.env.TURNSTILE_SECRET_KEY = "";
  m = {
    client: await import("@/db/client"),
    seed: await import("@/db/seed"),
    reg: await import("@/server/services/public-registration"),
    checkin: await import("@/server/services/checkin"),
  };
  owner = m.client.ownerSql();
  await migrate(m.client.ownerDb(owner), { migrationsFolder: "./src/db/migrations" });
  const tables = await owner<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
  await owner.unsafe(
    `truncate table ${tables.map((t) => `"${t.table_name}"`).join(", ")} restart identity cascade`,
  );
  await m.seed.seed(m.client.ownerDb(owner));
});

afterAll(async () => {
  await owner?.end({ timeout: 5 });
  await m?.client.sql.end({ timeout: 5 });
});

describe("verification token", () => {
  it("is bound to its email, event and expiry", () => {
    const tok = m.reg.signVerificationToken("a@example.test", charity.event.id, 0);
    expect(m.reg.checkVerificationToken(tok, "A@Example.test", charity.event.id, 1000)).toBe(true);
    expect(m.reg.checkVerificationToken(tok, "b@example.test", charity.event.id, 1000)).toBe(false);
    expect(m.reg.checkVerificationToken(tok, "a@example.test", hacknova.event.id, 1000)).toBe(false);
    expect(m.reg.checkVerificationToken(tok, "a@example.test", charity.event.id, 31 * 60_000)).toBe(false);
    expect(m.reg.checkVerificationToken(`${tok}x`, "a@example.test", charity.event.id, 1000)).toBe(false);
  });
});

describe("register", () => {
  it("gives the last seat to exactly one of five people registering at once", async () => {
    const [{ n } = { n: 0 }] = await owner<{ n: number }[]>`
      select count(*)::int as n from registrations where event_id = ${charity.event.id} and status = 'confirmed'`;
    await owner`update events set capacity = ${n + 1} where id = ${charity.event.id}`;
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((i) => m.reg.register(SLUG, form(`race${i}@example.test`))),
    );
    const confirmed = results.filter((r) => r.status === "confirmed");
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0]!.ticket?.qrPngDataUrl).toMatch(/^data:image\/png;base64,/);
    const positions = results.flatMap((r) => (r.waitlistPosition ? [r.waitlistPosition] : []));
    expect(new Set(positions).size).toBe(4);
  });

  it("refuses the same email twice and a token for another email", async () => {
    await expect(m.reg.register(SLUG, form("race1@example.test"))).rejects.toMatchObject({
      code: "conflict",
    });
    const f = { ...form("mallory@example.test"), email: "victim@example.test" };
    await expect(m.reg.register(SLUG, f)).rejects.toMatchObject({ code: "otp_invalid" });
    const stale = { ...form("stale@example.test"), consentVersion: "2025-01" };
    await expect(m.reg.register(SLUG, stale)).rejects.toMatchObject({ code: "bad_request" });
  });

  it("flags the same name at the same college as a possible duplicate", async () => {
    const a = await m.reg.register(SLUG, form("twin@example.test"));
    const b = await m.reg.register(SLUG, { ...form("twin.alt@example.test"), name: "donor TWIN" });
    expect(a.duplicateSuspected).toBe(false);
    expect(b.duplicateSuspected).toBe(true);
  });
});

describe("check-in", () => {
  let n = 0;
  /** A fresh confirmed registration's ticket: open one more seat, then register. */
  async function confirmedTicket(): Promise<{ ticketPayload: string; signature: string }> {
    await owner`update events set capacity = capacity + 1 where id = ${charity.event.id}`;
    const r = await m.reg.register(SLUG, form(`scan${n++}@example.test`));
    const [ticketPayload, signature] = r.ticket!.ticket.token.split(".");
    return { ticketPayload: ticketPayload!, signature: signature! };
  }
  const at = () => new Date().toISOString();

  it("lets exactly one of five simultaneous scans win", async () => {
    const t = await confirmedTicket();
    const results = await Promise.all(
      [1, 2, 3, 4, 5].map((i) =>
        m.checkin.checkIn(scanner, { ...t, deviceTime: at(), clientId: `race-${i}` }),
      ),
    );
    expect(results.filter((r) => r.status === "checked_in")).toHaveLength(1);
    const dups = results.filter((r) => r.status === "duplicate");
    expect(dups).toHaveLength(4);
    expect(dups[0]!.original?.scannerName).toBeTruthy();
  });

  it("syncs offline scans idempotently and rejects forged and foreign tickets", async () => {
    const t = await confirmedTicket();
    const [foreign] = await owner<{ token: string }[]>`
      select token from tickets where event_id = ${hacknova.event.id} limit 1`;
    const [fp, fs] = foreign!.token.split(".");
    const scans = [
      { ...t, deviceTime: at(), clientId: "off-1" },
      {
        ...t,
        signature: (t.signature[0] === "A" ? "B" : "A") + t.signature.slice(1),
        deviceTime: at(),
        clientId: "off-2",
      },
      { ticketPayload: fp!, signature: fs!, deviceTime: at(), clientId: "off-3" },
    ];
    const first = await m.checkin.syncCheckins(scanner, scans);
    expect(first.map((r) => r.status)).toEqual(["checked_in", "invalid", "wrong_event"]);
    const again = await m.checkin.syncCheckins(scanner, scans);
    expect(again[0]!.checkin?.id).toBe(first[0]!.checkin?.id);
    const [{ n } = { n: 0 }] = await owner<{ n: number }[]>`
      select count(*)::int as n from checkins where client_id = 'off-1'`;
    expect(n).toBe(1);
  });

  it("refuses scanning to an attendee", async () => {
    const t = await confirmedTicket();
    const attendee: UserActor = { ...scanner, role: "attendee" };
    await expect(
      m.checkin.checkIn(attendee, { ...t, deviceTime: at(), clientId: "nope" }),
    ).rejects.toMatchObject({ code: "forbidden" });
  });
});
