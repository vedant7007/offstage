import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import type { SpeakerFormRequest } from "@/contracts";
import { collectErrors } from "./helpers";

const FORM = "/e/hacknova-2026/speaker/test-token";
const API = "**/api/public/events/hacknova-2026/speaker/test-token";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test("a speaker sends their requirements through the token link", async ({ page }) => {
  const errors = collectErrors(page);
  let sent: SpeakerFormRequest | undefined;
  await page.route(API, async (route) => {
    sent = route.request().postDataJSON();
    await route.fulfill({ json: { ok: true } });
  });
  await page.goto(FORM);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Speaker details for HackNova 2026");
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical")).toEqual([]);

  // The bio must be confirmed before sending.
  await page.getByRole("button", { name: "Send details" }).click();
  await expect(page.getByText("Please confirm your bio to continue.")).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /My bio is correct/ })).toBeFocused();

  await page.getByRole("checkbox", { name: "Projector with HDMI" }).check();
  await page.getByRole("checkbox", { name: "Lapel microphone" }).check();
  await page.getByLabel("Travel").fill("Arriving 23 Oct, 18:40 at RGIA. Pickup please.");
  await page.getByLabel("Your bio").fill("Principal engineer working on speech models for Indian languages.");
  await page.getByRole("checkbox", { name: /My bio is correct/ }).check();
  await page.getByRole("button", { name: "Send details" }).click();

  await expect(page.getByRole("heading", { name: /your details are with the program team/ })).toBeFocused();
  expect(sent).toMatchObject({
    av: ["projector_hdmi", "lapel_mic"],
    travel: "Arriving 23 Oct, 18:40 at RGIA. Pickup please.",
    bioConfirmed: true,
  });
  expect(sent?.stay).toBeUndefined();
  expect(errors).toEqual([]);
});

test("an expired link says how to get a new one", async ({ page }) => {
  await page.route(API, (route) =>
    route.fulfill({ status: 404, json: { error: { code: "not_found", message: "Unknown token" } } }),
  );
  await page.goto(FORM);
  await page.getByRole("checkbox", { name: /My bio is correct/ }).check();
  await page.getByRole("button", { name: "Send details" }).click();
  await expect(page.getByText(/This link has expired or is not valid/)).toBeVisible();
});
