/**
 * Showcase backend: answers api-client calls from the recorded fixtures and the visitor's ledger.
 * Returns undefined for an endpoint the recordings lack, and the caller falls back to the contract mock.
 * In the browser it reads and changes the store; on the server it reads the ledger cookie and never
 * changes anything.
 */
import type { ActionProposal } from "@/contracts";
import type {
  ChatRequest,
  CheckinRequest,
  CheckinResult,
  DemoPersona,
  EndpointName,
  MeResponse,
  MyScheduleResponse,
  ProposalResponse,
} from "@/contracts/api";
import { ApiClientError } from "@/lib/api-client";
import { personaKey, responseKey, type KeyArgs } from "./key";
import { responsesFor, WORLD } from "./data";
import { approve, APPROVERS, reject, ruleFor, satisfied, trigger } from "./engine";
import { chat } from "./helpdesk";
import { clockOffset, getLedger, ledgerFromCookie, setLedger, type Ledger } from "./store";
import tickets from "./tickets.json";

type Args = { params?: Record<string, string>; body?: unknown; query?: Record<string, unknown> };
type Ctx = { l: Ledger; map: Map<string, unknown>; browser: boolean };

const clone = <T>(v: T): T => structuredClone(v);
const forbidden = (m: string) => new ApiClientError(403, "forbidden", m);
const notFound = (m: string) => new ApiClientError(404, "not_found", m);
const LABEL: Record<string, string> = { owner: "the Event head", faculty: "the Faculty approver" };

function keyArgs(a: Args): KeyArgs {
  return {
    ...(a.params && Object.keys(a.params).length ? { params: a.params } : {}),
    ...(a.query && Object.keys(a.query).length ? { query: a.query } : {}),
  };
}

/** Recorded me for the persona, with the demo clock running from when this visitor started. */
function meFor(c: Ctx): MeResponse {
  const p = c.l.persona;
  const me = p ? (c.map.get(personaKey(p, "me")) as MeResponse | undefined) : undefined;
  if (!me) throw new ApiClientError(401, "unauthenticated", "Choose a persona to sign in");
  return { ...me, clockOffsetMs: clockOffset(c.l, WORLD.demoClock) };
}

/** A proposal as the ledger sees it: approvals so far, rejected, or approved and waiting to run. */
async function patchProposal(c: Ctx, p: ActionProposal): Promise<ActionProposal> {
  if (p.status !== "pending") return p;
  if (c.l.rejected.includes(p.id)) return { ...p, status: "rejected" };
  const got = c.l.approvals[p.id];
  if (!got?.length) return p;
  const approvals = got.map((persona) => {
    const me = c.map.get(personaKey(persona, "me")) as MeResponse | undefined;
    return {
      userId: me?.user.id ?? p.eventId,
      role: me?.memberships.find((m) => m.eventId === p.eventId)?.role ?? "owner",
      at: new Date(c.l.t0 + 1000).toISOString(),
      diffHash: p.diffHash,
    };
  });
  const rule = await ruleFor(c.l, p.id);
  const done = satisfied(rule.roles, p.requiredApprovals, got);
  return { ...p, approvals, status: done ? (rule.after ? "approved" : "executed") : "pending" };
}

async function findProposal(c: Ctx, eventId: string, proposalId: string): Promise<ProposalResponse> {
  const rec = c.map.get(responseKey("getProposal", { params: { eventId, proposalId } })) as
    ProposalResponse | undefined;
  let detail = rec ? clone(rec) : undefined;
  if (!detail) {
    for (const [k, v] of c.map)
      if (k.startsWith("listProposals ")) {
        const hit = (v as { items: ActionProposal[] }).items.find((p) => p.id === proposalId);
        if (hit) detail = { proposal: clone(hit), children: [], canApprove: false, canUndo: false };
      }
  }
  if (!detail) throw notFound("Proposal not found");
  detail.proposal = await patchProposal(c, detail.proposal);
  const persona = c.l.persona;
  const rule = await ruleFor(c.l, proposalId);
  detail.canApprove =
    detail.proposal.status === "pending" &&
    !!persona &&
    APPROVERS.includes(persona) &&
    !(c.l.approvals[proposalId] ?? []).includes(persona) &&
    (!rule.roles || rule.roles.includes(persona));
  detail.canUndo = false;
  return detail;
}

