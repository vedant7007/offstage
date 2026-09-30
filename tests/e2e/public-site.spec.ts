import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function check(page: Page, path: string) {
  const errors: string[] = [];
  page.on("console", (msg) => msg.type() === "error" && errors.push(msg.text()));
  page.on("pageerror", (err) => errors.push(err.message));
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

test("landing explains the product and links to the demo and the console", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Tell Sutradhar about your event.");
  await expect(page.getByRole("heading", { name: "The law of the system" })).toBeVisible();
  for (const step of ["Agents propose", "Policy decides", "Humans approve", "Code executes"]) {
    await expect(page.getByRole("listitem").filter({ hasText: step })).toBeVisible();
  }
  await expect(page.getByRole("link", { name: "See the demo event" })).toHaveAttribute(
    "href",
    "/e/hacknova-2026",
  );
  await expect(page.getByRole("link", { name: "Start your event" })).toHaveAttribute("href", "/console");
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
