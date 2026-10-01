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

let cache: { key: string; map: Promise<Map<string, unknown>> } | null = null;

/** world.json responses with each played phase's snapshot laid over them, in play order. */
export function responsesFor(l: Ledger): Promise<Map<string, unknown>> {
  const key = l.phases.join("|");
  if (cache?.key !== key) {
    cache = {
      key,
      map: (async () => {
        const map = new Map(Object.entries(WORLD.responses));
        for (const k of l.phases) {
          const phase = await loadPhase(k);
          for (const [rk, v] of Object.entries(phase?.responses ?? {})) map.set(rk, v);
        }
        return map;
      })(),
    };
  }
  return cache.map;
}
