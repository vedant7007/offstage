import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HACKNOVA_NOW } from "@/contracts/fixtures";

// Imported lazily so the env prepared by the global setup is in place first.
type Mods = {
  client: typeof import("@/db/client");
  seed: typeof import("@/db/seed");
  trigger: typeof import("@/db/demo/trigger");
  clock: typeof import("@/server/clock");
  ticket: typeof import("@/server/checkin/ticket");
  pii: typeof import("@/server/pii");
  time: typeof import("@/lib/time");
};
let mod: Mods;
let owner: Sql;

async function wipeAndSeed() {
  const tables = await owner<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
  await owner.unsafe(
    `truncate table ${tables.map((t) => `"${t.table_name}"`).join(", ")} restart identity cascade`,
  );
  const db = mod.client.ownerDb(owner);
  await mod.seed.seed(db);
  await mod.clock.setDemoClock(db, new Date(HACKNOVA_NOW));
}

const count = async (type: string) =>
  (await owner<{ n: number }[]>`select count(*)::int as n from domain_events where type = ${type}`)[0]!.n;

beforeAll(async () => {
  mod = {
    client: await import("@/db/client"),
    seed: await import("@/db/seed"),
    trigger: await import("@/db/demo/trigger"),
    clock: await import("@/server/clock"),
    ticket: await import("@/server/checkin/ticket"),
    pii: await import("@/server/pii"),
    time: await import("@/lib/time"),
  };
  owner = mod.client.ownerSql();
  await migrate(mod.client.ownerDb(owner), { migrationsFolder: "./src/db/migrations" });
});

afterAll(async () => {
  await owner?.end({ timeout: 5 });
  await mod?.client.sql.end({ timeout: 5 });
});

describe("seed and demo reset", () => {
  it("wipes and reseeds both events in under 30 seconds", async () => {
    const started = Date.now();
    await wipeAndSeed();
    expect(Date.now() - started).toBeLessThan(30_000);
  });

  it("matches blueprint Section 11 when counted in SQL", async () => {
    const [h] = await owner<Record<string, number>[]>`
      select
        (select count(*)::int from rooms r where r.event_id = e.id) as rooms,
        (select count(*)::int from tracks t where t.event_id = e.id) as tracks,
        (select count(*)::int from sessions s where s.event_id = e.id) as sessions,
        (select count(*)::int from speakers s where s.event_id = e.id) as speakers,
        (select count(*)::int from registrations r where r.event_id = e.id and r.status = 'confirmed') as confirmed,
        (select count(*)::int from registrations r where r.event_id = e.id and r.status = 'waitlisted') as waitlisted,
        (select count(*)::int from volunteers v where v.event_id = e.id) as volunteers,
        (select sum(cap_inr)::int from budget_categories b where b.event_id = e.id) as budget,
        (select count(*)::int from sponsor_prospects s where s.event_id = e.id) as sponsors,
        (select count(*)::int from kb_documents k where k.event_id = e.id) as kb
      from events e where e.slug = 'hacknova-2026'`;
    expect(h).toEqual({
      rooms: 4,
      tracks: 3,
      sessions: 16,
      speakers: 12,
      confirmed: 320,
      waitlisted: 40,
      volunteers: 28,
      budget: 300000,
      sponsors: 6,
      kb: 4,
    });
    const [c] = await owner<
      { n: number }[]
    >`select count(*)::int as n from events where slug = 'raktdaan-2026'`;
    expect(c!.n).toBe(1);
  });

  it("keeps the Lab 204 tension: 95 confirmed choices for 60 seats", async () => {
    const [row] = await owner<{ capacity: number; chosen: number }[]>`
      select s.capacity, count(*)::int as chosen from sessions s
      join session_choices c on c.session_id = s.id
      join registrations r on r.id = c.registration_id and r.status = 'confirmed'
      join rooms rm on rm.id = s.room_id and rm.name = 'Lab 204'
      group by s.id, s.capacity order by chosen desc limit 1`;
    expect(row).toEqual({ capacity: 60, chosen: 95 });
  });

  it("loads the helpdesk KB documents with their text (issue #12)", async () => {
    const docs = await owner<{ id: string; kind: string; len: number }[]>`
      select id, kind, length(content)::int as len from kb_documents
      where id in ('kb-rulebook', 'kb-faq', 'kb-venue', 'kb-menu') order by id`;
    expect(docs.map((d) => `${d.id}:${d.kind}`)).toEqual([
      "kb-faq:faq",
      "kb-menu:menu",
      "kb-rulebook:rulebook",
      "kb-venue:venue",
    ]);
    for (const d of docs) expect(d.len).toBeGreaterThan(500);
  });

  it("stores email encrypted and finds people by keyed hash", async () => {
    const rows = await owner<{ email_enc: string }[]>`select email_enc from registrations limit 50`;
    for (const r of rows) expect(r.email_enc).not.toContain("@");
    const [sneha] = await owner<{ email_enc: string }[]>`
      select email_enc from registrations where email_hash = ${mod.pii.emailHash("sneha@sutradhar.test")}`;
    expect(mod.pii.decrypt(sneha!.email_enc)).toBe("sneha@sutradhar.test");
  });

  it("signs every seeded ticket with the event key", async () => {
    const tickets = await owner<
      { token: string; event_id: string }[]
    >`select token, event_id from tickets limit 25`;
    expect(tickets.length).toBe(25);
    for (const t of tickets) {
      const parts = mod.ticket.splitToken(t.token)!;
      expect(mod.ticket.verifyTicket(parts, { eventId: t.event_id, now: new Date(HACKNOVA_NOW) }).ok).toBe(
        true,
      );
    }
  });

  it("stores the demo clock so now reads as 10:30 IST on day 1", async () => {
    await mod.clock.syncDemoClock(mod.client.ownerDb(owner));
    const drift = Math.abs(mod.time.nowUtc().getTime() - new Date(HACKNOVA_NOW).getTime());
    expect(drift).toBeLessThan(60_000);
  });
});

