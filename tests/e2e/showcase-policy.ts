import type { BrowserContext, Page } from "@playwright/test";

/** The only hosts a showcase page may reach besides its own origin. */
export const ALLOWED_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
// The recorded HackNova event (src/showcase/fixtures/world.json).
export const EVENT_ID = "e0c3665e-6f00-40a7-a855-15febc33cc89";
export const SLUG = "hacknova-2026";

/** Records every request (fetch, scripts, images, fonts, workers, websockets) that leaves the site. */
export function recordForeignRequests(context: BrowserContext, origin: string): string[] {
  const own = new URL(origin).host;
  const foreign: string[] = [];
  const check = (raw: string) => {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return;
    }
    if (url.protocol === "data:" || url.protocol === "blob:" || url.protocol === "about:") return;
    if (url.host === own || ALLOWED_HOSTS.has(url.hostname)) return;
    foreign.push(raw);
  };
  context.on("request", (req) => check(req.url()));
  const watchSockets = (page: Page) => page.on("websocket", (ws) => check(ws.url()));
  context.pages().forEach(watchSockets);
  context.on("page", watchSockets);
  return foreign;
}
