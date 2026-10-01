/**
 * Recorded fixtures (src/showcase/fixtures/README.md) and the response map a ledger implies: world.json
 * responses, overlaid by each played phase's snapshot in order. Scenario files load only when needed.
 */
import type { DemoPersona, StreamMessage } from "@/contracts/api";
import world from "./fixtures/world.json";
import type { Ledger } from "./store";

export type Phase = {
  id: string;
  after: { approve: string } | null;
  stream: { t: number; msg: StreamMessage }[];
  responses: Record<string, unknown>;
};
export type Scenario = {
  scenario: string;
  phases: Phase[];
  approvals: Record<string, { tier: string; roles: DemoPersona[] }>;
};

export const SCENARIOS = [
  "speaker_cancel",
  "lunch_confusion",
  "volunteer_noshow",
  "queue_spike",
  "budget_breach",
  "projector_voice_note",
  "emergency",
] as const;
export type ShowcaseScenario = (typeof SCENARIOS)[number];

export const WORLD = world as unknown as {
  eventId: string;
  eventSlug: string;
  demoClock: string;
  personas: Record<string, { me: unknown; home: string }>;
  responses: Record<string, unknown>;
  whatIfSamples: { scenario: string; response: unknown }[];
};

// Static map so the bundler makes one chunk per scenario, loaded on first use.
const LOADERS: Record<ShowcaseScenario, () => Promise<{ default: unknown }>> = {
  speaker_cancel: () => import("./fixtures/scenarios/speaker_cancel.json"),
  lunch_confusion: () => import("./fixtures/scenarios/lunch_confusion.json"),
  volunteer_noshow: () => import("./fixtures/scenarios/volunteer_noshow.json"),
  queue_spike: () => import("./fixtures/scenarios/queue_spike.json"),
  budget_breach: () => import("./fixtures/scenarios/budget_breach.json"),
  projector_voice_note: () => import("./fixtures/scenarios/projector_voice_note.json"),
  emergency: () => import("./fixtures/scenarios/emergency.json"),
};
const loaded = new Map<string, Promise<Scenario>>();

export function loadScenario(name: string): Promise<Scenario> {
  const loader = LOADERS[name as ShowcaseScenario];
  if (!loader) return Promise.reject(new Error(`Unknown scenario ${name}`));
  let p = loaded.get(name);
  if (!p) {
    p = loader().then((m) => m.default as Scenario);
    loaded.set(name, p);
  }
  return p;
}

export const phaseKey = (scenario: string, phaseId: string) => `${scenario}/${phaseId}`;

export async function loadPhase(key: string): Promise<Phase | undefined> {
  const [scenario, id] = key.split("/");
  return (await loadScenario(scenario!)).phases.find((p) => p.id === id);
}

/** Scenarios whose phases have started, so their approval rules apply. */
export async function activeScenarios(l: Ledger): Promise<Scenario[]> {
  const names = new Set([...l.phases, ...l.playing].map((k) => k.split("/")[0]!));
  return Promise.all([...names].map(loadScenario));
}

type Row = { id: string };
const ids = (rows: Row[]) => new Set(rows.map((r) => r.id));

/**
 * One list from the world's rows and each played scenario's latest rows (oldest scenario first). Every
 * scenario was recorded from the same starting world, so a world row is kept only while every scenario
 * still lists it (a scenario that approved a pending proposal drops it), in its newest version. Rows a
 * scenario added come newest scenario first for `desc` lists, last for `asc` (a phone feed reads down).
 */
export function mergeRows<T extends Row>(base: T[], scenarios: T[][], order: "desc" | "asc"): T[] {
  const baseIds = ids(base);
  const latest = new Map<string, T>();
  for (const rows of scenarios) for (const r of rows) latest.set(r.id, r);
  const kept = base
    .filter((r) => scenarios.every((rows) => ids(rows).has(r.id)))
    .map((r) => latest.get(r.id) ?? r);
  const added: T[] = [];
  const seen = new Set<string>();
  for (const rows of order === "desc" ? [...scenarios].reverse() : scenarios)
    for (const r of rows)
      if (!baseIds.has(r.id) && !seen.has(r.id)) {
        seen.add(r.id);
        added.push(latest.get(r.id)!);
      }
  return order === "desc" ? [...added, ...kept] : [...kept, ...added];
}

type Items = { items: Row[] };
type Feed = { personas: { key: string; items: Row[] }[] };
type Overview = { recent: Row[] };

/** How each list-shaped response merges across scenarios. Everything else is the latest snapshot. */
function merger(key: string): ((base: unknown, snaps: unknown[]) => unknown) | null {
  if (key.startsWith("listProposals ") || key.startsWith("listAgentRuns "))
    return (base, snaps) => {
      const s = snaps as Items[];
      return {
        ...s.at(-1),
        items: mergeRows(
          (base as Items | undefined)?.items ?? [],
          s.map((x) => x.items),
          "desc",
        ),
      };
    };
  if (key.startsWith("overview "))
    return (base, snaps) => {
      const s = snaps as Overview[];
      const b = (base as Overview | undefined)?.recent ?? [];
      return {
        ...s.at(-1),
        recent: mergeRows(
          b,
          s.map((x) => x.recent),
          "desc",
        ).slice(0, 50),
      };
    };
  if (/^persona:\w+ personaFeed /.test(key))
    return (base, snaps) => {
      const s = snaps as Feed[];
      const last = s.at(-1)!;
      return {
        ...last,
        personas: last.personas.map((p) => {
          const rows = (f: Feed | undefined) => f?.personas.find((x) => x.key === p.key)?.items ?? [];
          return { ...p, items: mergeRows(rows(base as Feed | undefined), s.map(rows), "asc") };
        }),
      };
    };
  return null;
}

let cache: { key: string; map: Promise<Map<string, unknown>> } | null = null;

/**
 * world.json responses with the played phases laid over them. Within a scenario a later phase replaces
 * an earlier one. Across scenarios, plain responses take the latest snapshot, while lists (proposals,
 * agent runs, the event feed, the phones) accumulate, so playing a second scenario keeps the first one's
 * work on screen.
 */
export function responsesFor(l: Ledger): Promise<Map<string, unknown>> {
  const key = l.phases.join("|");
  if (cache?.key !== key) {
    cache = {
      key,
      map: (async () => {
        const map = new Map(Object.entries(WORLD.responses));
        // Response key to scenario to that scenario's latest snapshot, in the order scenarios last played.
        const lists = new Map<string, Map<string, unknown>>();
        for (const k of l.phases) {
          const scenario = k.split("/")[0]!;
          const phase = await loadPhase(k);
          for (const [rk, v] of Object.entries(phase?.responses ?? {})) {
            if (!merger(rk)) {
              map.set(rk, v);
              continue;
            }
            const per = lists.get(rk) ?? new Map<string, unknown>();
            per.delete(scenario);
            per.set(scenario, v);
            lists.set(rk, per);
          }
        }
        for (const [rk, per] of lists) map.set(rk, merger(rk)!(WORLD.responses[rk], [...per.values()]));
        return map;
      })(),
    };
  }
  return cache.map;
}
