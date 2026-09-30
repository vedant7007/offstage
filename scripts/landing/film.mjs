// Landing quality loop, final stage: poster stills, a slow full-scroll video, and a frame-rate
// measurement while scrolling. Needs the dev server (BASE, default http://localhost:3100/).
//   node scripts/landing/film.mjs posters   -> src/components/landing/posters/c00..c10.jpg
//   node scripts/landing/film.mjs fps       -> docs/landing-shots/fps.json (scroll frame rate)
//   node scripts/landing/film.mjs idle      -> idle frame rate at the middle of every chapter
//   node scripts/landing/film.mjs video     -> docs/landing-shots/full-scroll.webm
// Env: BASE (server), QUERY (e.g. ?post=1, ?dpr=0.9, ?off=shadow,env), CUES for idle (e.g. 4,5).
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const BASE = (process.env.BASE ?? "http://localhost:3100/") + (process.env.QUERY ?? "");
const mode = process.argv[2] ?? "video";
const ROOT = new URL("../../", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const SHOTS = path.join(ROOT, "docs/landing-shots");
const POSTERS = path.join(ROOT, "src/components/landing/posters");
const ARGS = ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--window-position=40,40"];

async function settle(page) {
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal{display:none}" });
  await page.waitForTimeout(3000);
}

async function scrollToCue(page, c, f, wait = 2400) {
  await page.evaluate(
    ([c, f]) => {
      const el = document.querySelector(`[data-cue="${c}"]`);
      const r = el.getBoundingClientRect();
      window.scrollTo({ top: r.top + window.scrollY + r.height * f, behavior: "instant" });
    },
    [c, f],
  );
  await page.waitForTimeout(wait);
}

if (mode === "posters") {
  fs.mkdirSync(POSTERS, { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ARGS });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await settle(page);
  // Canvas only: the poster carries the scene, the page carries the same text as live DOM.
  await page.addStyleTag({
    content:
      "[data-cue-block],[data-cue-rail],header,footer,[data-label],main h1,main p[aria-hidden]{visibility:hidden !important} html{scrollbar-width:none}",
  });
  for (let c = 0; c <= 10; c++) {
    await scrollToCue(page, c, 0.35);
    await page.screenshot({
      path: path.join(POSTERS, `c${String(c).padStart(2, "0")}.jpg`),
      type: "jpeg",
      quality: 82,
      clip: { x: 0, y: 0, width: 1440, height: 900 },
    });
    console.log("poster", c);
  }
  await browser.close();
}

if (mode === "idle") {
  const browser = await chromium.launch({ headless: false, args: ARGS });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await settle(page);
  const out = [];
  for (const c of (process.env.CUES ?? "0,1,2,3,4,5,6,7,8,9,10").split(",").map(Number)) {
    await scrollToCue(page, c, 0.5, 1800);
    const fps = await page.evaluate(
      () =>
        new Promise((res) => {
          let n = 0;
          const t0 = performance.now();
          const tick = () => {
            n++;
            if (performance.now() - t0 < 2000) requestAnimationFrame(tick);
            else res((n / 2).toFixed(0));
          };
          requestAnimationFrame(tick);
        }),
    );
    out.push(`C${c}:${fps}`);
  }
  console.log(out.join("  "));
  await browser.close();
}

if (mode === "video" || mode === "fps") {
  fs.mkdirSync(SHOTS, { recursive: true });
  const browser = await chromium.launch({ headless: false, args: ARGS });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    ...(mode === "video" ? { recordVideo: { dir: SHOTS, size: { width: 1440, height: 900 } } } : {}),
  });
  const page = await context.newPage();
  await settle(page);
  // Count frames while the wheel drives Lenis through the whole film.
  await page.evaluate(() => {
    window.__frames = 0;
    window.__t0 = performance.now();
    window.__long = 0;
    let last = performance.now();
    const tick = (t) => {
      window.__frames++;
      if (t - last > 34) window.__long++;
      last = t;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const total = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  const step = mode === "fps" ? 120 : 60;
  const steps = Math.ceil(total / step);
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, step);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(2500);
  const stats = await page.evaluate(() => {
    const seconds = (performance.now() - window.__t0) / 1000;
    const canvas = document.querySelector("canvas");
    const ratio = canvas ? (canvas.width / canvas.clientWidth).toFixed(2) : "none";
    return {
      seconds: seconds.toFixed(1),
      fps: (window.__frames / seconds).toFixed(1),
      longFrames: window.__long,
      frames: window.__frames,
      pixelRatio: ratio,
      viewport: `${window.innerWidth}x${window.innerHeight}`,
    };
  });
  console.log("scroll fps", stats);
  const video = page.video();
  await context.close();
  if (video) {
    const file = await video.path();
    fs.renameSync(file, path.join(SHOTS, "full-scroll.webm"));
  } else {
    fs.writeFileSync(path.join(SHOTS, "fps.json"), JSON.stringify(stats, null, 2));
  }
  await browser.close();
}
