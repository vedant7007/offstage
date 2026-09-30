import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function collectConsoleErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));
  return errors;
}

async function seriousViolations(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  return results.violations
    .filter((v) => v.impact === "serious" || v.impact === "critical")
    .map((v) => ({ id: v.id, impact: v.impact, help: v.help, targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")) }));
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`/design in ${scheme}`, () => {
    test.use({ colorScheme: scheme });

    test("renders with no console errors and no serious accessibility violations", async ({ page }) => {
      const errors = collectConsoleErrors(page);
      await page.goto("/design");
      await expect(page.getByRole("heading", { level: 1, name: "Design system" })).toBeVisible();
      await expect(page.locator("html")).toHaveClass(new RegExp(`\\b${scheme}\\b`));

      expect(await seriousViolations(page)).toEqual([]);
      expect(errors).toEqual([]);
    });
  });
}

test("every focus stop is visible and shows a focus indicator", async ({ page }) => {
  await page.goto("/design");
  await page.getByRole("heading", { level: 1 }).waitFor();

  const stops: string[] = [];
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) return null;
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      const indicator = style.outlineStyle !== "none" && parseFloat(style.outlineWidth) >= 2;
      const labelled = (el as HTMLInputElement).labels?.[0]?.textContent;
      const name = el.getAttribute("aria-label") ?? labelled ?? el.textContent?.trim().slice(0, 40) ?? el.tagName;
      return { name, visible: rect.width > 0 && rect.height > 0, indicator };
    });
    if (!stop) continue;
    expect.soft(stop.visible, `focus stop "${stop.name}" should be visible`).toBe(true);
    expect.soft(stop.indicator, `focus stop "${stop.name}" should show an outline`).toBe(true);
    stops.push(stop.name);
  }
  // The first stops follow reading order: header controls, then the width picker.
  expect(stops.slice(0, 4)).toEqual(["Language", "Switch to dark theme", "Full width", "Phone, 360 px"]);
  expect(stops.length).toBeGreaterThan(20);
});

test("dialog traps focus, closes on Escape and returns focus to its trigger", async ({ page }) => {
  await page.goto("/design");
  const trigger = page.getByRole("button", { name: "Open dialog" });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const dialog = page.getByRole("dialog", { name: "Approve this change?" });
  await expect(dialog).toBeVisible();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((d) => d.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test("theme toggle switches between paper and ink", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/design");
  const html = page.locator("html");
  await expect(html).toHaveClass(/\blight\b/);
  await page.getByRole("button", { name: "Switch to dark theme" }).first().click();
  await expect(html).toHaveClass(/\bdark\b/);
});

test("language switch re-renders shared strings in Hindi and Hinglish", async ({ page, context }) => {
  await page.goto("/design");
  const badges = page.locator('[data-slot="status-badge"][data-status="pending"]').first();
  await expect(badges).toHaveText("Pending");

  await page.getByLabel("Language").selectOption("hi");
  await expect(badges).toHaveText("बाकी");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi");

  await page.getByLabel("भाषा").selectOption("hinglish");
  await expect(page.locator("html")).toHaveAttribute("lang", "hi-Latn");
  await expect(page.locator('[data-slot="status-badge"][data-status="executed"]').first()).toHaveText("Ho gaya");

  await context.clearCookies();
});

test("impact counts use the singular for one", async ({ page }) => {
  await page.goto("/design");
  const composites = page.locator('section[aria-labelledby="composites-title"]');
  await expect(composites.getByText("1 session", { exact: true }).first()).toBeVisible();
  await expect(composites.getByText("1 sessions", { exact: true })).toHaveCount(0);
});

test("citation chip opens the source snippet", async ({ page }) => {
  await page.goto("/design");
  await page.getByRole("button", { name: /Source: Rulebook, 4.2 Team size/ }).click();
  const sheet = page.getByRole("dialog", { name: "Rulebook" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Teams have 2 to 4 members");
});
