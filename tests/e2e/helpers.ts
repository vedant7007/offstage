import type { Page } from "@playwright/test";

// Chrome logs this when the machine's network interfaces change mid-test (Wi-Fi roaming, Docker
// creating a network). It says nothing about the page, so it is the only message ignored.
const ENVIRONMENT_NOISE = [/net::ERR_NETWORK_CHANGED/];

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
