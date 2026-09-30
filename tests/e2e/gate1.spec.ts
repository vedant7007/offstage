import { expect, test, type APIRequestContext } from "@playwright/test";

/**
 * Gate 1 against the real backend: register through the public page (OTP from Mailpit), then
 * scan the new ticket at the gate. Needs the seeded database, Mailpit, DEMO_MODE=true and an
 * empty TURNSTILE_SECRET_KEY. Runs once, in the desktop project.
 */
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const SLUG = "raktdaan-2026";

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "Runs once");
});

async function latestCode(request: APIRequestContext, email: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=5`,
    );
    const body = (await res.json()) as { messages: { Subject: string }[] };
    const code = body.messages.map((m) => m.Subject.match(/^(\d{6}) is your/)?.[1]).find(Boolean);
    if (code) return code;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No OTP email for ${email} in Mailpit`);
}

test("register with a real OTP, get a ticket, and check in once", async ({ page, request }) => {
  const email = `gate1.${Date.now()}@sutradhar.test`;
  // The widget cannot pass on localhost; the server has no secret, so any token is accepted.
  await page.route("https://challenges.cloudflare.com/**", (route) =>
    route.fulfill({
      contentType: "text/javascript",
      body: "window.turnstile={render:function(el,o){setTimeout(function(){o.callback('e2e')},0);return 'w1'},remove:function(){}};",
    }),
  );
  await page.goto(`/e/${SLUG}/register`);

  await page.getByLabel("Full name").fill("Gate One Donor");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("College").fill("Deccan Institute of Engineering and Technology");
  await page.getByLabel("Department").fill("CSE");
  await page.getByRole("combobox", { name: /Year of study/ }).click();
  await page.getByRole("option", { name: "Year 2" }).click();
  await page.getByLabel("Section").fill("A");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("button", { name: "Continue" }).click();

  await page.getByRole("radio", { name: "Vegetarian", exact: true }).check();
  await page.getByRole("radio", { name: "I am 18 or older" }).check();
  await page.getByRole("checkbox", { name: /I have read how my details are used/ }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  const sent = page.getByText(`We sent a 6-digit code to ${email}.`);
  await expect(sent).toBeVisible();
  const problem = page.getByRole("alert");
  if (await problem.filter({ hasText: /human/i }).count())
    test.skip(true, "This server has real Turnstile keys; run with TURNSTILE_SECRET_KEY empty");

  await page.getByLabel("6-digit code").fill(await latestCode(request, email));
  await page.getByRole("button", { name: "Verify and register" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "You are registered" })).toBeVisible();
  await expect(page.getByRole("img", { name: "Ticket for Gate One Donor" })).toBeVisible();

  // The page's session cookie now belongs to the new attendee.
  const mine = await page.request.get("/api/me/ticket");
  expect(mine.status(), await mine.text()).toBe(200);
  const { ticket } = (await mine.json()) as { ticket: { token: string } };
  const [ticketPayload, signature] = ticket.token.split(".");

  // Staff at the gate: first scan wins, the second is a duplicate, a resend is idempotent.
  const staff = await request.post("/api/demo/switch-persona", {
    data: { persona: "owner", eventSlug: SLUG },
  });
  expect(staff.status(), await staff.text()).toBe(200);
  const scan = (clientId: string) =>
    request.post("/api/crew/checkins", {
      data: { ticketPayload, signature, deviceTime: new Date().toISOString(), clientId },
    });
  const id = `e2e-${Date.now()}`;
  expect((await (await scan(id)).json()).status).toBe("checked_in");
  const dup = await (await scan(`${id}-2`)).json();
  expect(dup.status).toBe("duplicate");
  expect(dup.original.scannerName).toBeTruthy();

  const sync = await request.post("/api/crew/checkins/sync", {
    data: {
      scans: [
        { ticketPayload, signature, deviceTime: new Date().toISOString(), clientId: id },
        { ticketPayload: "x", signature: "y", deviceTime: new Date().toISOString(), clientId: `${id}-3` },
      ],
    },
  });
  expect((await sync.json()).results.map((r: { status: string }) => r.status)).toEqual([
    "checked_in",
    "invalid",
  ]);

  const after = await page.request.get("/api/me/ticket");
  expect((await after.json()).checkedInAt).toBeTruthy();
});
