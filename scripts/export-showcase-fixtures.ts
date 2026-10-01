/**
 * Records the showcase fixtures (src/showcase/fixtures/README.md) from a running app, the way a
 * browser sees it: persona cookies, the console SSE stream and the read endpoints the UI calls.
 *
 * Needs the web app on APP_URL and the worker on the same DEMO_MODE database, with real sends
 * off. Resets the demo before every scenario, so never point it at a database you care about.
 *
 *   pnpm showcase:fixtures                    world, every scenario, kb, runs, evals
 *   pnpm showcase:fixtures speaker_cancel     world plus the named scenarios only
 *   pnpm showcase:fixtures --snapshot-runs=arch_015628z
 *                                             also adds the real speaker_cancel runs of a restored server
 *                                             database (read only) to recorded-runs.json
 */
import "@/server/load-env";
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { DomainEventPayloads } from "@/contracts";
import { DemoScenario, ENDPOINTS, StreamMessage, type EndpointName } from "@/contracts/api";
import { HACKNOVA_SLUG } from "@/contracts/fixtures";
import { db, sql } from "@/db/client";
import { buildPath } from "@/lib/api-client";
import { publish } from "@/server/events/bus";
import { personaKey, responseKey, type KeyArgs } from "@/showcase/key";
import { createScrubber, findPii } from "@/showcase/pii";

const BASE = process.env.APP_URL ?? "http://localhost:3100";
const OUT = path.resolve("src/showcase/fixtures");
const QUIET_MS = 20_000;
const MAX_PHASE_MS = 6 * 60_000;
const MAX_APPROVALS = 10;

type Persona =
  "owner" | "program_lead" | "comms_lead" | "faculty" | "volunteer" | "attendee" | "sponsor" | "viewer";
const PERSONAS: Persona[] = [
  "owner",
  "program_lead",
  "comms_lead",
  "faculty",
  "volunteer",
  "attendee",
  "sponsor",
  "viewer",
];
/** Personas that open the console (the others get 403 on console reads). */
const CONSOLE: Persona[] = ["owner", "program_lead", "comms_lead", "faculty", "viewer"];
const APPROVERS: Persona[] = ["owner", "faculty", "program_lead", "comms_lead"];
type Scenario = DemoScenario | "emergency";
const SCENARIOS: Scenario[] = [...DemoScenario.options, "emergency"];
type Responses = Record<string, unknown>;
type Args = KeyArgs & { body?: unknown };

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ http, like the browser

const jars: Partial<Record<Persona, string>> = {};

/** The dev server drops a kept-alive socket now and then (ECONNRESET); a browser would retry too. */
async function fetchRetry(url: string, init: RequestInit): Promise<Response> {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, init);
    } catch (err) {
      if (i >= 3) throw err;
      await wait(1000 * (i + 1));
    }
  }
}

async function switchPersona(p: Persona): Promise<unknown> {
  const res = await fetchRetry(`${BASE}/api/demo/switch-persona`, {
    method: "POST",
    headers: { "content-type": "application/json", origin: BASE },
    body: JSON.stringify({ persona: p }),
  });
  if (!res.ok) throw new Error(`switch to ${p} failed: ${res.status}`);
  jars[p] = res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");
  return res.json();
}