async function doApprove(c: Ctx, a: Args) {
  const { eventId, proposalId } = a.params as { eventId: string; proposalId: string };
  const persona = c.l.persona;
  const d = await findProposal(c, eventId, proposalId);
  if (d.proposal.status !== "pending") throw new ApiClientError(409, "conflict", "This is no longer pending");
  if (!persona || !APPROVERS.includes(persona))
    throw forbidden("Your role can view proposals but not approve them. Switch persona to the Event head.");
  if ((c.l.approvals[proposalId] ?? []).includes(persona))
    throw new ApiClientError(409, "conflict", "You already approved this");
  const rule = await ruleFor(c.l, proposalId);
  if (rule.roles && !rule.roles.includes(persona))
    throw forbidden(
      `This needs ${rule.roles.map((r) => LABEL[r] ?? r).join(" and ")}. Switch persona to approve it.`,
    );
  const { done } = await approve(d.proposal, persona);
  const recorded = done
    ? c.map.get(responseKey("approveProposal", { params: { eventId, proposalId } }))
    : undefined;
  if (recorded) return recorded;
  const after = await responsesFor(getLedger());
  return {
    proposal: (await findProposal({ ...c, l: getLedger(), map: after }, eventId, proposalId)).proposal,
  };
}

function checkin(c: Ctx, s: CheckinRequest): CheckinResult {
  const t = tickets.tickets.find((x) => x.token === `${s.ticketPayload}.${s.signature}`);
  if (!t) return { clientId: s.clientId, status: "invalid" };
  const registration = { id: t.registrationId, name: t.name, college: t.college };
  const first = getLedger().checkins[t.ticketId];
  if (first)
    return {
      clientId: s.clientId,
      status: "duplicate",
      registration,
      original: { at: first, scannerName: "Ravi Kumar" },
    };
  if (c.browser) setLedger((l) => ({ ...l, checkins: { ...l.checkins, [t.ticketId]: s.deviceTime } }));
  return { clientId: s.clientId, status: "checked_in", registration };
}

