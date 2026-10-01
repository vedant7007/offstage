// pnpm voice:test [case ids...]: every voice test case through the real browser pipeline. Chrome's fake microphone
// plays tests/voice/audio/<id>.wav (make it with pnpm voice:audio), the dock records it with its VAD, transcribes,
// runs the turn and speaks the reply with Murf. Prints intent, reply, pass or fail and end-of-speech-to-first-audio.
// Needs the app on BASE_URL (default http://localhost:3000) in demo mode with the worker running.
// Run `pnpm demo:reset` first: the cases expect the seeded world (speaker_cancel before "Approve it.").

import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { CASES } from "./cases";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
const only = process.argv.slice(2);
const cases = only.length ? CASES.filter((c) => only.includes(c.id)) : CASES;

const login = await fetch(`${BASE}/api/demo/switch-persona`, {
  method: "POST",
  headers: { "content-type": "application/json", origin: BASE },
  body: JSON.stringify({ persona: "owner" }),
});
const me = (await login.json()) as { memberships?: { eventId: string; eventSlug: string }[] };
const eventId = me.memberships?.find((m) => m.eventSlug === "hacknova-2026")?.eventId;
if (!eventId) throw new Error("Sign-in failed or HackNova is not seeded (pnpm demo:reset)");

type Row = {
  id: string;
  pass: boolean;
  intent: string;
  latencyMs: number | null;
  heard: string;
  reply: string;
  why: string;
};
const rows: Row[] = [];
for (const c of cases) {
  const wav = fileURLToPath(new URL(`audio/${c.id}.wav`, import.meta.url));
  const browser = await chromium.launch({
    args: [
      "--use-fake-ui-for-media-stream",
      "--use-fake-device-for-media-stream",
      `--use-file-for-fake-audio-capture=${wav}%noloop`,
      "--autoplay-policy=no-user-gesture-required",
    ],
  });
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    permissions: ["microphone"],
  });
  const page = await ctx.newPage();
  const logs: string[] = [];
  page.on("console", (m) => logs.push(m.text()));
  await page.request.post(`${BASE}/api/demo/switch-persona`, { data: { persona: "owner" } });
  await page.goto(`${BASE}/console/${eventId}`, { waitUntil: "domcontentloaded", timeout: 180_000 });
  // CSS, not role: an open approval dialog hides the rest of the page from the accessibility tree.
  const dock = page.locator('section[aria-label="Voice Commander"]');
  await dock.waitFor({ timeout: 180_000 });
  await page.waitForTimeout(1500);
  const state = dock.locator("[aria-live=polite]").first();
  // Click until the page is hydrated and the mic is really listening.
  for (let i = 0; i < 20; i++) {
    await dock.getByRole("button", { name: "Talk to Offstage" }).click();
    await page.waitForTimeout(500);
    if (/Listening|Hearing|Thinking/.test(await state.innerText().catch(() => ""))) break;
  }
  await dock.getByRole("button", { name: /Show the voice panel/ }).click();
  // Wait for the reply to be spoken and the dock to settle back to Ready.
  const deadline = Date.now() + (c.wait ?? 25) * 1000 + 10_000;
  let spoke = false;
  while (Date.now() < deadline) {
    const s = (await state.innerText().catch(() => "")).trim();
    if (s === "Speaking") spoke = true;
    if (spoke && (s === "Ready" || s === "Listening")) break;
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(500);
  const turn = dock.locator('ol[aria-label="Voice transcript"] > li').first();
  const text = (await turn.innerText().catch(() => "")).replace(/\s+/g, " ");
  // The dock writes the intent on the transcript row; a failed turn shows an alert in the dock.
  const intent = (await turn.getAttribute("data-intent", { timeout: 2000 }).catch(() => null)) ?? "";
  const alert = (
    await dock
      .locator("[data-variant=warning], [data-variant=danger]")
      .first()
      .innerText({ timeout: 500 })
      .catch(() => "")
  ).trim();
  const latency = logs.map((l) => /end of speech to first audio: (\d+) ms/.exec(l)?.[1]).find(Boolean);
  const heard = /You: (.*?) Offstage:/.exec(text)?.[1] ?? "";
  const reply = text.split("Offstage: ").slice(1).join(" ");
  const why: string[] = [];
  if (!spoke) why.push("never spoke");
  if (alert) why.push(`dock alert: ${alert.slice(0, 80)}`);
  if (!(Array.isArray(c.intent) ? c.intent : [c.intent]).includes(intent))
    why.push(`intent ${intent || "none"}`);
  for (const re of c.reply) if (!re.test(reply)) why.push(`missing ${re}`);
  for (const re of c.never ?? []) if (re.test(reply)) why.push(`said ${re}`);
  if (c.opens && !(page.url().includes("/approvals/") || (await page.getByRole("dialog").count()) > 0))
    why.push("no approval card");
  if (why.length) {
    await mkdir(new URL("results/", import.meta.url), { recursive: true });
    await page.screenshot({ path: fileURLToPath(new URL(`results/${c.id}.png`, import.meta.url)) });
    await writeFile(new URL(`results/${c.id}.log`, import.meta.url), logs.join("\n"));
  }
  rows.push({
    id: c.id,
    pass: !why.length,
    intent,
    latencyMs: latency ? Number(latency) : null,
    heard,
    reply: reply.slice(0, 160),
    why: why.join("; "),
  });
  console.log(
    `${why.length ? "FAIL" : "pass"} ${c.id.padEnd(15)} ${String(latency ?? "-").padStart(5)} ms  heard "${heard}"  ${why.join("; ")}`,
  );
  await browser.close();
}

const lat = rows
  .map((r) => r.latencyMs)
  .filter((x): x is number => x !== null)
  .sort((a, b) => a - b);
const median = lat.length ? lat[Math.floor(lat.length / 2)] : null;
console.log(
  `\n${rows.filter((r) => r.pass).length}/${rows.length} passed. End of speech to first audio: median ${median} ms, min ${lat[0]} ms, max ${lat.at(-1)} ms.`,
);
await mkdir(new URL("results/", import.meta.url), { recursive: true });
await writeFile(
  new URL("results/latest.json", import.meta.url),
  JSON.stringify({ at: new Date().toISOString(), median, rows }, null, 2),
);
process.exit(rows.every((r) => r.pass) ? 0 : 1);
