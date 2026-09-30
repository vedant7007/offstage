import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { collectErrors } from "./helpers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function check(page: Page, path: string) {
  const errors = collectErrors(page);
  await page.goto(path);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? Infinity,
  );
  expect(errors).toEqual([]);
}

for (const scheme of ["light", "dark"] as const) {
  test.describe(`public site in ${scheme}`, () => {
    test.use({ colorScheme: scheme });
    test("landing is accessible and fits the screen", async ({ page }) => check(page, "/"));
    test("about our AI is accessible and fits the screen", async ({ page }) => check(page, "/about-ai"));
  });
}

test("landing tells the story in eleven cues and links to the live demo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("OFFSTAGE");
  await expect(page.getByRole("link", { name: "Enter live demo" })).toHaveAttribute("href", "/console");
  for (const cue of ["14 AI agents.", "The agents propose.", "The rule.", "The show goes on."]) {
    await expect(
      page.getByRole("heading", { level: 2, name: new RegExp(cue.replace(".", "\.")) }),
    ).toBeAttached();
  }
  await expect(page.getByRole("link", { name: "Enter the live demo" })).toHaveAttribute("href", "/console");
  await expect(page.getByRole("link", { name: "Demo event" })).toHaveAttribute("href", "/e/hacknova-2026");
  await expect(
    page.getByText("Agents propose. Policy decides. Humans approve. Code executes."),
  ).toBeAttached();
});

test("landing with reduced motion shows every cue as still text", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.locator("[data-mode='poster']")).toBeAttached();
  await expect(page.getByRole("heading", { level: 2, name: /14 AI agents/ })).toBeVisible();
  expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
  await context.close();
});

test("about our AI reads in all three languages", async ({ page, context }) => {
  await page.goto("/about-ai");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("About our AI");
  await expect(page.getByText("Drafted by Sutradhar, approved by Lead")).toBeVisible();

  await page.getByLabel("Language").selectOption("hi");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("हमारे AI के बारे में");
  await expect(page.getByRole("heading", { name: "आपातकाल इंसानों तक जाता है" })).toBeVisible();

  await page.getByLabel("भाषा").selectOption("hinglish");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hamare AI ke baare mein");
  await context.clearCookies();
});
