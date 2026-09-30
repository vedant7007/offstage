import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures } from "@/contracts/fixtures";

type Mods = {
  client: typeof import("@/db/client");
  seed: typeof import("@/db/seed");
  bus: typeof import("@/server/events/bus");
  overview: typeof import("@/server/services/overview");
};
let m: Mods;
let owner: Sql;
const w = fixtures.eventFull();
const E = w.event.id;

beforeAll(async () => {
  m = {
    client: await import("@/db/client"),
    seed: await import("@/db/seed"),
    bus: await import("@/server/events/bus"),
    overview: await import("@/server/services/overview"),
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

const until = async (cond: () => boolean, ms = 5000) => {
  const end = Date.now() + ms;
  while (!cond() && Date.now() < end) await new Promise((r) => setTimeout(r, 50));
};

describe("bus subscribe", () => {
  it("delivers a committed event to its event's subscribers only, and nothing for a rollback", async () => {
    const mine: string[] = [];
    const other: string[] = [];
    const off = m.bus.subscribe(E, (n) => mine.push(n.type));
    const offOther = m.bus.subscribe("some-other-event", (n) => other.push(n.type));
    // Let LISTEN start before publishing.
    await new Promise((r) => setTimeout(r, 300));

    await m.client.db
      .transaction(async (tx) => {
        await m.bus.publish(tx, {
          eventId: E,
          type: "session.running_late",
          entity: "session",
          entityId: w.sessions[0]!.id,
          actor: { kind: "system" },
          payload: { sessionId: w.sessions[0]!.id, minutes: 10 },
        });
        throw new Error("roll back");
      })
      .catch(() => undefined);
    await m.client.db.transaction((tx) =>
      m.bus.publish(tx, {
        eventId: E,
        type: "announcement.sent",
        entity: "announcement",
        entityId: "a1",
        actor: { kind: "system" },
      }),
    );
    await until(() => mine.length > 0);
    await new Promise((r) => setTimeout(r, 200));
    off();
    offOther();
    expect(mine).toEqual(["announcement.sent"]);
    expect(other).toEqual([]);
  });
});

describe("overview", () => {
  it("counts from the database", async () => {
    const o = await m.overview.getOverview(E);
    const [{ n } = { n: 0 }] = await owner<{ n: number }[]>`
      select count(*)::int as n from registrations where event_id = ${E} and status = 'confirmed'`;
    expect(o.metrics.registrations.confirmed).toBe(n);
    const [{ p } = { p: 0 }] = await owner<{ p: number }[]>`
      select count(*)::int as p from proposals where event_id = ${E} and status = 'pending'`;
    expect(o.metrics.pendingApprovals).toBe(p);
    expect(o.agents.reduce((s, a) => s + a.pendingApprovals, 0)).toBeLessThanOrEqual(p);
    expect(o.recent.length).toBeGreaterThan(0);
  });
});
