import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

let owner: Sql;
let client: typeof import("@/db/client");
let rl: typeof import("@/server/rate-limit");

beforeAll(async () => {
  client = await import("@/db/client");
  rl = await import("@/server/rate-limit");
  owner = client.ownerSql();
  await migrate(client.ownerDb(owner), { migrationsFolder: "./src/db/migrations" });
});

afterAll(async () => {
  await owner?.end({ timeout: 5 });
  await client?.sql.end({ timeout: 5 });
});

describe("rate limits", () => {
  it("allows up to the limit in a window, then refuses with a retry time", async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await rl.consume(key, 3, 600));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false]);
    expect(results[3]!.retryAfterSeconds).toBeGreaterThan(0);
    expect(results[3]!.retryAfterSeconds).toBeLessThanOrEqual(600);
  });

  it("counts concurrent hits exactly", async () => {
    const key = `test:concurrent:${Date.now()}`;
    const results = await Promise.all(Array.from({ length: 25 }, () => rl.consume(key, 20, 3600)));
    expect(results.filter((r) => r.ok)).toHaveLength(20);
  });

  it("enforce throws a 429 ApiError", async () => {
    const key = `test:enforce:${Date.now()}`;
    await rl.enforce(key, 1, 60, "slow down");
    await expect(rl.enforce(key, 1, 60, "slow down")).rejects.toMatchObject({
      status: 429,
      code: "rate_limited",
    });
  });
});
