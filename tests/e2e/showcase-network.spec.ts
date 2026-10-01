import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * The showcase must make zero third-party calls. Every request any page makes (fetch, scripts,
 * images, fonts, workers, websockets) is recorded and must go to the site's own origin or a
 * static font host. Run with `pnpm test:showcase-net` against a NEXT_PUBLIC_SHOWCASE=1 build.
 */

const ALLOWED_HOSTS = new Set(["fonts.googleapis.com", "fonts.gstatic.com"]);
// The recorded HackNova event (src/showcase/fixtures/world.json).
const EVENT_ID = "e0c3665e-6f00-40a7-a855-15febc33cc89";
const SLUG = "hacknova-2026";

function recordForeignRequests(context: BrowserContext, origin: string): string[] {
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

let foreign: string[] = [];

test.beforeEach(async ({ context, page: _page, baseURL }) => {
  foreign = recordForeignRequests(context, baseURL!);
});

test.afterEach(async ({ page }) => {
  // Let late requests (lazy chunks, polling, analytics a page might add) fire before judging.
  await page.waitForTimeout(1500);
  expect(foreign, "requests to hosts other than this site and the font hosts").toEqual([]);
});

const SCREENS: Array<[name: string, path: string]> = [
  ["landing", "/"],
  ["login persona chooser", "/login"],
  ["console home", "/console"],
  ["live stage", `/console/${EVENT_ID}`],
  ["approvals", `/console/${EVENT_ID}/approvals`],
  ["attendee portal", "/me"],
  ["crew app", "/crew"],
  ["public event page", `/e/${SLUG}`],
];

for (const [name, path] of SCREENS) {
  test(`${name} (${path}) calls no third-party host`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "load" });
    // Screen check: the page itself must render, not redirect away or fail.
    expect(res?.status(), `${path} status`).toBeLessThan(400);
    expect(new URL(page.url()).pathname, `${path} should not redirect`).toBe(path);
    // Scroll once so lazy, in-view content loads too.
    await page.mouse.wheel(0, 4000);
  });
}

test("a scenario trigger calls no third-party host", async ({ page }) => {
  await page.goto(`/console/${EVENT_ID}`, { waitUntil: "load" });
  const trigger = page.getByRole("button", { name: /speaker|trigger|scenario|simulate/i }).first();
  test.skip(!(await trigger.isVisible().catch(() => false)), "no scenario trigger on the live stage yet");
  await trigger.click();
  // Give the replayed scenario time to stream its first phase.
  await page.waitForTimeout(5000);
});
