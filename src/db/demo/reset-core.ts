import { HACKNOVA_NOW } from "@/contracts/fixtures";
import { ownerDb, ownerSql } from "@/db/client";
import { seed } from "@/db/seed";
import { indexPendingPg } from "@/ai/rag/pg";
import { setDemoClock } from "@/server/clock";

/**
 * Wipes every table in the public schema except telegram_links (real people's linked chats), and queued jobs, and reseeds both demo events.
 * Connects as the owner because TRUNCATE is not granted to the app role.
 */
export async function resetDemo({ realTime = false } = {}) {
  const client = ownerSql();
  try {
    const tables = await client<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'telegram_links'`;
    if (tables.length === 0) throw new Error("No tables found. Run pnpm db:migrate first.");
    await client.unsafe(
      `truncate table ${tables.map((t) => `"${t.table_name}"`).join(", ")} restart identity cascade`,
    );
    const [{ exists } = { exists: false }] = await client<{ exists: boolean }[]>`
      select exists(select 1 from information_schema.tables where table_schema = 'pgboss' and table_name = 'job') as exists`;
    if (exists) await client.unsafe(`delete from pgboss.job`);

    const db = ownerDb(client);
    const result = await seed(db);
    // Index the seeded documents now, so the helpdesk never starts a demo with an unindexed FAQ.
    const indexed = await indexPendingPg(db);
    const clock = await setDemoClock(db, realTime ? null : new Date(HACKNOVA_NOW));
    return { tables: tables.length, events: result.events, indexed, clock };
  } finally {
    await client.end({ timeout: 5 });
  }
}
