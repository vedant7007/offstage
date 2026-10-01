import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { installNetworkGuard, isAllowedUrl } from "@/showcase/guard/network";
import { showcaseApiBlock } from "@/showcase/guard/api-block";

const ORIGIN = "https://offstage.example/console";

describe("showcase URL policy", () => {
  it.each([
    "/api/events",
    "https://offstage.example/_next/static/x.js",
    "wss://offstage.example/_next/webpack-hmr",
    "https://fonts.googleapis.com/css2?family=Inter",
    "https://fonts.gstatic.com/s/inter.woff2",
    "data:image/png;base64,AAAA",
    "blob:https://offstage.example/123",
  ])("allows %s", (url) => expect(isAllowedUrl(url, ORIGIN)).toBe(true));

  it.each([
    "https://api.groq.com/openai/v1/chat/completions",
    "https://api.twilio.com/2010-04-01/Accounts",
    "wss://api.deepgram.com/v1/listen",
    "https://offstage.example.evil.com/",
    "http://fonts.gstatic.com/s/inter.woff2",
    "https://challenges.cloudflare.com/turnstile/v0/api.js",
    "http://[bad",
  ])("blocks %s", (url) => expect(isAllowedUrl(url, ORIGIN)).toBe(false));
});

function fakeWindow() {
  class FakeSocket {
    constructor(public url: string) {}
  }
  class FakeXhr {
    opened?: string;
    open(_method: string, url: string) {
      this.opened = url;
    }
  }
  const fetch = vi.fn(async () => new Response("ok"));
  const sendBeacon = vi.fn(() => true);
  const win = {
    location: { href: ORIGIN },
    fetch,
    EventSource: FakeSocket,
    WebSocket: FakeSocket,
    XMLHttpRequest: FakeXhr,
    navigator: { sendBeacon },
  };
  return { win: win as unknown as Window & typeof globalThis, fetch, sendBeacon, FakeXhr };
}

describe("installNetworkGuard", () => {
  it("passes same-origin requests through", async () => {
    const { win, fetch, sendBeacon } = fakeWindow();
    installNetworkGuard(win, false);
    await win.fetch("/api/x");
    expect(fetch).toHaveBeenCalledOnce();
    expect(new win.WebSocket("wss://offstage.example/ws").url).toBe("wss://offstage.example/ws");
    expect(win.navigator.sendBeacon("/beacon")).toBe(true);
    expect(sendBeacon).toHaveBeenCalledOnce();
  });

  it("throws on third-party calls in development", () => {
    const { win, fetch } = fakeWindow();
    installNetworkGuard(win, true);
    expect(() => win.fetch("https://api.groq.com/x")).toThrow(/blocked fetch/);
    expect(() => new win.EventSource("https://evil.example/sse")).toThrow(/blocked EventSource/);
    expect(() => new win.WebSocket("wss://api.deepgram.com/v1/listen")).toThrow(/blocked WebSocket/);
    expect(() => win.navigator.sendBeacon("https://evil.example/b")).toThrow(/blocked sendBeacon/);
    expect(() => new win.XMLHttpRequest().open("GET", "https://evil.example/x")).toThrow(/XMLHttpRequest/);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("blocks and warns once in production", async () => {
    const { win, fetch, sendBeacon } = fakeWindow();
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    installNetworkGuard(win, false);
    await expect(win.fetch(new URL("https://api.twilio.com/x"))).rejects.toThrow(/blocked fetch/);
    expect(win.navigator.sendBeacon("https://evil.example/b")).toBe(false);
    expect(() => new win.WebSocket("wss://evil.example/ws")).toThrow();
    expect(fetch).not.toHaveBeenCalled();
    expect(sendBeacon).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });
});

describe("showcase API block", () => {
  it.each(["/api/auth/sign-in", "/api/agents/voice/transcribe", "/api/events/x/stream", "/api"])(
    "answers %s with a 404 JSON",
    async (path) => {
      const res = showcaseApiBlock(new NextRequest(`https://offstage.example${path}`));
      expect(res?.status).toBe(404);
      expect(await res?.json()).toMatchObject({ error: { code: "not_found" } });
    },
  );

  it("leaves pages alone", () => {
    expect(showcaseApiBlock(new NextRequest("https://offstage.example/console"))).toBeUndefined();
    expect(showcaseApiBlock(new NextRequest("https://offstage.example/apiary"))).toBeUndefined();
  });
});

describe("proxy", () => {
  it("blocks /api only when the showcase flag is on", async () => {
    vi.stubEnv("NEXT_PUBLIC_SHOWCASE", "1");
    const { proxy } = await import("@/proxy");
    expect(proxy(new NextRequest("https://offstage.example/api/events")).status).toBe(404);
    vi.stubEnv("NEXT_PUBLIC_SHOWCASE", "");
    expect(proxy(new NextRequest("https://offstage.example/api/events")).status).toBe(200);
    vi.unstubAllEnvs();
  });
});
