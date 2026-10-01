import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ENDPOINTS, StreamMessage, type EndpointName } from "@/contracts/api";
import { onMessage } from "@/showcase/bus";
import { loadScenario, WORLD } from "@/showcase/data";
import { GAP_TO, resetDemo, schedule } from "@/showcase/engine";
import { showcaseCall } from "@/showcase/mock";
import {
  AS_HEADER,
  decode,
  fresh,
  getLedger,
  ledgerFromCookie,
  resetMemoryForTests,
  setLedger,
} from "@/showcase/store";

const EVENT = WORLD.eventId;
const CANCEL = "b44229c5-4e96-4c2b-845e-f7a3dceb6d24";

/** A browser-ish global scope: the store keeps its state in memory and a cookie string. */
function fakeBrowser() {
  const items = new Map<string, string>();
  vi.stubGlobal("window", { addEventListener: () => undefined });
  vi.stubGlobal("document", { cookie: "" });
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => items.get(k) ?? null,
    setItem: (k: string, v: string) => void items.set(k, v),
  });
}

/** Call like the api client does: the response must match the contract. */
async function call<N extends EndpointName>(name: N, args: Record<string, unknown> = {}) {
  const res = await showcaseCall(name, args);
  return ENDPOINTS[name].response.parse(res) as never;
}

beforeEach(() => {
  fakeBrowser();
  resetMemoryForTests();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ledger", () => {
  it("round trips through the cookie and rejects junk", () => {
    const l = { ...fresh(5), persona: "owner" as const, phases: ["speaker_cancel/trigger"] };
    const cookie = `a=1; offstage_showcase=${encodeURIComponent(JSON.stringify(l))}; b=2`;
    expect(ledgerFromCookie(cookie)).toEqual(l);
    expect(decode("{nope")).toBeNull();
    expect(ledgerFromCookie(undefined).persona).toBeNull();
  });

  it("mirrors every change to the cookie the server reads", () => {
    setLedger((l) => ({ ...l, persona: "faculty" }));
    expect(ledgerFromCookie(document.cookie).persona).toBe("faculty");
  });
});

describe("timeline", () => {
  it("squeezes long gaps and keeps order", () => {
    expect(schedule([{ t: 500 }, { t: 900 }, { t: 18_000 }, { t: 18_100 }])).toEqual([
      500,
      900,
      900 + GAP_TO,
      1000 + GAP_TO,
    ]);
  });

  it("plays speaker_cancel end to end: trigger, owner then faculty, after phase, helpdesk", async () => {
    vi.useFakeTimers();
    const seen: StreamMessage[] = [];
    onMessage((m) => seen.push(StreamMessage.parse(m)));

    await expect(call("me")).rejects.toMatchObject({ status: 401 });
    await call("switchPersona", { body: { persona: "owner" } });
    const me = (await call("me")) as { user: { name: string }; memberships: { role: string }[] };
    expect(me.memberships[0]?.role).toBe("owner");

    const r = (await call("demoTrigger", { body: { scenario: "speaker_cancel" } })) as { message: string };
    expect(r.message).toMatch(/Cancelled/);
    await vi.runAllTimersAsync();
    const trig = (await loadScenario("speaker_cancel")).phases[0]!;
    expect(seen.map((m) => m.type)).toEqual(trig.stream.map((s) => s.msg.type));
    expect(getLedger().phases).toEqual(["speaker_cancel/trigger"]);

    const list = (await call("listProposals", {
      params: { eventId: EVENT },
      query: { status: "pending", limit: 100 },
    })) as { items: { id: string }[] };
    expect(list.items.map((p) => p.id)).toContain(CANCEL);

    // A judge may look but not approve.
    await call("switchPersona", { body: { persona: "viewer" } });
    const args = { params: { eventId: EVENT, proposalId: CANCEL }, body: { diffHash: "x" } };
    await expect(call("approveProposal", args)).rejects.toMatchObject({ status: 403 });

    await call("switchPersona", { body: { persona: "owner" } });
    const first = (await call("approveProposal", args)) as {
      proposal: { status: string; approvals: unknown[] };
    };
    expect(first.proposal).toMatchObject({ status: "pending" });
    expect(first.proposal.approvals).toHaveLength(1);
    await expect(call("approveProposal", args)).rejects.toMatchObject({ status: 409 });

    // The schedule has not changed yet: the keynote is cancelled with nothing in its slot.
    const before = await askHelpdesk("When is the keynote: Open source careers?");
    expect(before).toMatch(/cancelled\.$/);

    seen.length = 0;
    await call("switchPersona", { body: { persona: "faculty" } });
    await call("approveProposal", args);
    await vi.runAllTimersAsync();
    const after = (await loadScenario("speaker_cancel")).phases[1]!;
    expect(seen.map((m) => m.type)).toEqual(after.stream.map((s) => s.msg.type));
    expect(getLedger().phases).toEqual(["speaker_cancel/trigger", "speaker_cancel/approve-1"]);
    expect(getLedger().playing).toEqual([]);

    const detail = (await call("getProposal", { params: { eventId: EVENT, proposalId: CANCEL } })) as {
      proposal: { status: string };
    };
    expect(detail.proposal.status).not.toBe("pending");
    const feed = (await call("personaFeed", { params: { eventId: EVENT } })) as {
      personas: { items: unknown[] }[];
    };
    expect(feed.personas.some((p) => p.items.length > 0)).toBe(true);

    expect(await askHelpdesk("When is the keynote: Open source careers?")).toMatch(
      /Evaluating LLM apps now runs in its slot, .* 4:00 PM in Main Auditorium/,
    );

    resetDemo();
    expect(getLedger()).toMatchObject({ persona: "faculty", phases: [], approvals: {} });
  });

  it("rejects without playing anything", async () => {
    await call("switchPersona", { body: { persona: "owner" } });
    const id = "d249894a-be5c-417b-aee9-08eaef5ad69d";
    await call("rejectProposal", { params: { eventId: EVENT, proposalId: id }, body: { reason: "No" } });
    const list = (await call("listProposals", {
      params: { eventId: EVENT },
      query: { status: "pending", limit: 100 },
    })) as { items: { id: string }[] };
    expect(list.items.map((p) => p.id)).not.toContain(id);
  });

  it("answers every page's reads for every persona within the contract", async () => {
    for (const persona of ["owner", "faculty", "volunteer", "attendee", "viewer"] as const) {
      setLedger((l) => ({ ...l, persona }));
      await call("me");
      await call("overview", { params: { eventId: EVENT } });
      await call("deliveryStats", { params: { eventId: EVENT } });
      await call("realSends", { params: { eventId: EVENT } });
      await call("listAgentRuns", { params: { eventId: EVENT }, query: { agent: "commander", limit: 1 } });
      await call("closeout", { params: { eventId: EVENT } });
      await call("evals", { params: { eventId: EVENT } });
      await call("getBriefing", { query: { eventId: EVENT } });
      await call("whatIf", { body: { eventId: EVENT, scenario: "What if the main speaker cancels?" } });
      await call("verifyKey", { params: { slug: WORLD.eventSlug } });
    }
  });
});

