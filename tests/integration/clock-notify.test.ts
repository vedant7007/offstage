import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Imported lazily so the env prepared by the global setup (DEMO_MODE=true) is in place first.
let client: typeof import("@/db/client");
let clock: typeof import("@/server/clock");
let time: typeof import("@/lib/time");
let owner: Sql;

const until = async (ok: () => boolean, ms = 3000) => {
  const end = Date.now() + ms;
  while (!ok() && Date.now() < end) await new Promise((r) => setTimeout(r, 20));
  return ok();
};

beforeAll(async () => {
  client = await import("@/db/client");
  clock = await import("@/server/clock");
  time = await import("@/lib/time");
  owner = client.ownerSql();
  await migrate(client.ownerDb(owner), { migrationsFolder: "./src/db/migrations" });
  clock.startDemoClockSync(60_000); // the poll never fires in this test; only NOTIFY can move the clock
  await new Promise((r) => setTimeout(r, 300)); // LISTEN is up
});

afterAll(async () => {
  await owner?.end({ timeout: 5 });
  await client?.sql.end({ timeout: 5 });
});

describe("demo clock across processes", () => {
  it("applies a clock set elsewhere at once, not at the next poll", async () => {
    time.setClockOffsetMs(0);
    // Another process (demo:reset) stores a clock and notifies; this one only hears the NOTIFY.
    await owner`select pg_notify(${clock.CLOCK_CHANNEL}, ${JSON.stringify({ offsetMs: 123_456_789 })})`;
    expect(await until(() => time.getClockOffsetMs() === 123_456_789)).toBe(true);
  });

  it("setDemoClock announces the new anchor, so now() reads the demo time within a second", async () => {
    const anchor = new Date("2026-10-24T05:00:00.000Z");
    await clock.setDemoClock(client.ownerDb(owner), anchor);
    time.setClockOffsetMs(0); // as if this process had missed the local set
    await owner`select pg_notify(${clock.CLOCK_CHANNEL}, ${JSON.stringify({ offsetMs: anchor.getTime() - Date.now() })})`;
    expect(await until(() => Math.abs(time.nowUtc().getTime() - anchor.getTime()) < 1000)).toBe(true);
  });

  it("ignores a malformed notice", () => {
    time.setClockOffsetMs(42);
    clock.applyClockNotice("not json");
    clock.applyClockNotice(JSON.stringify({ offsetMs: "soon" }));
    expect(time.getClockOffsetMs()).toBe(42);
  });
});
