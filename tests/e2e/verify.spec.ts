import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { fixtures } from "@/contracts/fixtures";
import { collectErrors } from "./helpers";

const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];
const VALID = fixtures.certificate().id;
const REVOKED = fixtures.certificate(true).id;

for (const scheme of ["light", "dark"] as const) {
  for (const [label, id] of [
    ["valid", VALID],
    ["revoked", REVOKED],
    ["unknown", "no-such-certificate"],
  ] as const) {
    test(`${label} certificate in ${scheme} is accessible and fits the screen`, async ({ page }) => {
      await page.emulateMedia({ colorScheme: scheme });
      const errors = collectErrors(page);
      await page.goto(`/verify/${id}`);
      await expect(page.getByRole("heading", { level: 1, name: "Certificate check" })).toBeVisible();
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

test("a valid certificate shows what it certifies and nothing more", async ({ page }) => {
  await page.goto(`/verify/${VALID}`);
  const result = page.getByRole("region", { name: "Valid certificate" });
  await expect(result).toHaveAttribute("data-state", "valid");
  await expect(result).toContainText("Sneha Reddy");
  await expect(result).toContainText("Certificate of Participation");
  await expect(result).toContainText("HackNova 2026");
  await expect(result).toContainText("Deccan Institute of Engineering and Technology");
  await expect(result).not.toContainText("@");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});

test("a revoked certificate says so clearly", async ({ page }) => {
  await page.goto(`/verify/${REVOKED}`);
  const result = page.getByRole("region", { name: "Revoked certificate" });
  await expect(result).toHaveAttribute("data-state", "revoked");
  await expect(result).toContainText("It is no longer valid.");
});

test("an unknown id explains what to check", async ({ page }) => {
  await page.goto("/verify/no-such-certificate");
  await expect(page.getByRole("heading", { name: "No certificate found" })).toBeVisible();
  await expect(page.getByText("no-such-certificate")).toBeVisible();
});
