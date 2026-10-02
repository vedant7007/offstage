import { expect, test } from "@playwright/test";
import { EVENT_ID, SLUG, recordForeignRequests } from "./showcase-policy";

/**
 * The showcase must make zero third-party calls. Every request any page makes (fetch, scripts,
 * images, fonts, workers, websockets) is recorded and must go to the site's own origin or a
 * static font host. Run with `pnpm test:showcase-net` against a NEXT_PUBLIC_SHOWCASE=1 build.
 */

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
