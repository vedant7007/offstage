/**
 * Records the README hero media from the hosted showcase: the keynote-cancel crisis from the
 * persona picker to the phones buzzing, paced for a human viewer. Writes docs/assets/offstage-demo.mp4,
 * docs/assets/offstage-demo.gif (a sped-up highlight loop) and docs/assets/social-preview.png (1280x640,
 * the landing hero shot at 1440x720 and scaled). Needs ffmpeg on PATH and a Playwright Chromium.
 *
 *   SHOWCASE_URL=https://offstage-live.vercel.app pnpm tsx scripts/showcase/record-demo.ts
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium, expect, type Locator, type Page } from "@playwright/test";
import { EVENT_ID } from "../../tests/e2e/showcase-policy";

const BASE = (process.env.SHOWCASE_URL ?? "https://offstage-live.vercel.app").replace(/\/$/, "");
const OUT = path.resolve("docs/assets");
const SIZE = { width: 1440, height: 900 };

const pause = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * A visible pointer, since headless video has none. It follows the mouse and survives navigation.
 * Plain JS in a string: tsx would inject helpers into a serialised function that the page lacks.
 */
const CURSOR = `(() => {
  const KEY = "demo.cursor";
  const dot = document.createElement("div");
  dot.style.cssText = "position:fixed;z-index:2147483647;pointer-events:none;width:22px;height:22px;" +
    "margin:-11px 0 0 -11px;border-radius:50%;background:rgba(193,255,0,.85);border:2px solid #0b0b0c;" +
    "box-shadow:0 2px 10px rgba(0,0,0,.45);transition:transform .12s ease-out";
  const place = (x, y) => { dot.style.left = x + "px"; dot.style.top = y + "px"; };
  const saved = (sessionStorage.getItem(KEY) || "720,450").split(",").map(Number);
  place(saved[0], saved[1]);
  // React hydration drops foreign nodes, so put the pointer back whenever it goes.
  setInterval(() => dot.isConnected || document.documentElement.appendChild(dot), 100);
  addEventListener("mousemove", (e) => {
    place(e.clientX, e.clientY);
    sessionStorage.setItem(KEY, e.clientX + "," + e.clientY);
  });
  addEventListener("mousedown", () => (dot.style.transform = "scale(.7)"));
  addEventListener("mouseup", () => (dot.style.transform = ""));
})();`;

/** Centre the target smoothly, glide the pointer onto it, then click. */
async function glideClick(page: Page, target: Locator, settle = 600) {
  await target.evaluate((el) => el.scrollIntoView({ behavior: "smooth", block: "center" }));
  await pause(700);
  const box = (await target.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 30 });
  await pause(settle);
  await target.click();
}

async function scrollTo(page: Page, target: Locator, block: "start" | "center" = "start", hold = 1500) {
  await target.evaluate(
    (el, b) => el.scrollIntoView({ behavior: "smooth", block: b as ScrollLogicalPosition }),
    block,
  );
  await pause(hold);
}

