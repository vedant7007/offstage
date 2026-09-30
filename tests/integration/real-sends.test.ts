import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import pino from "pino";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { UserActor } from "@/contracts";
import { fixtures } from "@/contracts/fixtures";

type Mods = {
  client: typeof import("@/db/client");
  schema: typeof import("@/db/schema");
  seed: typeof import("@/db/seed");
  outbox: typeof import("../../worker/jobs/outbox");
  realSends: typeof import("@/server/real-sends");
  pii: typeof import("@/server/pii");
};
let m: Mods;
let owner: Sql;
const w = fixtures.eventFull();
const E = w.event.id;
const PHONES = ["+919800000001", "+919800000002", "+919800000003", "+919800000004"];
const log = pino({ level: "silent" });
const ownerActor: UserActor = {
  kind: "user",
  userId: w.personas.owner!.userId,
  orgId: w.org.id,
  eventId: E,
  role: "owner",
};

/** Twilio calls the outbox made. `fail` makes every send answer like the trial's daily cap. */
let calls = 0;
function stubTwilio(fail = false) {
  calls = 0;
  vi.stubGlobal("fetch", async () => {
    calls++;
    return fail
      ? new Response(JSON.stringify({ code: 63038, message: "cap" }), { status: 429 })
      : new Response(JSON.stringify({ sid: `SM${calls}` }), { status: 201 });
  });
}

async function queue(phone: string, body: string) {
  const [row] = await m.client.db
    .insert(m.schema.outbox)
    .values({
      eventId: E,
      channel: "whatsapp",
      driver: "twilio-whatsapp",
      toEnc: m.pii.encrypt(phone),
      recipientType: "registration",
      body,
      dedupeKey: `${phone}-${body}-${Date.now()}`,
      scheduledFor: new Date(Date.now() - 1000),
    })
    .returning({ id: m.schema.outbox.id });
  return row!.id;
}
const rowOf = async (id: string) =>
  (await m.client.db.select().from(m.schema.outbox).where(eq(m.schema.outbox.id, id)))[0]!;

beforeAll(async () => {
  process.env.DEMO_REAL_RECIPIENTS = PHONES.join(",");
  process.env.TWILIO_ACCOUNT_SID = "ACtest";
  process.env.TWILIO_AUTH_TOKEN = "test";
  process.env.TWILIO_WHATSAPP_FROM = "+14155238886";
  process.env.REAL_SENDS = "off";
  m = {
    client: await import("@/db/client"),
    schema: await import("@/db/schema"),
    seed: await import("@/db/seed"),
    outbox: await import("../../worker/jobs/outbox"),
    realSends: await import("@/server/real-sends"),
    pii: await import("@/server/pii"),
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

afterEach(() => vi.unstubAllGlobals());

afterAll(async () => {
  await owner?.end({ timeout: 5 });
  await m?.client.sql.end({ timeout: 5 });
});

describe("seeded team phones", () => {
  it("sit on attendees of both sessions speaker_cancel touches", async () => {
    for (const phone of PHONES) {
      const rows = await owner<{ title: string }[]>`
        select s.title from registrations r
        join session_choices c on c.registration_id = r.id join sessions s on s.id = c.session_id
        where r.phone_hash = ${m.pii.phoneHash(phone)}`;
      const titles = rows.map((r) => r.title);
      expect(titles).toContain("Evaluating LLM apps");
      expect(titles).toContain("Keynote: Open source careers");
    }
  });
});

describe("real sends switch", () => {
  it("delivers allowlisted messages to the mock driver while off, without calling Twilio", async () => {
    stubTwilio();
    expect((await m.realSends.getRealSends()).on).toBe(false);
    const id = await queue(PHONES[0]!, "off test");
    await m.outbox.deliverDue(log);
    expect((await rowOf(id)).status).toBe("delivered_mock");
    expect(calls).toBe(0);
  });

  it("sends for real once the owner switches it on", async () => {
    stubTwilio();
    const r = await m.realSends.setRealSends(true, ownerActor);
    expect(r).toMatchObject({ on: true, source: "console" });
    const id = await queue(PHONES[1]!, "on test");
    await m.outbox.deliverDue(log);
    expect((await rowOf(id)).status).toBe("sent");
    expect(calls).toBe(1);
  });

  it("fails a daily-cap refusal at once instead of retrying", async () => {
    stubTwilio(true);
    const id = await queue(PHONES[2]!, "cap test");
    await m.outbox.deliverDue(log);
    const row = await rowOf(id);
    expect(row.status).toBe("failed");
    expect(row.error).toMatch(/63038/);
    expect(row.attempts).toBe(1);
    await m.realSends.setRealSends(false, ownerActor);
  });
});
