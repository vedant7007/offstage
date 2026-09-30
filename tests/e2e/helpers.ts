import type { Page } from "@playwright/test";

// Messages that say nothing about the page, and the only ones ignored:
// - Chrome, when the machine's network interfaces change mid-test (Wi-Fi roaming, Docker networks).
// - React's development-only performance track marker: an empty styled string, never in production.
const ENVIRONMENT_NOISE = [/net::ERR_NETWORK_CHANGED/, /^%c%d font-size:0;color:transparent/];

/** Collects console errors and uncaught page errors. Assert the returned array is empty. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  const add = (text: string) => {
    if (!ENVIRONMENT_NOISE.some((re) => re.test(text))) errors.push(text);
  };
  page.on("console", (msg) => msg.type() === "error" && add(msg.text()));
  page.on("pageerror", (err) => add(err.message));
  return errors;
}

/** Waits until the page's pathname is exactly `path` (a glob would also match "?next=/path"). */
export async function waitForPath(page: Page, path: string, timeout = 20_000) {
  await page.waitForURL((url) => url.pathname === path, { timeout });
}
