// pnpm kb:index [eventId]: builds kb_chunks for every document without chunks at its current version.
// Run after pnpm db:seed or pnpm demo:reset, and it is safe to run again (already indexed docs are skipped).
import "@/server/load-env";
import { db, sql } from "@/db/client";
import { indexPendingPg } from "./pg";

const eventId = process.argv[2];
const t = Date.now();
const done = await indexPendingPg(db, eventId);
console.log(`indexed ${done.length} documents, ${done.reduce((s, d) => s + d.chunks, 0)} chunks in ${Date.now() - t} ms`);
await sql.end();
