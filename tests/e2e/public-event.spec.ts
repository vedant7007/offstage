import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const EVENT = "/e/hacknova-2026";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const scheme of ["light", "dark"] as const) {
  test(`event page in ${scheme}: accessible, no errors, fits the screen`, async ({ page }) => {
    await page.emulateMedia({ colorScheme: scheme });
    const errors: string[] = [];
    page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
    page.on("pageerror", (err) => errors.push(err.message));
    await page.goto(EVENT);
    await expect(page.getByRole("heading", { level: 1, name: "HackNova 2026" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
    const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
      page.viewportSize()?.width ?? Infinity,
    );
    expect(errors).toEqual([]);
  });
}

test("shows capacity honestly and offers the waitlist when full", async ({ page }) => {
  await page.goto(EVENT);
  await expect(page.getByText("320 of 320 seats taken")).toBeVisible();
  await expect(page.getByRole("link", { name: "Join the waitlist" })).toHaveAttribute(
    "href",
    "/e/hacknova-2026/register",
  );
  await expect(page.getByText("This is the seeded demo event.", { exact: false })).toBeVisible();
});

test("drafted announcements carry the drafted-by label", async ({ page }) => {
  await page.goto(EVENT);
  const updates = page.getByRole("region", { name: "Live updates" });
  await expect(
    updates.getByText("Drafted by Sutradhar, approved by", { exact: false }).first(),
  ).toBeVisible();
});

test("day and track filters narrow the schedule", async ({ page }) => {
  await page.goto(EVENT);
  const schedule = page.locator("#schedule");
  await expect(schedule.getByRole("heading", { name: "Opening keynote: Building for Bharat" })).toBeVisible();

  // Filters are real navigations; wait for each new URL before checking the result.
  await schedule.getByRole("link", { name: "Sun, 25 Oct" }).click();
  await page.waitForURL(/day=2026-10-25/, { timeout: 15_000 });
  await expect(schedule.getByRole("heading", { name: "Voice AI in Indian languages" })).toBeVisible();
  await expect(schedule.getByRole("link", { name: "Sun, 25 Oct" })).toHaveAttribute("aria-current", "true");

  await schedule.getByRole("link", { name: "Hardware and IoT" }).click();
  await page.waitForURL(/track=/, { timeout: 15_000 });
  const cards = schedule.locator("article");
  await expect(cards).toHaveCount(1);
  await expect(cards.first()).toContainText("Workshop: Sensors and TinyML");
});

test.describe("with JavaScript turned off", () => {
  test.use({ javaScriptEnabled: false });
  test("the schedule, filters and FAQ still work", async ({ page }) => {
    await page.goto(EVENT);
    const schedule = page.locator("#schedule");
    await expect(schedule.locator("article")).toHaveCount(10);
    await schedule.getByRole("link", { name: "Sun, 25 Oct" }).click();
    await expect(schedule.locator("article")).toHaveCount(6);
    await page.getByText("Where is lunch?").click();
    await expect(page.getByText("Lunch is served from 12:30")).toBeVisible();
  });
});

test("an unknown event shows a friendly not found page", async ({ page }) => {
  const res = await page.goto("/e/no-such-event");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("We could not find that event").first()).toBeVisible();
});