describe("server pages", () => {
  it("render the cookie persona, or the area default before one is chosen", async () => {
    vi.unstubAllGlobals();
    const name = async (headers: Record<string, string>) =>
      ((await showcaseCall("me", {}, headers)) as { user: { name: string } }).user.name;
    expect(await name({ [AS_HEADER]: "attendee" })).toBe("Sneha Reddy");
    const cookie = `offstage_showcase=${encodeURIComponent(JSON.stringify({ ...fresh(), persona: "faculty" }))}`;
    expect(await name({ cookie, [AS_HEADER]: "attendee" })).toBe("Dr. Srinivasa Rao");
    await expect(showcaseCall("me", {}, {})).rejects.toMatchObject({ status: 401 });
  });
});

describe("offline check-in", () => {
  it("signs tickets the real WebCrypto check accepts, and checks each in once", async () => {
    const { verifyOffline } = await import("@/components/crew/offline");
    const tickets = (await import("@/showcase/tickets.json")).default;
    setLedger((l) => ({ ...l, persona: "volunteer" }));
    const key = (await call("verifyKey", { params: { slug: WORLD.eventSlug } })) as {
      publicKey: string;
      keyId: string;
      eventId: string;
    };
    const t = tickets.tickets[1]!;
    const local = await verifyOffline(t.token, { ...key, revoked: [], at: "" }, Date.parse(WORLD.demoClock));
    expect(local.ok).toBe(true);
    const [payload, signature] = t.token.split(".");
    const scan = { ticketPayload: payload, signature, deviceTime: WORLD.demoClock, clientId: "c1" };
    const res = (await call("crewCheckinSync", { body: { scans: [scan, { ...scan, clientId: "c2" }] } })) as {
      results: { status: string }[];
    };
    expect(res.results.map((r) => r.status)).toEqual(["checked_in", "duplicate"]);
  });
});

async function askHelpdesk(message: string) {
  const { showcaseChat } = await import("@/showcase/mock");
  let last = "";
  const pending = (async () => {
    for await (const c of showcaseChat({ message })) if (c.type === "done") last = c.result.answer.answer;
  })();
  if (vi.isFakeTimers()) await vi.runAllTimersAsync();
  await pending;
  return last;
}
