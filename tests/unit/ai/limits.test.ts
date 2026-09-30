import { describe, expect, it } from "vitest";
import { Bucket, parseReset } from "../../../src/ai/router/bucket";
import { withAgentSlot } from "../../../src/ai/router/budget";

describe("parseReset", () => {
  it("reads Groq reset durations", () => {
    expect(parseReset("2m59.56s")).toBeCloseTo(179_560);
    expect(parseReset("7.66s")).toBeCloseTo(7_660);
    expect(parseReset("120ms")).toBe(120);
    expect(parseReset("1h2m3s")).toBe(3_723_000);
    expect(parseReset("")).toBeUndefined();
  });
});

describe("Bucket", () => {
  const t0 = Date.UTC(2026, 9, 24, 10);

  it("enforces tokens per minute and frees them after 60s", () => {
    const b = new Bucket({ rpm: 30, tpm: 8000, tpd: 200_000 });
    b.take(7000, t0);
    expect(b.canTake(2000, t0 + 1000)).toBe(false);
    expect(b.canTake(2000, t0 + 61_000)).toBe(true);
  });

  it("settles the estimate to the real count", () => {
    const b = new Bucket({ rpm: 30, tpm: 8000, tpd: 200_000 });
    b.take(7000, t0)(500);
    expect(b.canTake(7000, t0 + 1000)).toBe(true);
  });

  it("enforces requests per minute and tokens per day", () => {
    const b = new Bucket({ rpm: 2, tpm: 1e9, tpd: 1000 });
    b.take(400, t0);
    b.take(400, t0);
    expect(b.canTake(1, t0)).toBe(false); // rpm
    expect(b.canTake(300, t0 + 61_000)).toBe(false); // tpd
    expect(b.canTake(300, Date.UTC(2026, 9, 25, 0, 1))).toBe(true); // next UTC day
  });

  it("trusts Groq headers until their reset time", () => {
    const b = new Bucket({ rpm: 30, tpm: 8000, tpd: 200_000 });
    b.sync({ "x-ratelimit-remaining-tokens": "100", "x-ratelimit-reset-tokens": "5s" }, t0);
    expect(b.canTake(500, t0 + 1000)).toBe(false);
    expect(b.canTake(500, t0 + 6000)).toBe(true);
    b.sync({ "x-ratelimit-remaining-requests": "0", "x-ratelimit-reset-requests": "10m" }, t0);
    expect(b.canTake(1, t0 + 1000)).toBe(false);
  });
});

describe("withAgentSlot", () => {
  it("never runs more than 2 at once per agent", async () => {
    let live = 0;
    let peak = 0;
    const job = () =>
      withAgentSlot("helpdesk", async () => {
        peak = Math.max(peak, ++live);
        await new Promise((r) => setTimeout(r, 5));
        live--;
      });
    await Promise.all(Array.from({ length: 6 }, job));
    expect(peak).toBe(2);
  });
});
