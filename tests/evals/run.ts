import "../../src/server/load-env";
// pnpm evals: the golden-set evals (src/ai/evals/golden.ts) from the command line.
// Writes tests/evals/results/latest.json; the console Evals page runs the same code and stores its run.
// --pg searches the seeded database (run pnpm db:seed and pnpm kb:index first); default is the in-memory index.

import { mkdir, writeFile } from "node:fs/promises";
import { format, resolveConfig } from "prettier";
import { EVAL_EVENT, THRESHOLDS, passes, runGolden, type Search } from "../../src/ai/evals/golden";

const dir = new URL(".", import.meta.url);
const fmt = (x: number) => `${(x * 100).toFixed(1)}%`;

let search: Search | undefined;
let closeDb = async () => {};
if (process.argv.includes("--pg")) {
  const { db, sql } = await import("../../src/db/client");
  const { events } = await import("../../src/db/schema");
  const { eq } = await import("drizzle-orm");
  const { searchKbPg } = await import("../../src/ai/rag/pg");
  const [ev] = await db.select({ id: events.id }).from(events).where(eq(events.slug, EVAL_EVENT));
  if (!ev) throw new Error(`Event ${EVAL_EVENT} is not seeded. Run pnpm db:seed and pnpm kb:index.`);
  search = (q, k) => searchKbPg(db, ev.id, q, k);
  closeDb = () => sql.end();
}

const results = await runGolden({ search, index: search ? "postgres" : "memory" });

await mkdir(new URL("results/", dir), { recursive: true });
// Prettier-formatted so `pnpm format:check` stays clean locally.
const out = new URL("results/latest.json", dir);
await writeFile(
  out,
  await format(JSON.stringify(results), { ...(await resolveConfig(out)), parser: "json" }),
);

const pass = passes(results);
console.table({
  [`retrieval hit@${results.retrieval.k}`]: {
    value: fmt(results.retrieval.hitRate),
    target: fmt(THRESHOLDS.retrievalHit),
    pass: pass.retrieval,
  },
  "injection block": {
    value: fmt(results.guard.injectionBlockRate),
    target: fmt(THRESHOLDS.injectionBlock),
    pass: pass.injection,
  },
  "benign allow": {
    value: fmt(results.guard.benignAllowRate),
    target: fmt(THRESHOLDS.benignAllow),
    pass: pass.benign,
  },
  "grounding rate": {
    value: fmt(results.helpdesk.groundingRate),
    target: fmt(THRESHOLDS.grounding),
    pass: pass.grounding,
  },
  "no-source refusal": {
    value: fmt(results.helpdesk.refusalRate),
    target: fmt(THRESHOLDS.refusal),
    pass: pass.refusal,
  },
  "solver checks": {
    value: `${results.solver.passed}/${results.solver.checked}`,
    target: fmt(THRESHOLDS.solver),
    pass: pass.solver,
  },
});
console.log(
  `retrieval ${results.retrieval.avgLatencyMs} ms avg | guard ${results.guard.avgLatencyMs} ms avg | helpdesk ${results.helpdesk.avgLatencyMs} ms avg | cost $${results.costUsd.toFixed(5)}`,
);
for (const m of results.helpdesk.misses) console.log(`  helpdesk miss: ${m}`);
for (const m of results.retrieval.misses) console.log(`  retrieval miss: ${m}`);
for (const f of results.guard.failures) console.log(`  guard miss: ${f}`);
for (const f of results.solver.failures) console.log(`  solver miss: ${f}`);
await closeDb();
process.exit(Object.values(pass).every(Boolean) ? 0 : 1);