describe("append-only tables", () => {
  it("the app role cannot update or delete history", async () => {
    const app = mod.client.sql;
    const [who] = await app<{ current_user: string }[]>`select current_user`;
    expect(who!.current_user).toBe("sutradhar_app");
    await expect(app`update domain_events set type = 'x'`).rejects.toThrow(/permission denied/);
    await expect(app`delete from audit_log`).rejects.toThrow(/permission denied/);
  });

  it("even the owner cannot rewrite history", async () => {
    await expect(owner`update domain_events set type = 'x'`).rejects.toThrow(/append-only/);
  });
});

describe("demo triggers", () => {
  beforeAll(async () => {
    await wipeAndSeed();
  });

  it("speaker_cancel cancels the keynote and publishes session.cancelled", async () => {
    expect(await mod.trigger.runScenario("speaker_cancel")).toMatch(/Cancelled/);
    expect(await count("session.cancelled")).toBe(1);
    const [s] = await owner<{ status: string; version: number }[]>`
      select status, version from sessions where title = 'Keynote: Open source careers'`;
    expect(s).toEqual({ status: "cancelled", version: 2 });
  });

  it("lunch_confusion inserts 12 questions", async () => {
    const before = await count("helpdesk.message");
    await mod.trigger.runScenario("lunch_confusion");
    expect((await count("helpdesk.message")) - before).toBe(12);
  });

  it("volunteer_noshow marks one assignment missed", async () => {
    await mod.trigger.runScenario("volunteer_noshow");
    expect(await count("shift.missed")).toBe(1);
  });

  it("queue_spike adds 40 check-ins", async () => {
    const before = await count("registration.checked_in");
    await mod.trigger.runScenario("queue_spike");
    expect((await count("registration.checked_in")) - before).toBe(40);
  });

  it("budget_breach takes catering over 100%", async () => {
    await mod.trigger.runScenario("budget_breach");
    expect(await count("finance.threshold_crossed")).toBe(1);
  });

  it("projector_voice_note publishes a transcribed voice note", async () => {
    await mod.trigger.runScenario("projector_voice_note");
    const [ev] = await owner<{ payload: { transcript: string } }[]>`
      select payload from domain_events where type = 'voice_note.received'`;
    expect(ev!.payload.transcript).toMatch(/projector/);
  });

  it("state changes left audit rows", async () => {
    const [a] = await owner<{ n: number }[]>`select count(*)::int as n from audit_log`;
    expect(a!.n).toBeGreaterThanOrEqual(3);
  });
});