async function record(): Promise<{ webm: string; start: number; marks: Record<string, number> }> {
  const browser = await chromium.launch();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "offstage-demo-"));
  const context = await browser.newContext({
    viewport: SIZE,
    deviceScaleFactor: 1,
    recordVideo: { dir, size: SIZE },
  });
  const t0 = Date.now();
  const marks: Record<string, number> = {};
  const mark = (name: string) => (marks[name] = (Date.now() - t0) / 1000);
  await context.addInitScript(CURSOR);
  const page = await context.newPage();
  const main = page.getByRole("main");

  // 1. Pick the Event head persona.
  await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { name: "Choose who to be" })).toBeVisible();
  const start = (Date.now() - t0) / 1000;
  await pause(1200);
  await glideClick(page, page.getByRole("button", { name: /^Event head/ }), 800);
  await page.waitForURL((u) => u.pathname.endsWith(EVENT_ID));
  await expect(page.getByRole("heading", { name: "Live stage", level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await pause(1000);

  // 2. Trigger the crisis and watch the agents work on the stage.
  mark("trigger");
  await glideClick(page, page.getByRole("button", { name: "Keynote speaker cancels", exact: true }), 700);
  await scrollTo(page, page.locator(".react-flow").first(), "center", 600);
  await expect(page.getByText("Commander woke up (session.cancelled)")).toBeAttached({ timeout: 30_000 });
  await pause(1500);
  // Radar and the running log while the Commander plans.
  await scrollTo(page, page.getByRole("heading", { name: "What Radar is watching" }), "center", 300);
  await expect(
    page.getByText(
      /Commander proposed: Fill the slot and move "Evaluating LLM apps".*T3, waiting for approval/,
    ),
  ).toBeAttached({ timeout: 45_000 });
  mark("proposed");
  await pause(1800);

  // 3. Commander's glass box.
  await scrollTo(page, page.locator(".react-flow").first(), "center", 500);
  await glideClick(page, page.locator('.react-flow__node[data-id="agent:commander"]'), 500);
  const box = page.getByRole("dialog", { name: "Commander" });
  await expect(box.getByText(/Fill the slot and move/).first()).toBeVisible();
  await pause(2800);
  await glideClick(page, box.getByRole("button", { name: "Close" }), 300);
  await pause(500);

  // 4. The T3 plan: ripple, why and evidence.
  await glideClick(page, page.getByRole("link", { name: /^Approvals/ }).first(), 400);
  await page.waitForURL("**/approvals");
  await pause(600);
  await glideClick(page, page.getByRole("link", { name: "Review the plan" }).first(), 500);
  await expect(page.getByText("0 of 2 approvals").first()).toBeVisible();
  mark("plan");
  await pause(1300);
  await scrollTo(page, page.getByRole("heading", { name: "Ripple", level: 2 }), "start", 2800);
  await scrollTo(page, page.getByText("WHY").first(), "center", 1800);

  // 5. Two approvals: owner, then the faculty approver.
  const approve = main.getByRole("button", { name: "Approve", exact: true }).first();
  await glideClick(page, approve, 600);
  await expect(page.getByText("1 of 2 approvals").first()).toBeVisible();
  mark("approve1");
  await pause(1000);
  await glideClick(page, page.getByRole("combobox", { name: "Switch demo persona" }), 400);
  await pause(500);
  await glideClick(page, page.getByRole("option", { name: "Faculty approver" }), 400);
  await expect(page.getByText(/Signed in as Faculty approver/i)).toBeAttached();
  await pause(800);
  await glideClick(page, main.getByRole("button", { name: "Approve", exact: true }).first(), 600);
  await expect(page.getByText("2 of 2 approvals").first()).toBeVisible();
  mark("approve2");
  await pause(1500);

  // 6. The phones in the dock buzz with the new schedule.
  await glideClick(page, page.getByRole("link", { name: "Live stage" }).first(), 300);
  await page.waitForURL((u) => u.pathname.endsWith(EVENT_ID));
  const phones = page
    .getByRole("heading", { name: "See what they see" })
    .locator("xpath=ancestor::section[1]");
  await scrollTo(page, phones, "center", 300);
  await expect(phones.getByText("Cancelled: Keynote: Open source careers").first()).toBeVisible({
    timeout: 45_000,
  });
  await expect(phones.getByText(/Your session moved/).first()).toBeVisible({ timeout: 30_000 });
  mark("phones");
  await scrollTo(page, phones, "center", 4500);
  mark("end");

  const video = page.video()!;
  await context.close();
  await browser.close();
  return { webm: await video.path(), start, marks };
}

async function socialPreview(): Promise<string> {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 720 }, deviceScaleFactor: 2 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await pause(3500); // let the hero entrance settle
  const raw = path.join(os.tmpdir(), "offstage-social-raw.png");
  await page.screenshot({ path: raw });
  await browser.close();
  return raw;
}

const ff = (...args: string[]) =>
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", ...args], { stdio: "inherit" });

const { webm, start, marks } = await record();
console.log("start", start.toFixed(1), "marks", marks);
const end = marks.end!;
fs.mkdirSync(OUT, { recursive: true });
const mp4 = path.join(OUT, "offstage-demo.mp4");
ff(
  "-ss",
  String(start),
  "-to",
  String(end),
  "-i",
  webm,
  "-vf",
  "scale=1280:-2",
  "-c:v",
  "libx264",
  "-crf",
  "28",
  "-preset",
  "slow",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  "-an",
  mp4,
);

// Highlight loop: the trigger through the first approval, played at 2.5x.
const from = marks.trigger! - start;
const to = marks.approve1! - start + 0.5;
const palette = path.join(os.tmpdir(), "offstage-palette.png");
const vf = `setpts=PTS/2.5,fps=10,scale=960:-1:flags=lanczos`;
ff(
  "-ss",
  String(from),
  "-to",
  String(to),
  "-i",
  mp4,
  "-vf",
  `${vf},palettegen=max_colors=128:stats_mode=diff`,
  palette,
);
ff(
  "-ss",
  String(from),
  "-to",
  String(to),
  "-i",
  mp4,
  "-i",
  palette,
  "-lavfi",
  `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=5:diff_mode=rectangle`,
  "-loop",
  "0",
  path.join(OUT, "offstage-demo.gif"),
);

const raw = await socialPreview();
ff("-i", raw, "-vf", "scale=1280:640:flags=lanczos", path.join(OUT, "social-preview.png"));
for (const f of ["offstage-demo.mp4", "offstage-demo.gif", "social-preview.png"])
  console.log(f, (fs.statSync(path.join(OUT, f)).size / 1e6).toFixed(2), "MB");
