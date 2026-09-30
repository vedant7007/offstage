// Quality-loop screenshots of the landing film: start, middle and end of each chapter.
// Usage: node scripts/landing/shots.mjs [chapters] [outDir] [viewports]   (env: BASE, POINTS, FORMAT=jpg)
// chapters: "0,1,2" (default all); viewports: "desktop,phone".
import { chromium } from "@playwright/test";
import fs from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:3100/";
const chapters = (process.argv[2] ?? "0,1,2,3,4,5,6,7,8,9,10").split(",").map(Number);
const outDir = process.argv[3] ?? "C:/CODING/sutradhar-landing/docs/landing-shots";
const viewports = (process.argv[4] ?? "desktop,phone").split(",");
const POINTS = (process.env.POINTS ?? "0.05,0.5,0.95").split(",").map(Number);
const FORMAT = process.env.FORMAT === "jpg" ? "jpeg" : "png";
fs.mkdirSync(outDir, { recursive: true });

const SIZES = { desktop: { width: 1440, height: 900 }, phone: { width: 390, height: 844 } };

const browser = await chromium.launch({
  headless: false,
  args: ["--ignore-gpu-blocklist", "--enable-gpu-rasterization", "--window-position=40,40"],
});
for (const vp of viewports) {
  const context = await browser.newContext({
    viewport: SIZES[vp],
    deviceScaleFactor: 1,
    isMobile: vp === "phone",
    hasTouch: vp === "phone",
  });
  const page = await context.newPage();
  const errors = [];
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.addStyleTag({ content: "nextjs-portal{display:none}" });
  await page.waitForTimeout(2500);
  const mode = await page.evaluate(() => document.querySelector("[data-mode]")?.getAttribute("data-mode"));
  console.log(vp, "mode:", mode);

  for (const c of chapters) {
    for (const f of POINTS) {
      await page.evaluate(
        ([c, f]) => {
          const el = document.querySelector(`[data-cue="${c}"]`);
          const r = el.getBoundingClientRect();
          window.scrollTo({ top: r.top + window.scrollY + r.height * f, behavior: "instant" });
        },
        [c, f],
      );
      await page.waitForTimeout(f === POINTS[0] ? 2600 : 2000);
      const name = `${vp}-c${String(c).padStart(2, "0")}-${String(Math.round(f * 100)).padStart(2, "0")}.${FORMAT === "jpeg" ? "jpg" : "png"}`;
      await page.screenshot({
        path: `${outDir}/${name}`,
        timeout: 30000,
        type: FORMAT,
        ...(FORMAT === "jpeg" ? { quality: 82 } : {}),
      });
      console.log("saved", name);
    }
  }
  if (errors.length) console.log("ERRORS", vp, errors.slice(0, 10));
  await context.close();
}
await browser.close();