async function call(p: Persona | null, name: EndpointName, args: Args = {}): Promise<unknown> {
  const ep = ENDPOINTS[name] as {
    method: string;
    path: string;
    response: { safeParse(v: unknown): { success: boolean } };
  };
  const qs = args.query
    ? "?" + new URLSearchParams(Object.entries(args.query).map(([k, v]) => [k, String(v)])).toString()
    : "";
  const res = await fetchRetry(`${BASE}${buildPath(ep.path, args.params)}${qs}`, {
    method: ep.method,
    headers: {
      accept: "application/json",
      origin: BASE,
      ...(p && jars[p] ? { cookie: jars[p] } : {}),
      ...(args.body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: args.body !== undefined ? JSON.stringify(args.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${name} as ${p ?? "public"}: ${res.status} ${text.slice(0, 200)}`);
  const json: unknown = JSON.parse(text);
  if (!ep.response.safeParse(json).success) throw new Error(`${name}: response does not match the contract`);
  return json;
}

/** Calls and stores under `key`; logs and skips endpoints that fail (routes not on main yet). */
async function grab(out: Responses, key: string, p: Persona | null, name: EndpointName, args: Args = {}) {
  try {
    out[key] = await call(p, name, args);
  } catch (err) {
    log("  skip", key, (err as Error).message.slice(0, 160));
  }
}

// ------------------------------------------------------------------ console SSE stream

class StreamRecorder {
  msgs: { at: number; msg: unknown }[] = [];
  lastActivity = Date.now();
  private ctrl = new AbortController();

  start(cookie: string, eventId: string) {
    void (async () => {
      const res = await fetch(`${BASE}${buildPath(ENDPOINTS.stream.path, { eventId })}`, {
        headers: { accept: "text/event-stream", cookie },
        signal: this.ctrl.signal,
      });
      if (!res.ok || !res.body) throw new Error(`stream ${res.status}`);
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += value;
        let i: number;
        while ((i = buf.indexOf("\n\n")) >= 0) {
          const block = buf.slice(0, i);
          buf = buf.slice(i + 2);
          const data = block
            .split("\n")
            .filter((l) => l.startsWith("data:"))
            .map((l) => l.slice(5).trim())
            .join("\n");
          if (!data) continue;
          const msg: unknown = JSON.parse(data);
          if (!StreamMessage.safeParse(msg).success) continue;
          const type = (msg as { type: string }).type;
          if (type === "heartbeat") continue;
          this.msgs.push({ at: Date.now(), msg });
          if (type !== "metrics") this.lastActivity = Date.now();
        }
      }
    })().catch((err: unknown) => {
      if (!this.ctrl.signal.aborted) log("stream ended:", (err as Error).message);
    });
  }

  stop() {
    this.ctrl.abort();
  }

  slice(from: number, to = Infinity) {
    return this.msgs.filter((m) => m.at >= from && m.at < to).map((m) => ({ t: m.at - from, msg: m.msg }));
  }
}

async function runningRuns(eventId: string): Promise<number> {
  const [r] = await sql<{ n: number }[]>`
    select count(*)::int as n from agent_runs where event_id = ${eventId} and status = 'running'`;
  return r?.n ?? 0;
}

/** Until nothing but metrics arrived for QUIET_MS and no agent run is still going. */
async function waitQuiet(rec: StreamRecorder, eventId: string, since: number) {
  for (;;) {
    await wait(1000);
    const now = Date.now();
    if (now - since > MAX_PHASE_MS) return log("  phase hit the time cap");
    if (now - Math.max(rec.lastActivity, since) < QUIET_MS) continue;
    if ((await runningRuns(eventId)) === 0) return;
  }
}

// ------------------------------------------------------------------ snapshots

interface Ctx {
  eventId: string;
  slug: string;
}

type Item = { id: string };
const items = (r: unknown): Item[] => ((r as { items?: Item[] } | undefined)?.items ?? []) as Item[];

/** Every read the console, the phone dock, the attendee portal, the crew app and public pages make. */
async function snapshot(
  ctx: Ctx,
  extra: { runIds: string[]; proposalIds: string[]; agents: string[]; world?: boolean },
) {
  const out: Responses = {};
  const ev = { params: { eventId: ctx.eventId } };
  const slug = { params: { slug: ctx.slug } };
  const o = "owner" as const;
  await grab(out, responseKey("overview", ev), o, "overview", ev);
  await grab(out, responseKey("realSends", ev), o, "realSends", ev);
  const pending = { ...ev, query: { status: "pending", limit: 100 } };
  await grab(out, responseKey("listProposals", pending), o, "listProposals", pending);
  const runs = { ...ev, query: { limit: 50 } };
  await grab(out, responseKey("listAgentRuns", runs), o, "listAgentRuns", runs);
  await grab(out, responseKey("deliveryStats", ev), o, "deliveryStats", ev);
  await grab(out, responseKey("closeout", ev), o, "closeout", ev);
  // A reset wipes the golden evals run and the briefing: they belong to the world only.
  if (extra.world) await grab(out, responseKey("evals", ev), o, "evals", ev);
  const brief = { query: { eventId: ctx.eventId } };
  if (extra.world) await grab(out, responseKey("getBriefing", brief), o, "getBriefing", brief);
  for (const n of ["publicEvent", "publicStatus", "verifyKey", "revocations"] as const)
    await grab(out, responseKey(n, slug), null, n, slug);

  for (const p of PERSONAS) {
    // me carries the moving clock offset; personas do not change during a scenario.
    if (extra.world) await grab(out, personaKey(p, "me"), p, "me");
    if (CONSOLE.includes(p)) await grab(out, personaKey(p, "personaFeed", ev), p, "personaFeed", ev);
  }
  for (const n of ["myRegistration", "myTicket", "mySchedule"] as const)
    await grab(out, personaKey("attendee", n), "attendee", n);
  for (const n of ["crewShifts", "crewTasks"] as const)
    await grab(out, personaKey("volunteer", n), "volunteer", n);

  const proposalIds = new Set([
    ...extra.proposalIds,
    ...items(out[responseKey("listProposals", pending)]).map((p) => p.id),
  ]);
  for (const id of proposalIds) {
    const a = { params: { eventId: ctx.eventId, proposalId: id } };
    await grab(out, responseKey("getProposal", a), o, "getProposal", a);
  }
  for (const id of extra.runIds) {
    const a = { params: { eventId: ctx.eventId, runId: id } };
    await grab(out, responseKey("getAgentRun", a), o, "getAgentRun", a);
  }
  for (const agent of extra.agents) {
    const a = { ...ev, query: { agent, limit: 1 } };
    await grab(out, responseKey("listAgentRuns", a), o, "listAgentRuns", a);
  }
  return out;
}

/** Only the keys whose value differs from what the engine already has. */
function changed(next: Responses, base: Responses): Responses {
  return Object.fromEntries(
    Object.entries(next).filter(([k, v]) => JSON.stringify(v) !== JSON.stringify(base[k])),
  );
}

// ------------------------------------------------------------------ demo control

function reset() {
  execSync("corepack pnpm demo:reset", { stdio: "pipe" });
}

async function loginAll() {
  const me: Partial<Record<Persona, unknown>> = {};
  for (const p of PERSONAS) me[p] = await switchPersona(p);
  return me;
}

async function eventCtx(): Promise<Ctx> {
  const [ev] = await sql<{ id: string }[]>`select id from events where slug = ${HACKNOVA_SLUG}`;
  if (!ev) throw new Error("HackNova is not seeded");
  return { eventId: ev.id, slug: HACKNOVA_SLUG };
}

/** The real emergency path: a volunteer's voice note that Radar classifies as medical. */
async function raiseEmergency(eventId: string): Promise<string> {
  const [ravi] = await sql<{ userId: string | null; volunteerId: string }[]>`
    select v.user_id as "userId", v.id as "volunteerId" from volunteers v join users u on u.id = v.user_id
    where v.event_id = ${eventId} and u.email = 'ravi@sutradhar.test'`;
  if (!ravi) throw new Error("volunteer persona not seeded");
  const transcript =
    "Lab 204 ke bahar ek student behosh ho gaya hai, saans lene mein dikkat hai. Jaldi first aid bhejo.";
  await db.transaction(async (tx) => {
    await publish(tx, {
      eventId,
      type: "voice_note.received",
      entity: "volunteers",
      entityId: ravi.volunteerId,
      actor: { kind: "system", eventId, reason: "showcase emergency recording" },
      payload: DomainEventPayloads["voice_note.received"].parse({
        uploadPath: "uploads/demo/emergency-voice-note.ogg",
        mimeType: "audio/ogg",
        durationSeconds: 7,
        fromUserId: ravi.userId ?? undefined,
        fromVolunteerId: ravi.volunteerId,
        channel: "telegram",
        transcript,
      }),
    });
  });
  return "Published voice_note.received with a medical emergency transcript from Ravi.";
}

// ------------------------------------------------------------------ recorded runs

interface RunRow {
  id: string;
  agent: string;
  input_tokens: number;
  output_tokens: number;
  cost_usd: string;
  latency_ms: number | null;
  step_count: number;
  status: string;
  models: string[] | null;
  providers: string[] | null;
}

async function runRows(client: postgres.Sql, eventId: string, after: string[] | null, ids?: string[]) {
  return client<RunRow[]>`
    select r.id, r.agent, r.input_tokens, r.output_tokens, r.cost_usd, r.latency_ms, r.step_count, r.status,
      array_agg(distinct s.data->>'model') filter (where s.kind = 'llm' and s.data->>'model' is not null) as models,
      array_agg(distinct s.data->>'provider') filter (where s.kind = 'llm' and s.data->>'provider' is not null) as providers
    from agent_runs r left join agent_steps s on s.run_id = r.id
    where r.event_id = ${eventId}
      ${ids ? client`and r.id in ${client(ids)}` : client``}
      ${after ? client`and r.id not in ${client(after.length ? after : ["-"])}` : client``}
    group by r.id order by r.started_at`;
}

const toRecorded = (r: RunRow, scenario: string, source: string) => ({
  id: r.id,
  agent: r.agent,
  scenario,
  model: r.models?.join(", ") || null,
  provider: r.providers?.join(", ") || null,
  inputTokens: r.input_tokens,
  outputTokens: r.output_tokens,
  costUsd: Number(r.cost_usd),
  latencyMs: r.latency_ms,
  steps: r.step_count,
  status: r.status,
  recorded: true,
  source,
});
type Recorded = ReturnType<typeof toRecorded>;

// ------------------------------------------------------------------ scenario recording

interface Phase {
  id: string;
  after: { approve: string } | null;
  stream: { t: number; msg: unknown }[];
  responses: Responses;
}

function seenIn(stream: { msg: unknown }[]) {
  const runIds = new Set<string>();
  const proposalIds = new Set<string>();
  const agents = new Set<string>();
  for (const { msg } of stream) {
    const m = msg as {
      type: string;
      run?: { id: string; agent: string };
      proposal?: { id: string };
      agent?: string;
      runId?: string;
    };
    if (m.type === "agent_run" && m.run) {
      runIds.add(m.run.id);
      agents.add(m.run.agent);
    }
    if (m.type === "agent_step" && m.runId && m.agent) {
      runIds.add(m.runId);
      agents.add(m.agent);
    }
    if (m.type === "proposal" && m.proposal) proposalIds.add(m.proposal.id);
  }
  return { runIds: [...runIds], proposalIds: [...proposalIds], agents: [...agents] };
}

async function recordScenario(scenario: Scenario, world: Responses, worldEventId: string) {
  log(`== ${scenario}`);
  reset();
  await loginAll();
  const ctx = await eventCtx();
  if (ctx.eventId !== worldEventId)
    throw new Error("event id changed across resets; fixtures would not line up");
  const rec = new StreamRecorder();
  rec.start(jars.owner!, ctx.eventId);
  // Scheduled agents catch up on the clock jump after a reset; let them finish before the trigger.
  await waitQuiet(rec, ctx.eventId, Date.now());
  const baselineRuns = (
    await sql<{ id: string }[]>`select id from agent_runs where event_id = ${ctx.eventId}`
  ).map((r) => r.id);
  const pendingNow = await call("owner", "listProposals", {
    params: { eventId: ctx.eventId },
    query: { status: "pending", limit: 100 },
  });
  const baselinePending = new Set(items(pendingNow).map((p) => p.id));
  const recordedAt = new Date().toISOString();
  const phases: Phase[] = [];
  const approvals: Record<string, { tier: string; roles: Persona[] }> = {};
  let state: Responses = { ...world };

  const finishPhase = async (id: string, after: Phase["after"], start: number, own: Responses) => {
    await waitQuiet(rec, ctx.eventId, start);
    const stream = rec.slice(start);
    const snap = await snapshot(ctx, seenIn(stream));
    const responses = { ...changed(snap, state), ...own };
    state = { ...state, ...snap };
    phases.push({ id, after, stream, responses });
    log(`  phase ${id}: ${stream.length} msgs, ${Object.keys(responses).length} changed responses`);
  };

  let start = Date.now();
  const own: Responses = {};
  if (scenario === "emergency") {
    await raiseEmergency(ctx.eventId);
  } else {
    const body = { scenario };
    own[responseKey("demoTrigger")] = await call("owner", "demoTrigger", { body });
  }
  await finishPhase("trigger", null, start, own);

  const approved = new Set<string>();
  for (let n = 0; n < MAX_APPROVALS; n++) {
    const list = (await call("owner", "listProposals", {
      params: { eventId: ctx.eventId },
      query: { status: "pending", limit: 100 },
    })) as { items: { id: string; parentId?: string; createdAt: string }[] };
    const next = list.items
      .filter((p) => !baselinePending.has(p.id) && !approved.has(p.id))
      .sort(
        (a, b) => Number(!!a.parentId) - Number(!!b.parentId) || a.createdAt.localeCompare(b.createdAt),
      )[0];
    if (!next) break;
    approved.add(next.id);
    start = Date.now();
    const roles: Persona[] = [];
    let tier = "";
    const a = { params: { eventId: ctx.eventId, proposalId: next.id } };
    const ownA: Responses = {};
    for (const p of APPROVERS) {
      const detail = (await call(p, "getProposal", a)) as {
        canApprove: boolean;
        proposal: { status: string; riskTier: string; diffHash: string };
      };
      tier = detail.proposal.riskTier;
      if (detail.proposal.status !== "pending") break;
      if (!detail.canApprove) continue;
      if (p !== "owner") await switchPersona(p); // what a person does in the console persona switcher
      ownA[responseKey("approveProposal", a)] = await call(p, "approveProposal", {
        ...a,
        body: { diffHash: detail.proposal.diffHash },
      });
      roles.push(p);
    }
    if (!roles.length) {
      log(`  nobody could approve ${next.id}; leaving it pending`);
      continue;
    }
    approvals[next.id] = { tier, roles };
    await finishPhase(`approve-${phases.length}`, { approve: next.id }, start, ownA);
  }
  rec.stop();

  const runs = await runRows(sql, ctx.eventId, baselineRuns);
  return {
    file: {
      scenario,
      recorded: true,
      recordedAt,
      source: `local run, AI_PROFILE=${process.env.AI_PROFILE ?? "dev"}`,
      phases,
      approvals,
    },
    runs: runs.map((r) => toRecorded(r, scenario, "local run")),
  };
}

// ------------------------------------------------------------------ server snapshot (speaker_cancel)

/** The agent runs that followed session.cancelled on a restored server database (read only). */
async function speakerCancelFromSnapshot(dbName: string) {
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = `/${dbName}`;
  const snap = postgres(url.toString(), { max: 1 });
  try {
    const [ev] = await snap<{ id: string }[]>`select id from events where slug = ${HACKNOVA_SLUG}`;
    // Runs carry the demo clock, domain events real time: start from the Commander run it triggered.
    const [cancel] = await snap<{ at: Date }[]>`
      select started_at as at from agent_runs where event_id = ${ev!.id} and agent = 'commander'
        and trigger->>'eventType' = 'session.cancelled' order by started_at limit 1`;
    if (!cancel) throw new Error("no Commander run for session.cancelled in the snapshot");
    const runs = await snap<{ id: string }[]>`
      select id from agent_runs where event_id = ${ev!.id} and started_at >= ${cancel.at}
        and started_at < ${new Date(cancel.at.getTime() + 60_000)}`;
    const rows = await runRows(
      snap,
      ev!.id,
      null,
      runs.map((r) => r.id),
    );
    return rows.map((r) => toRecorded(r, "speaker_cancel", `server snapshot ${dbName}`));
  } finally {
    await snap.end({ timeout: 5 });
  }
}

// ------------------------------------------------------------------ main

async function main() {
  const only = process.argv.slice(2).filter((a) => !a.startsWith("--")) as Scenario[];
  const snapArg = process.argv.find((a) => a.startsWith("--snapshot-runs="))?.split("=")[1];
  const scenarios = only.length ? only : SCENARIOS;
  for (const s of scenarios) if (!SCENARIOS.includes(s)) throw new Error(`unknown scenario ${s}`);
  fs.mkdirSync(path.join(OUT, "scenarios"), { recursive: true });

  log("== world");
  reset();
  const me = await loginAll();
  const ctx = await eventCtx();
  const real = (await call("owner", "realSends", { params: { eventId: ctx.eventId } })) as { on: boolean };
  if (real.on) throw new Error("real sends are on; switch them off before recording");
  const worldRunIds = (
    await sql<{ id: string }[]>`select id from agent_runs where event_id = ${ctx.eventId}`
  ).map((r) => r.id);
  const ev = { params: { eventId: ctx.eventId } };

  // Real evals and a real briefing, then the plain reads.
  log("  running evals (real)");
  const extra: Responses = {};
  extra[responseKey("runEvals", ev)] = await call("owner", "runEvals", ev);
  for (const until = Date.now() + 20 * 60_000; Date.now() < until; await wait(5000)) {
    const e = (await call("owner", "evals", ev)) as {
      running: unknown;
      golden: unknown;
      lastError: string | null;
    };
    if (!e.running) {
      if (!e.golden) throw new Error(`golden evals failed: ${e.lastError}`);
      break;
    }
  }
  extra[responseKey("closeoutSummary", ev)] = await call("owner", "closeoutSummary", ev);
  const briefKey = responseKey("getBriefing", { query: { eventId: ctx.eventId } });
  const firstBrief = (await call("owner", "getBriefing", { query: { eventId: ctx.eventId } })) as {
    briefing: unknown;
  };
  if (!firstBrief.briefing) await call("owner", "generateBriefing", { body: { eventId: ctx.eventId } });
  const whatIfSamples: { scenario: string; response: unknown }[] = [];
  for (const scenario of ["What if 30% more people show up?", "What if the main speaker cancels?"]) {
    log(`  whatIf: ${scenario}`);
    whatIfSamples.push({
      scenario,
      response: await call("owner", "whatIf", { body: { eventId: ctx.eventId, scenario } }),
    });
  }
  extra[responseKey("whatIf")] = whatIfSamples[0]!.response;
  const reads = await snapshot(ctx, { runIds: worldRunIds, proposalIds: [], agents: [], world: true });
  const worldResponses = { ...reads, ...extra };
  const [clock] = await sql<
    { value: { anchor?: string } }[]
  >`select value from app_settings where key = 'demo_clock'`;
  const homes: Record<Persona, string> = {
    owner: `/console/${ctx.eventId}`,
    program_lead: `/console/${ctx.eventId}`,
    comms_lead: `/console/${ctx.eventId}`,
    faculty: `/console/${ctx.eventId}`,
    viewer: `/console/${ctx.eventId}`,
    sponsor: `/console/${ctx.eventId}`,
    volunteer: "/crew",
    attendee: "/me",
  };
  const world = {
    recordedAt: new Date().toISOString(),
    eventId: ctx.eventId,
    eventSlug: ctx.slug,
    demoClock: clock?.value.anchor ?? null,
    personas: Object.fromEntries(PERSONAS.map((p) => [p, { me: me[p], home: homes[p] }])),
    responses: worldResponses,
    whatIfSamples,
  };
  const kbDocs = await sql<{ id: string; title: string; source: string }[]>`
    select id, title, coalesce(source_path, kind) as source from kb_documents where event_id = ${ctx.eventId} order by created_at, id`;
  const kbChunks = await sql<{ id: string; docId: string; text: string; heading: string }[]>`
    select id, doc_id as "docId", text, section as heading from kb_chunks where event_id = ${ctx.eventId} order by doc_id, ordinal`;
  // Seeded runs are fixtures, not recordings: only runs made during the scenarios count.
  let recordedRuns: Recorded[] = [];

  const files: Record<string, unknown> = {};
  for (const s of scenarios) {
    const { file, runs } = await recordScenario(s, worldResponses, ctx.eventId);
    files[`scenarios/${s}.json`] = file;
    recordedRuns.push(...runs);
  }
  if (snapArg) recordedRuns.push(...(await speakerCancelFromSnapshot(snapArg)));
  recordedRuns = recordedRuns.filter((r, i, a) => a.findIndex((x) => x.id === r.id) === i);

  // Scrub in a fixed order so placeholders stay stable between runs.
  const { scrub } = createScrubber();
  const all: Record<string, unknown> = {
    "world.json": world,
    ...files,
    "kb.json": { docs: kbDocs, chunks: kbChunks },
    "recorded-runs.json": { runs: recordedRuns },
    "evals.json": worldResponses[responseKey("evals", ev)],
    "closeout.json": {
      closeout: worldResponses[responseKey("closeout", ev)],
      closeoutSummary: worldResponses[responseKey("closeoutSummary", ev)],
    },
    "briefing.json": worldResponses[briefKey],
  };
  let bytes = 0;
  for (const [name, value] of Object.entries(all)) {
    const clean = scrub(value);
    const leaks = findPii(clean);
    if (leaks.length) throw new Error(`${name} still has PII after scrubbing (${leaks.length} strings)`);
    const text = JSON.stringify(clean) + "\n";
    fs.writeFileSync(path.join(OUT, name), text);
    bytes += text.length;
    log(`wrote ${name} (${Math.round(text.length / 1024)} KB)`);
  }
  log(`total ${Math.round(bytes / 1024)} KB`);
}

main()
  .catch((err: unknown) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => void sql.end({ timeout: 5 }));
