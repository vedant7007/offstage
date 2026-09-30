import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { Sql } from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { UserActor } from "@/contracts";
import { fixtures } from "@/contracts/fixtures";

type Mods = {
  client: typeof import("@/db/client");
  seed: typeof import("@/db/seed");
  search: typeof import("@/server/services/crew-search");
  dr: typeof import("@/server/services/data-requests");
};
let m: Mods;
let owner: Sql;
const w = fixtures.eventFull();
const E = w.event.id;
const sneha = w.registrations[0]!;

function actor(persona: "volunteer" | "attendee" | "owner"): UserActor {
  const mem = w.memberships.find((x) => x.userId === w.personas[persona]!.userId && x.eventId === E)!;
  return { kind: "user", userId: mem.userId, orgId: w.org.id, eventId: E, role: mem.role };
}

beforeAll(async () => {
  m = {
    client: await import("@/db/client"),
    seed: await import("@/db/seed"),
    search: await import("@/server/services/crew-search"),
    dr: await import("@/server/services/data-requests"),
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

describe("crew search", () => {
  it("finds by part of a name, masks contact details, and stays in the event", async () => {
    const first = sneha.name.split(" ")[0]!;
    const items = await m.search.searchRegistrations(actor("volunteer"), first.toLowerCase());
    expect(items.some((i) => i.id === sneha.id)).toBe(true);
    expect(items.length).toBeLessThanOrEqual(20);
    const hit = items.find((i) => i.id === sneha.id)!;
    expect(hit.emailMasked).not.toBe(sneha.email);
    expect(hit.emailMasked).toContain("*");
    const charityIds = new Set(fixtures.charityDrive().registrations.map((r) => r.id));
    expect(items.some((i) => charityIds.has(i.id))).toBe(false);
  });

  it("finds by exact email, and treats LIKE wildcards literally", async () => {
    const byEmail = await m.search.searchRegistrations(actor("volunteer"), sneha.email.toUpperCase());
    expect(byEmail.map((i) => i.id)).toContain(sneha.id);
    expect(await m.search.searchRegistrations(actor("volunteer"), "%%")).toEqual([]);
  });

  it("refuses attendees", async () => {
    await expect(m.search.searchRegistrations(actor("attendee"), "sneha")).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});

describe("data requests", () => {
  it("records a request once while it is open, and audits it", async () => {
    const a = await m.dr.createDataRequest(actor("attendee"), { type: "delete", note: "Please remove me" });
    const b = await m.dr.createDataRequest(actor("attendee"), { type: "delete" });
    expect(a.status).toBe("received");
    expect(b.requestId).toBe(a.requestId);
    const exp = await m.dr.createDataRequest(actor("attendee"), { type: "export" });
    expect(exp.requestId).not.toBe(a.requestId);
    const [row] = await owner<{ registration_id: string | null; user_id: string }[]>`
      select registration_id, user_id from data_requests where id = ${a.requestId}`;
    expect(row).toMatchObject({ registration_id: sneha.id, user_id: sneha.userId });
    const [au] = await owner<{ n: number }[]>`
      select count(*)::int as n from audit_log where action = 'data_request.delete' and entity_id = ${a.requestId}`;
    expect(au!.n).toBe(1);
  });

  it("is only for attendees, volunteers and speakers", async () => {
    await expect(m.dr.createDataRequest(actor("owner"), { type: "export" })).rejects.toMatchObject({
      code: "forbidden",
    });
  });
});