function closestWhatIf(question: string) {
  const words = new Set(question.toLowerCase().match(/[a-z0-9]+/g) ?? []);
  const score = (s: string) => (s.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter((w) => words.has(w)).length;
  const best = [...WORLD.whatIfSamples].sort((x, y) => score(y.scenario) - score(x.scenario))[0];
  return best?.response ?? WORLD.responses.whatIf;
}

export async function showcaseCall(name: EndpointName, a: Args, cookie?: string): Promise<unknown> {
  const browser = typeof window !== "undefined";
  const l = browser ? getLedger() : ledgerFromCookie(cookie);
  const c: Ctx = { l, map: await responsesFor(l), browser };
  const key = responseKey(name, keyArgs(a));
  const p = a.params ?? {};
  const persona = l.persona as DemoPersona | null;

  switch (name) {
    case "me":
    case "setActiveEvent":
      return meFor(c);
    case "switchPersona": {
      const next = (a.body as { persona: DemoPersona }).persona;
      if (browser) setLedger((x) => ({ ...x, persona: next }));
      return meFor({ ...c, l: { ...l, persona: next } });
    }
    case "myRegistration":
    case "mySchedule":
    case "myTicket": {
      meFor(c);
      const rec = c.map.get(personaKey(persona!, name));
      if (name === "myRegistration") return rec ?? { registration: null };
      if (!rec) throw notFound("No ticket for this account");
      if (name === "mySchedule") return rec;
      const reg = (c.map.get(personaKey(persona!, "myRegistration")) as { registration?: { id: string } })
        ?.registration;
      const t = tickets.tickets.find((x) => x.registrationId === reg?.id) ?? tickets.tickets[0]!;
      const base = rec as { ticket: Record<string, unknown> };
      const at = l.checkins[t.ticketId];
      return {
        ticket: { ...base.ticket, id: t.ticketId, token: t.token },
        qrPngDataUrl: t.qrPngDataUrl,
        ...(at ? { checkedInAt: at } : {}),
      };
    }
    case "personaFeed":
      return (
        c.map.get(personaKey(persona ?? "owner", name, keyArgs(a))) ??
        c.map.get(personaKey("owner", name, keyArgs(a)))
      );
    case "overview": {
      const o = c.map.get(key) as { metrics: { at: string } } | undefined;
      if (!o) return undefined;
      const at = new Date(Date.now() + clockOffset(l, WORLD.demoClock)).toISOString();
      return { ...o, metrics: { ...o.metrics, at } };
    }
    case "realSends":
    case "setRealSends":
      // Nothing is ever sent from the showcase, so the switch stays off and locked.
      return { on: false, source: "env", canChange: false };
    case "verifyKey":
      return {
        eventId: WORLD.eventId,
        algorithm: "Ed25519",
        publicKey: tickets.publicKey,
        keyId: tickets.keyId,
      };
    case "crewCheckin":
      return checkin(c, a.body as CheckinRequest);
    case "crewCheckinSync":
      return { results: (a.body as { scans: CheckinRequest[] }).scans.map((s) => checkin(c, s)) };
    case "listProposals": {
      const r = c.map.get(key) as { items: ActionProposal[]; nextCursor: string | null } | undefined;
      if (!r) return undefined;
      const items = await Promise.all(r.items.map((x) => patchProposal(c, x)));
      const want = a.query?.status;
      const keep = want ? ([want].flat() as string[]) : null;
      return { ...r, items: keep ? items.filter((x) => keep.includes(x.status)) : items };
    }
    case "getProposal":
      return findProposal(c, p.eventId!, p.proposalId!);
    case "approveProposal":
      return doApprove(c, a);
    case "rejectProposal": {
      const d = await findProposal(c, p.eventId!, p.proposalId!);
      if (d.proposal.status !== "pending")
        throw new ApiClientError(409, "conflict", "This is no longer pending");
      if (!persona || !APPROVERS.includes(persona))
        throw forbidden("Your role can view proposals but not reject them.");
      reject(d.proposal);
      return { proposal: { ...d.proposal, status: "rejected" } };
    }
    case "editProposal":
    case "undoProposal":
      throw forbidden("Editing and undo run on the live app. In this showcase, approve or reject.");
    case "demoTrigger":
      if (!browser) return { message: "" };
      return trigger((a.body as { scenario: string }).scenario);
    case "listAgentRuns": {
      if (c.map.has(key)) return c.map.get(key);
      const all = c.map.get(responseKey(name, { params: a.params, query: { limit: 50 } })) as
        { items: { agent: string }[] } | undefined;
      if (!all) return undefined;
      const agent = a.query?.agent;
      const items = all.items.filter((r) => !agent || r.agent === agent);
      return { items: items.slice(0, Number(a.query?.limit ?? 50)), nextCursor: null };
    }
    case "getAgentRun":
      if (!c.map.has(key)) throw notFound("Run not found");
      return c.map.get(key);
    case "generateBriefing":
      return c.map.get(
        responseKey("getBriefing", { query: { eventId: (a.body as { eventId: string }).eventId } }),
      );
    case "whatIf":
      return closestWhatIf((a.body as { scenario: string }).scenario);
    default:
      return c.map.get(key);
  }
}

export async function* showcaseChat(body: ChatRequest) {
  const l = getLedger();
  const map = await responsesFor(l);
  const schedule = map.get(personaKey("attendee", "mySchedule")) as MyScheduleResponse | undefined;
  yield* chat(body, schedule);
}
