import { describe, expect, it } from "vitest";
import { fixtures } from "@/contracts/fixtures";
import { ApiClientError, buildPath, createApiClient } from "@/lib/api-client";

const slug = "hacknova-2026";

function jsonFetch(status: number, body: unknown, seen?: { url?: string; init?: RequestInit }) {
  return (async (url: string | URL | Request, init?: RequestInit) => {
    if (seen) {
      seen.url = String(url);
      seen.init = init;
    }
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}

describe("api client, mock mode", () => {
  const api = createApiClient({ mock: true });

  it("serves public pages for both seeded events", async () => {
    expect((await api.publicEvent(slug)).event.slug).toBe(slug);
    expect((await api.publicEvent("raktdaan-2026")).event.type).toBe("charity_drive");
    expect((await api.publicStatus(slug)).rooms.length).toBe(4);
    await expect(api.publicEvent("nope")).rejects.toMatchObject({ code: "not_found" });
  });

  it("serves the attendee portal", async () => {
    expect((await api.me()).user.email).toBe("sneha@sutradhar.test");
    expect((await api.myTicket()).ticket.token).toContain(".");
    expect((await api.mySchedule()).sessions.some((s) => s.mine)).toBe(true);
    expect((await api.dataRequest({ type: "export" })).status).toBe("received");
  });

  it("runs the register flow", async () => {
    await api.otpRequest(slug, { email: "a@b.in" });
    const v = await api.otpVerify(slug, { email: "a@b.in", code: "123456" });
    const r = await api.register(slug, {
      verificationToken: v.verificationToken,
      name: "Asha Rao",
      email: "a@b.in",
      college: "Deccan Institute",
      department: "CSE",
      year: 2,
      section: "A",
      foodPref: "veg",
      adultConfirmed: true,
      consentVersion: "2026-09",
    });
    expect(r.status).toBe("confirmed");
  });

  it("flags the second scan of the same ticket as a duplicate", async () => {
    const scan = { ticketPayload: "abc", signature: "x".repeat(86), deviceTime: fixtures.eventFull().now };
    const first = await api.crewCheckin({ ...scan, clientId: "c1" });
    const second = await api.crewCheckin({ ...scan, clientId: "c2" });
    expect(first.status).toBe("checked_in");
    expect(second.status).toBe("duplicate");
    const synced = await api.crewCheckinSync({ scans: [{ ...scan, clientId: "c3" }] });
    expect(synced.results[0]!.status).toBe("duplicate");
  });

  it("serves the crew app", async () => {
    expect((await api.crewShifts()).shifts.length).toBeGreaterThan(0);
    expect((await api.crewSearch("sneha")).items[0]!.emailMasked).toContain("***");
    const inc = await api.crewIncident({
      category: "medical",
      severity: "high",
      description: "Fainted near Lab 204",
    });
    expect(inc.incident.emergency).toBe(true);
    expect(inc.emergencyContacts.length).toBeGreaterThan(0);
  });

  it("streams chat answers with citations", async () => {
    const chunks = [];
    for await (const c of api.chat({ message: "Do I get an OD letter?" })) chunks.push(c);
    const done = chunks.at(-1)!;
    expect(done.type).toBe("done");
    if (done.type === "done") expect(done.result.answer.citations.length).toBeGreaterThan(0);
  });

  it("has no stream URL in mock mode", () => {
    expect(api.streamUrl("publicStatusStream", { slug })).toBeNull();
  });
});

describe("api client, real mode", () => {
  it("builds paths and encodes params", () => {
    expect(buildPath("/api/public/events/:slug/speaker/:token", { slug: "a b", token: "t/1" })).toBe(
      "/api/public/events/a%20b/speaker/t%2F1",
    );
    expect(() => buildPath("/api/verify/:certId", {})).toThrow(/certId/);
  });

  it("sends validated JSON and parses the response", async () => {
    const seen: { url?: string; init?: RequestInit } = {};
    const api = createApiClient({
      mock: false,
      baseUrl: "http://x",
      fetch: jsonFetch(200, { sent: true, resendAfterSeconds: 30 }, seen),
    });
    const r = await api.otpRequest(slug, { email: "a@b.in" });
    expect(r.resendAfterSeconds).toBe(30);
    expect(seen.url).toBe("http://x/api/public/events/hacknova-2026/otp/request");
    expect(seen.init?.method).toBe("POST");
    expect(JSON.parse(String(seen.init?.body))).toEqual({ email: "a@b.in" });
  });

  it("rejects an invalid request body before sending", async () => {
    let called = false;
    const api = createApiClient({
      mock: false,
      fetch: (async () => ((called = true), new Response("{}"))) as unknown as typeof fetch,
    });
    await expect(api.otpVerify(slug, { email: "a@b.in", code: "12" })).rejects.toThrow();
    expect(called).toBe(false);
  });

  it("fails loudly when the server breaks the contract", async () => {
    const api = createApiClient({ mock: false, fetch: jsonFetch(200, { sent: "yes" }) });
    await expect(api.otpRequest(slug, { email: "a@b.in" })).rejects.toMatchObject({
      code: "invalid_response",
    });
  });

  it("turns error bodies into ApiClientError", async () => {
    const api = createApiClient({
      mock: false,
      fetch: jsonFetch(429, {
        error: { code: "rate_limited", message: "Too many codes", retryAfterSeconds: 60 },
      }),
    });
    const err = await api.otpRequest(slug, { email: "a@b.in" }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err).toMatchObject({ status: 429, code: "rate_limited", retryAfterSeconds: 60 });
  });

  it("parses the newline-delimited chat stream across chunk boundaries", async () => {
    const lines = [
      JSON.stringify({ type: "delta", text: "Lunch is " }),
      JSON.stringify({ type: "delta", text: "at 12:30." }),
      JSON.stringify({ type: "done", result: fixtures.api.chatAnswered() }),
    ].join("\n");
    const bytes = new TextEncoder().encode(lines);
    const stream = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, 17));
        c.enqueue(bytes.slice(17, 60));
        c.enqueue(bytes.slice(60));
        c.close();
      },
    });
    const api = createApiClient({
      mock: false,
      fetch: (async () => new Response(stream, { status: 200 })) as typeof fetch,
    });
    const out = [];
    for await (const c of api.chat({ message: "where is lunch" })) out.push(c.type);
    expect(out).toEqual(["delta", "delta", "done"]);
  });
});
