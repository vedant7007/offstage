import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fixtures } from "@/contracts/fixtures";

type Mods = {
  client: typeof import("@/db/client");
  seed: typeof import("@/db/seed");
  usage: typeof import("@/server/services/usage-budget");
  crew: typeof import("@/server/services/crew");
};
let mod: Mods;
let owner: Sql;
const world = fixtures.eventFull();

beforeAll(async () => {
  mod = {
    client: await import("@/db/client"),
    seed: await import("@/db/seed"),
    usage: await import("@/server/services/usage-budget"),
    crew: await import("@/server/services/crew"),
  };
  owner = mod.client.ownerSql();
  await migrate(mod.client.ownerDb(owner), { migrationsFolder: "./src/db/migrations" });
  const tables = await owner<{ table_name: string }[]>`
    select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`;
  await owner.unsafe(
    `truncate table ${tables.map((t) => `"${t.table_name}"`).join(", ")} restart identity cascade`,
  );
  await mod.seed.seed(mod.client.ownerDb(owner));
});

afterAll(async () => {
  await owner?.end({ timeout: 5 });
  await mod?.client.sql.end({ timeout: 5 });
});

describe("usage budget (issue #14)", () => {
  const scope = { orgId: world.org.id, eventId: world.event.id };
  const day = "2026-10-24";

  it("starts at zero with the default cap", async () => {
    const u = await mod.usage.getUsage(scope, day);
    expect(u.spentUsd).toBe(0);
    expect(u.capUsd).toBeGreaterThan(0);
  });

  it("adds spend atomically, even from concurrent callers", async () => {
    await Promise.all(Array.from({ length: 10 }, () => mod.usage.addUsage(scope, 0.25, day)));
    const u = await mod.usage.getUsage(scope, day);
    expect(u.spentUsd).toBeCloseTo(2.5, 6);
  });

  it("keeps event and org-wide budgets apart, and reports exhaustion", async () => {
    await mod.usage.setDailyCap({ orgId: world.org.id }, 1, day);
    const orgWide = await mod.usage.addUsage({ orgId: world.org.id }, 1.2, day);
    expect(orgWide.exhausted).toBe(true);
    expect((await mod.usage.getUsage(scope, day)).spentUsd).toBeCloseTo(2.5, 6);
  });

  it("rejects negative amounts", async () => {
    await expect(mod.usage.addUsage(scope, -1, day)).rejects.toThrow(RangeError);
  });
});

describe("crew availability (issue #20)", () => {
  it("lists the actor's event windows only", async () => {
    const actor = fixtures.actor("user");
    const rows = await mod.crew.listAvailability(actor);
    expect(rows.length).toBe(world.availability.length);
    expect(new Set(rows.map((r) => r.eventId))).toEqual(new Set([world.event.id]));
  });
});
