import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { collectErrors } from "./helpers";

const STATUS = "/e/hacknova-2026/status";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

for (const [label, path] of [
  ["board", STATUS],
  ["projector view", `${STATUS}?kiosk=1`],
] as const) {
  for (const scheme of ["light", "dark"] as const) {
    test(`${label} in ${scheme}: accessible, no errors, fits the screen`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const errors = collectErrors(page);
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1, name: "Live status" })).toBeVisible();
      const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
        page.viewportSize()?.width ?? Infinity,
      );
      expect(errors).toEqual([]);
    });
  }
}

test("shows now and next for every room, with the helpdesk link", async ({ page }) => {
  await page.goto(STATUS);
  for (const room of ["Main Auditorium", "Lab 204", "Lab 101", "Seminar Hall 3"]) {
    await expect(page.getByRole("heading", { name: room })).toBeVisible();
  }
  const lab204 = page.getByRole("article", { name: "Lab 204" });
  await expect(lab204).toContainText("Workshop: Fine-tuning small language models");
  await expect(page.getByRole("status")).toHaveText("Live");
  await expect(page.getByRole("link", { name: "Ask the helpdesk" })).toHaveAttribute("href", "/me/chat");
  await expect(page.getByRole("link", { name: "Projector view" })).toBeVisible();
});

test("projector view has no chrome and prints the helpdesk address", async ({ page }) => {
  await page.goto(`${STATUS}?kiosk=1`);
  await expect(page.getByRole("link", { name: "Back to the event page" })).toHaveCount(0);
  await expect(page.getByLabel("Language")).toHaveCount(0);
  await expect(page.getByText(/Questions\? Ask the helpdesk at .+\/me\/chat/)).toBeVisible();
});

test("refreshes itself without a stream by re-rendering on a timer", async ({ page }) => {
  await page.clock.install();
  await page.goto(STATUS);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const refreshed = page.waitForRequest(
    (req) => req.url().includes("/status") && req.headers()["rsc"] === "1",
  );
  await page.clock.runFor(31_000);
  await refreshed;
});
