import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import type { PublicRegisterRequest, PublicRegisterResponse } from "@/contracts";
import { fixtures } from "@/contracts/fixtures";
import { collectErrors } from "./helpers";

const REGISTER = "/e/hacknova-2026/register";
const API = "**/api/public/events/hacknova-2026";
const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

async function expectAccessible(page: Page) {
  const results = await new AxeBuilder({ page }).withTags(WCAG_TAGS).analyze();
  const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
}

/** Mocks the OTP and register endpoints and the Turnstile script. Returns what the client sent. */
async function mockBackend(page: Page) {
  const sent: { otp?: unknown; verify?: unknown; register?: PublicRegisterRequest } = {};
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('test-token')},0);return 'w1'},remove:function(){}};",
    }),
  );
  await page.route(`${API}/otp/request`, async (route) => {
    sent.otp = route.request().postDataJSON();
    await route.fulfill({ json: { sent: true, resendAfterSeconds: 30 } });
  });
  await page.route(`${API}/otp/verify`, async (route) => {
    sent.verify = route.request().postDataJSON();
    await route.fulfill({ json: { verified: true, verificationToken: "verified-token" } });
  });
  await page.route(`${API}/register`, async (route) => {
    sent.register = route.request().postDataJSON();
    const body: PublicRegisterResponse = {
      registrationId: fixtures.registration().id,
      status: "confirmed",
      ticket: fixtures.api.myTicket(),
      duplicateSuspected: false,
    };
    await route.fulfill({ json: body });
  });
  return sent;
}

test("registers on the fixture event, verifies the code and reaches the ticket", async ({ page }) => {
  const errors = collectErrors(page);
  const sent = await mockBackend(page);
  await page.goto(REGISTER);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Register for HackNova 2026");
  await expectAccessible(page);

  // Step 1: details
  await page.getByLabel("Full name").fill("Sneha Reddy");
  await page.getByLabel("Email").fill("sneha@example.edu");
  await page.getByLabel("College").fill("Deccan Institute of Engineering and Technology");
  await page.getByLabel("Department").fill("CSE");
  await page.getByRole("combobox", { name: /Year of study/ }).click();
  await page.getByRole("option", { name: "Year 3" }).click();
  await page.getByLabel("Section").fill("B");
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 2: sessions
  await expect(page.getByRole("heading", { level: 2, name: "Sessions" })).toBeFocused();
  await page.getByRole("checkbox", { name: "Serverless on a student budget" }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 3: preferences and consent
  await expect(page.getByRole("heading", { level: 2, name: "Preferences and consent" })).toBeVisible();
  await expect(page.getByText("90 days after the event", { exact: false })).toBeVisible();
  await page.getByRole("radio", { name: "Vegetarian", exact: true }).check();
  await page.getByRole("radio", { name: "I am 18 or older" }).check();
  await page.getByRole("checkbox", { name: /I have read how my details are used/ }).check();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Continue" }).click();

  // Step 4: the code is sent on arrival; resend waits for the cooldown
  await expect(page.getByText("We sent a 6-digit code to sneha@example.edu.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Send a new code" })).toBeDisabled();
  await expect(page.getByText(/You can ask for a new code in \d+ s/)).toBeVisible();
  await page.getByLabel("6-digit code").fill("123456");
  await page.getByRole("button", { name: "Verify and register" }).click();

  // Ticket
  await expect(page.getByRole("heading", { level: 2, name: "You are registered" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Ticket for Sneha Reddy" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Add to calendar" })).toBeVisible();
  await expect(page.getByRole("link", { name: /Ask the helpdesk/ })).toHaveAttribute("href", "/me/chat");
  await expectAccessible(page);

  expect(sent.verify).toEqual({ email: "sneha@example.edu", code: "123456" });
  expect(sent.register).toMatchObject({
    verificationToken: "verified-token",
    name: "Sneha Reddy",
    email: "sneha@example.edu",
    year: 3,
    section: "B",
    foodPref: "veg",
    adultConfirmed: true,
    guardianConsent: false,
    consentVersion: "2026-09",
  });
  expect(sent.register?.sessionChoices).toHaveLength(1);
  expect(sent.register?.phone).toBeUndefined();
  expect(errors).toEqual([]);
});

test("explains what is missing and moves focus to the first problem", async ({ page }) => {
  await mockBackend(page);
  await page.goto(REGISTER);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Please fix the highlighted fields." }),
  ).toBeVisible();
  await expect(page.getByLabel("Full name")).toBeFocused();
  await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");

  await page.getByLabel("Full name").fill("Ravi");
  await page.getByLabel("Email").fill("not-an-email");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Enter an email like name@college.edu")).toBeVisible();
  await expect(page.getByLabel("Email")).toBeFocused();
});

test("the ticket screen offers a calendar file", async ({ page }) => {
  await mockBackend(page);
  await page.goto(REGISTER);
  await page.getByLabel("Full name").fill("Sneha Reddy");
  await page.getByLabel("Email").fill("sneha@example.edu");
  await page.getByLabel("College").fill("Deccan Institute");
  await page.getByLabel("Department").fill("CSE");
  await page.getByRole("combobox", { name: /Year of study/ }).click();
  await page.getByRole("option", { name: "Year 2" }).click();
  await page.getByLabel("Section").fill("A");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("radio", { name: "Jain" }).check();
  await page.getByRole("radio", { name: /under 18/ }).check();
  await page.getByRole("checkbox", { name: /I have read how my details are used/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByLabel("6-digit code").fill("654321");
  await page.getByRole("button", { name: "Verify and register" }).click();

  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Add to calendar" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("hacknova-2026.ics");
});
