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

test("landing tells the story and links to the live demo", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Your event, run offstage.");
  await expect(page.getByRole("link", { name: "Try the live demo" }).first()).toHaveAttribute(
    "href",
    "/login",
  );
  await expect(page.getByRole("link", { name: "How it works" })).toHaveAttribute("href", "#how");
  for (const cue of [
    "The chaos before the show",
    "Enter the Commander",
    "How it works",
    "The crew",
    "The show must go on",
    "Measured during the hackathon",
    "Want OFFSTAGE for your event?",
  ]) {
    await expect(page.getByRole("heading", { level: 2, name: cue })).toBeAttached();
  }
  await expect(page.getByText("14 agents, every one with a human lead.")).toBeAttached();
  await expect(page.getByText("Team MASTICODE: Vedant Idlgave, Abhinav Nakka, V Thanishka")).toBeAttached();
  await expect(page.getByRole("link", { name: "See the attendee side" })).toHaveAttribute(
    "href",
    "/e/hacknova-2026",
  );
  await expect(page.getByRole("link", { name: "Contact us" }).first()).toHaveAttribute(
    "href",
    "mailto:vedantidlgave16@gmail.com?subject=OFFSTAGE%20enquiry",
  );
  await expect(page.getByRole("link", { name: "Demo event" })).toHaveAttribute("href", "/e/hacknova-2026");
  await expect(
    page.getByRole("contentinfo").getByText("Agents propose. Policy decides. Humans approve. Code executes."),
  ).toBeAttached();
});

test("landing with reduced motion shows every cue as still text", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = collectErrors(page);
  await page.goto("/");
  await expect(page.locator("[data-mode='poster']")).toBeAttached();
  await expect(page.getByRole("heading", { level: 2, name: "The crew" })).toBeVisible();
  await expect(page.getByText("Illustrative, from the seeded HackNova demo")).toBeVisible();
  await expect(page.locator("canvas")).toHaveCount(0);
  expect(errors).toEqual([]);
  await context.close();
});

test("about our AI reads in all three languages", async ({ page, context, isMobile }) => {
  // On phones the language switcher lives in the header menu sheet. Wait for the page to re-render
  // in the new language (h1 by tag: the open sheet hides the page from the accessibility tree), then close it.
  const pickLanguage = async (label: string, menu: string, value: string, h1: string) => {
    if (!isMobile) return page.getByLabel(label).selectOption(value);
    await page.getByRole("button", { name: menu }).click();
    await page.getByRole("dialog").getByLabel(label).selectOption(value);
    await expect(page.locator("h1")).toHaveText(h1);
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toBeHidden();
  };
  await page.goto("/about-ai");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("About our AI");
  await expect(page.getByText("Drafted by the OFFSTAGE assistant, approved by Event lead")).toBeVisible();

  await pickLanguage("Language", "Menu", "hi", "हमारे AI के बारे में");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("हमारे AI के बारे में");
  await expect(page.getByRole("heading", { name: "आपातकाल इंसानों तक जाता है" })).toBeVisible();

  await pickLanguage("भाषा", "मेन्यू", "hinglish", "Hamare AI ke baare mein");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Hamare AI ke baare mein");
  await context.clearCookies();
});
