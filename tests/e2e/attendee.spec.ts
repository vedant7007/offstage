import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { collectErrors } from "./helpers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

async function signInAsSneha(page: Page) {
  await page.goto("/login?next=/me");
  await page.getByRole("button", { name: "Sneha, attendee" }).click();
  await page.waitForURL("**/me", { timeout: 20_000 });
}

test("the portal asks people who are not signed in to sign in first", async ({ page }) => {
  await page.goto("/me");
  await page.waitForURL(/\/login\?next=%2Fme|\/login\?next=\/me/);
  await expect(page.getByRole("heading", { level: 1, name: "Sign in" })).toBeVisible();
  await expectAccessible(page);
});

test("the seeded attendee sees her ticket and can show it full screen", async ({ page }) => {
  const errors = collectErrors(page);
  await signInAsSneha(page);
  await expect(page.getByRole("heading", { level: 1, name: "Your ticket" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Ticket for Sneha Reddy" })).toBeVisible();
  await expect(page.getByText(/Checked in at|Not checked in yet/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Ticket" }).first()).toHaveAttribute("aria-current", "page");
  await expectAccessible(page);

  const open = page.getByRole("button", { name: "Show to volunteer" });
  await open.click();
  const full = page.getByRole("dialog", { name: "Ticket for Sneha Reddy" });
  await expect(full).toBeVisible();
  await expect(full.getByRole("button", { name: "Close" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(full).toBeHidden();
  await expect(open).toBeFocused();
  expect(errors).toEqual([]);
});

test("the schedule lists her sessions and the whole event", async ({ page }) => {
  await signInAsSneha(page);
  await page.getByRole("link", { name: "Schedule" }).first().click();
  await page.waitForURL("**/me/schedule");
  await expect(page.getByRole("heading", { level: 1, name: "Schedule" })).toBeVisible();
  await expect(page.getByText("Workshop: Fine-tuning small language models").first()).toBeVisible();
  await expect(page.getByRole("switch", { name: /Remind me 15 minutes/ })).toBeVisible();
  await page.getByRole("tab", { name: "All sessions" }).click();
  await expect(page.getByText("Serverless on a student budget")).toBeVisible();
  await expectAccessible(page);
});

test("sign-in never redirects to another site", async ({ page }) => {
  await page.goto("/login?next=//evil.example");
  await page.getByRole("button", { name: "Sneha, attendee" }).click();
  await page.waitForURL("**/me", { timeout: 20_000 });
  expect(new URL(page.url()).host).toBe(new URL(page.url()).host);
  expect(page.url()).toMatch(/\/me$/);
});
