import { expect, test, type APIRequestContext } from "@playwright/test";
import { fixtures } from "../../src/contracts/fixtures";

/**
 * API flows for sign-in and access control. Needs the seeded database (pnpm demo:reset),
 * Mailpit, and a server with DEMO_MODE=true. Runs once, in the desktop project.
 */
const MAILPIT = process.env.MAILPIT_URL ?? "http://localhost:8025";
const world = fixtures.eventFull();
const sneha = world.registrations[0]!;
const someoneElse = world.registrations.find((r) => r.status === "confirmed" && !r.userId)!;

test.beforeEach(({}, info) => {
  test.skip(info.project.name !== "desktop", "API tests run once");
});

async function latestCode(request: APIRequestContext, email: string, after: number): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const res = await request.get(
      `${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:${email}`)}&limit=5`,
    );
    const body = (await res.json()) as { messages: { ID: string; Subject: string; Created: string }[] };
    const msg = body.messages.find((m) => new Date(m.Created).getTime() >= after - 2000);
    const code = msg?.Subject.match(/^(\d{6}) is your/)?.[1];
    if (code) return code;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`No OTP email for ${email} in Mailpit`);
}

async function becomePersona(request: APIRequestContext, persona: string) {
  const res = await request.post("/api/demo/switch-persona", { data: { persona } });
  expect(res.status(), await res.text()).toBe(200);
  return res.json();
}

test("OTP sign-in end to end through Mailpit", async ({ request }) => {
  const email = `e2e${Date.now()}@sutradhar.test`;
  const started = Date.now();
  const send = await request.post("/api/auth/email-otp/send-verification-otp", {
    data: { email, type: "sign-in" },
    headers: { "x-turnstile-token": "e2e" },
  });
  if (send.status() === 400 && (await send.text()).includes("turnstile_failed")) {
    test.skip(true, "This server has real Turnstile keys; run with TURNSTILE_SECRET_KEY empty");
  }
  expect(send.status(), await send.text()).toBe(200);

  const code = await latestCode(request, email, started);
  const wrong = await request.post("/api/auth/sign-in/email-otp", {
    data: { email, otp: code === "000000" ? "111111" : "000000" },
  });
  expect(wrong.ok()).toBe(false);

  const signIn = await request.post("/api/auth/sign-in/email-otp", { data: { email, otp: code } });
  expect(signIn.status(), await signIn.text()).toBe(200);

  const me = await request.get("/api/me");
  expect(me.status()).toBe(200);
  expect((await me.json()).user.email).toBe(email);
});

test("an attendee reads their own registration and gets 403 for anyone else's", async ({ request }) => {
  await becomePersona(request, "attendee");
  const own = await request.get(`/api/events/${world.event.id}/registrations/${sneha.id}`);
  expect(own.status()).toBe(200);
  expect((await own.json()).registration.email).toBe("sneha@sutradhar.test");

  const other = await request.get(`/api/events/${world.event.id}/registrations/${someoneElse.id}`);
  expect(other.status()).toBe(403);
  expect((await other.json()).error.code).toBe("forbidden");

  const mine = await request.get("/api/me/registration");
  expect((await mine.json()).registration.id).toBe(sneha.id);
});

test("volunteers and viewers cannot open full registrations", async ({ request }) => {
  for (const persona of ["volunteer", "viewer"]) {
    await becomePersona(request, persona);
    const res = await request.get(`/api/events/${world.event.id}/registrations/${sneha.id}`);
    expect(res.status(), persona).toBe(403);
  }
});

test("staff can, and nobody reaches another event through the path", async ({ request }) => {
  await becomePersona(request, "owner");
  expect((await request.get(`/api/events/${world.event.id}/registrations/${someoneElse.id}`)).status()).toBe(
    200,
  );
  await becomePersona(request, "attendee");
  const charity = fixtures.charityDrive();
  const res = await request.get(
    `/api/events/${charity.event.id}/registrations/${charity.registrations[1]!.id}`,
  );
  expect(res.status()).toBe(403);
});

test("requests without a session get 401", async ({ playwright, baseURL }) => {
  const anon = await playwright.request.newContext({ baseURL });
  expect((await anon.get("/api/me")).status()).toBe(401);
  expect((await anon.get(`/api/events/${world.event.id}/registrations/${sneha.id}`)).status()).toBe(401);
  await anon.dispose();
});
