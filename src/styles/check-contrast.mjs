// Checks WCAG 2.2 contrast for every token pairing in tokens.css, for light and dark.
// Usage: pnpm contrast            prints the table, exits 1 on any failure
//        pnpm contrast --write    also rewrites the table in docs/design-tokens.md
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const css = readFileSync(path.join(here, "tokens.css"), "utf8");
const docPath = path.join(here, "../../docs/design-tokens.md");

function readBlock(selectorStart) {
  const start = css.indexOf(selectorStart);
  const body = css.slice(css.indexOf("{", start) + 1, css.indexOf("\n}", start));
  const vars = {};
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\s*;/gi)) vars[m[1]] = m[2];
  return vars;
}

const themes = { light: readBlock(":root,\n.light"), dark: readBlock(".dark {") };

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function ratio(a, b) {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

// [foreground, background, minimum, what it is used for]
const TEXT = 4.5;
const UI = 3;
const surfaces = ["bg", "surface", "surface-raised", "surface-sunken"];
const pairs = [
  ...surfaces.map((s) => ["fg", s, TEXT, "Body text"]),
  ...surfaces.map((s) => ["fg-muted", s, TEXT, "Secondary text"]),
  ["border-strong", "bg", UI, "Control borders"],
  ["border-strong", "surface", UI, "Control borders"],
  ["ring", "bg", UI, "Focus ring"],
  ["ring", "surface", UI, "Focus ring"],
  ["ring", "surface-sunken", UI, "Focus ring"],
  ["on-curtain", "curtain", TEXT, "Primary button"],
  ["on-curtain", "curtain-hover", TEXT, "Primary button hover"],
  ["curtain", "bg", UI, "Primary button edge"],
  ["curtain-text", "bg", TEXT, "Links, brand text"],
  ["curtain-text", "surface", TEXT, "Links, brand text"],
  ["curtain-soft-fg", "curtain-soft", TEXT, "Selected chip, tier badge"],
  ["on-agent", "agent", TEXT, "Agent avatar"],
  ["agent", "surface", UI, "Agent icon"],
  ["agent-text", "bg", TEXT, "Agent text"],
  ["agent-text", "surface", TEXT, "Agent text"],
  ["agent-soft-fg", "agent-soft", TEXT, "Simulated badge"],
  ["approved", "surface", UI, "Approved icon"],
  ["approved-text", "surface", TEXT, "Approved text"],
  ["approved-soft-fg", "approved-soft", TEXT, "Approved badge"],
  ["pending", "surface", UI, "Pending icon"],
  ["pending-text", "surface", TEXT, "Pending text"],
  ["pending-soft-fg", "pending-soft", TEXT, "Pending badge, warning alert"],
  ["info", "surface", UI, "Info icon"],
  ["info-text", "surface", TEXT, "Info text"],
  ["info-soft-fg", "info-soft", TEXT, "Executed badge, info alert"],
  ["neutral", "surface", UI, "Neutral icon"],
  ["neutral-soft-fg", "neutral-soft", TEXT, "Rejected, stale, undone badges"],
  ["danger", "surface", UI, "Danger icon, destructive border"],
  ["danger-text", "bg", TEXT, "Error text"],
  ["danger-text", "surface", TEXT, "Error text"],
  ["danger-soft-fg", "danger-soft", TEXT, "Danger alert"],
  ["on-emergency", "emergency", TEXT, "Emergency banner"],
  ["emergency", "bg", UI, "Emergency border"],
  ["emergency-soft-fg", "emergency-soft", TEXT, "Emergency alert"],
];

let failures = 0;
const rows = [];
for (const [fg, bg, min, use] of pairs) {
  const cells = [];
  for (const theme of ["light", "dark"]) {
    const a = themes[theme][fg];
    const b = themes[theme][bg];
    if (!a || !b) throw new Error(`Missing token ${!a ? fg : bg} in ${theme}`);
    const r = ratio(a, b);
    const ok = r >= min;
    if (!ok) failures++;
    cells.push(`${r.toFixed(2)} ${ok ? "pass" : "FAIL"}`);
  }
  rows.push(`| \`--${fg}\` on \`--${bg}\` | ${use} | ${min}:1 | ${cells[0]} | ${cells[1]} |`);
}

const table = ["| Pair | Used for | Needs | Light | Dark |", "| --- | --- | --- | --- | --- |", ...rows].join(
  "\n",
);

console.log(table);
console.log(`\n${pairs.length * 2} checks, ${failures} failing`);

if (process.argv.includes("--write")) {
  const doc = readFileSync(docPath, "utf8");
  const begin = "<!-- contrast:begin -->";
  const end = "<!-- contrast:end -->";
  const next = doc.replace(new RegExp(`${begin}[\\s\\S]*${end}`), `${begin}\n${table}\n${end}`);
  writeFileSync(docPath, next);
  console.log(`Updated ${path.relative(process.cwd(), docPath)}`);
}

process.exit(failures ? 1 : 0);
