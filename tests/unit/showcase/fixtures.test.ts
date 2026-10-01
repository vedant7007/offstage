import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ENDPOINTS, StreamMessage, type EndpointName } from "@/contracts/api";
import { personaKey, responseKey } from "@/showcase/key";
import { createScrubber, findPii } from "@/showcase/pii";

const DIR = path.resolve("src/showcase/fixtures");
const SCENARIOS = [
  "speaker_cancel",
  "lunch_confusion",
  "volunteer_noshow",
  "queue_spike",
  "budget_breach",
  "projector_voice_note",
  "emergency",
];
const read = (f: string): unknown => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8"));

/** "persona:owner me {...}" -> "me" */
const endpointOf = (key: string) => key.replace(/^persona:\S+ /, "").split(" ")[0] as EndpointName;

function expectResponses(responses: Record<string, unknown>, where: string) {
  for (const [key, value] of Object.entries(responses)) {
    const ep = ENDPOINTS[endpointOf(key)];
    expect(ep, `${where}: unknown endpoint in key ${key}`).toBeDefined();
    const r = ep.response.safeParse(value);
    expect(r.success, `${where}: ${key} does not match the contract`).toBe(true);
  }
}

describe("responseKey", () => {
  it("is the name alone without params or query", () => {
    expect(responseKey("me")).toBe("me");
  });
  it("sorts keys so the order of arguments never matters", () => {
    expect(
      responseKey("listProposals", { query: { status: "pending", limit: 100 }, params: { eventId: "e" } }),
    ).toBe('listProposals {"params":{"eventId":"e"},"query":{"limit":100,"status":"pending"}}');
    expect(personaKey("attendee", "myTicket")).toBe("persona:attendee myTicket");
  });
});

describe("PII scrubbing", () => {
  it("replaces phones, emails and chat ids consistently and the check passes after", () => {
    const { scrub } = createScrubber();
    const raw = {
      a: "Call +91 98765 43210 or 9876543210, mail sneha.k@gmail.com",
      chatId: 5551234567,
      b: ["sneha.k@gmail.com", "+919876543210"],
    };
    expect(findPii(raw).length).toBeGreaterThan(0);
    const out = scrub(raw);
    expect(out.a).toBe("Call +91 90000 00001 or +91 90000 00001, mail sneha@example.com");
    expect(out.b).toEqual(["sneha@example.com", "+91 90000 00001"]);
    expect(out.chatId).toBe(10000001);
    expect(findPii(out)).toEqual([]);
  });
  it("leaves ids and timestamps alone", () => {
    const { scrub } = createScrubber();
    const v = { id: "e0c3665e-6f00-4007-9855-915febc33cc8", at: "2026-10-24T05:00:00.000Z", n: "Rs 12000" };
    expect(scrub(v)).toEqual(v);
  });
});

// Parsing every recorded response is slow on a busy machine; the 5 s default flakes.
describe("showcase fixtures", { timeout: 30_000 }, () => {
  it("world.json responses match the contract", () => {
    const world = read("world.json") as {
      responses: Record<string, unknown>;
      personas: Record<string, { me: unknown }>;
    };
    expectResponses(world.responses, "world");
    for (const [p, v] of Object.entries(world.personas))
      expect(ENDPOINTS.me.response.safeParse(v.me).success, `persona ${p}`).toBe(true);
  });

  it.each(SCENARIOS)("%s: stream messages and responses match the contract", (s) => {
    const file = read(`scenarios/${s}.json`) as {
      scenario: string;
      recorded: boolean;
      note?: string;
      phases: { id: string; stream: { t: number; msg: unknown }[]; responses: Record<string, unknown> }[];
    };
    expect(file.scenario).toBe(s);
    if (!file.recorded) expect(file.note, "synthesized scenarios must say why").toBeTruthy();
    expect(file.phases[0]?.id).toBe("trigger");
    for (const ph of file.phases) {
      for (const { t, msg } of ph.stream) {
        expect(t).toBeGreaterThanOrEqual(0);
        expect(StreamMessage.safeParse(msg).success, `${s}/${ph.id}: bad stream message`).toBe(true);
      }
      expectResponses(ph.responses, `${s}/${ph.id}`);
    }
  });

  it("no fixture file carries real phone numbers or emails", () => {
    const files = [
      "world.json",
      "kb.json",
      "recorded-runs.json",
      "evals.json",
      "closeout.json",
      "briefing.json",
      ...SCENARIOS.map((s) => `scenarios/${s}.json`),
    ];
    for (const f of files) expect(findPii(read(f)), f).toEqual([]);
  });

  it("the copies for the landing page match their endpoints", () => {
    expect(ENDPOINTS.evals.response.safeParse(read("evals.json")).success).toBe(true);
    expect(ENDPOINTS.getBriefing.response.safeParse(read("briefing.json")).success).toBe(true);
    const c = read("closeout.json") as { closeout: unknown; closeoutSummary: unknown };
    expect(ENDPOINTS.closeout.response.safeParse(c.closeout).success).toBe(true);
    expect(ENDPOINTS.closeoutSummary.response.safeParse(c.closeoutSummary).success).toBe(true);
  });
});
