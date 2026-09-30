import "@/server/load-env";
import { ownerSql } from "@/db/client";

/** Prints row counts per table, and per event for the headline numbers. `pnpm db:counts` */
async function main() {
  const sql = ownerSql();
  try {
    const tables = await sql<{ table_name: string }[]>`
      select table_name from information_schema.tables
      where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`;
    const rows: [string, number][] = [];
    for (const { table_name } of tables) {
      const [r] = await sql.unsafe<{ n: number }[]>(`select count(*)::int as n from "${table_name}"`);
      rows.push([table_name, r?.n ?? 0]);
    }
    const width = Math.max(...rows.map(([n]) => n.length));
    console.log("== rows per table");
    for (const [name, n] of rows) console.log(`${name.padEnd(width)}  ${n}`);

    const perEvent = await sql<Record<string, string | number>[]>`
      select e.slug,
        (select count(*)::int from rooms r where r.event_id = e.id) as rooms,
        (select count(*)::int from tracks t where t.event_id = e.id) as tracks,
        (select count(*)::int from sessions s where s.event_id = e.id) as sessions,
        (select count(*)::int from speakers s where s.event_id = e.id) as speakers,
        (select count(*)::int from registrations r where r.event_id = e.id and r.status = 'confirmed') as confirmed,
        (select count(*)::int from registrations r where r.event_id = e.id and r.status = 'waitlisted') as waitlisted,
        (select count(*)::int from volunteers v where v.event_id = e.id) as volunteers,
        (select coalesce(sum(cap_inr), 0)::int from budget_categories b where b.event_id = e.id) as budget_inr,
        (select count(*)::int from sponsor_prospects s where s.event_id = e.id) as sponsors
      from events e order by e.created_at`;
    console.log("\n== per event");
    console.table(perEvent);
  } finally {
    await sql.end({ timeout: 5 });
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
