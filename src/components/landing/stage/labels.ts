import { CanvasTexture, SRGBColorSpace } from "three";

/** The page's font families, read from the landing root so canvas labels match the DOM type. */
function fonts() {
  const root = typeof document === "undefined" ? null : document.querySelector<HTMLElement>("[data-mode]");
  const css = root ? getComputedStyle(root) : null;
  const pick = (name: string, fallback: string) => css?.getPropertyValue(name).trim() || fallback;
  return {
    display: pick("--font-anton", "Impact, sans-serif"),
    mono: pick("--font-mono", "ui-monospace, Consolas, monospace"),
    body: pick("--font-inter", "system-ui, sans-serif"),
  };
}

export interface LabelSpec {
  title: string;
  sub?: string;
  /** Pixel size of the canvas; the aspect should match the mesh it is mapped on. */
  width: number;
  height: number;
  bg?: string;
  fg?: string;
  accent?: string;
  font?: "display" | "mono";
  size?: number;
}

/** Draws a title (and an optional subtitle) on a canvas and returns it as a texture. */
export function makeLabel(spec: LabelSpec): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = spec.width;
  canvas.height = spec.height;
  const ctx = canvas.getContext("2d")!;
  const f = fonts();
  ctx.fillStyle = spec.bg ?? "#f3ede3";
  ctx.fillRect(0, 0, spec.width, spec.height);
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const family = spec.font === "display" ? f.display : f.mono;
  const size = spec.size ?? Math.round(spec.height * (spec.sub ? 0.3 : 0.42));
  ctx.fillStyle = spec.fg ?? "#1a1209";
  const weight = spec.font === "display" ? 400 : 600;
  ctx.font = `${weight} ${size}px ${family}`;
  if (spec.font !== "display") ctx.letterSpacing = "0.04em";
  const fit = (spec.width * 0.86) / Math.max(1, ctx.measureText(spec.title).width);
  if (fit < 1) ctx.font = `${weight} ${Math.floor(size * fit)}px ${family}`;
  ctx.fillText(spec.title, spec.width / 2, spec.sub ? spec.height * 0.38 : spec.height / 2);
  if (spec.sub) {
    ctx.fillStyle = spec.accent ?? "#7a6a52";
    ctx.font = `500 ${Math.round(size * 0.58)}px ${f.mono}`;
    ctx.letterSpacing = "0.12em";
    ctx.fillText(spec.sub.toUpperCase(), spec.width / 2, spec.height * 0.72);
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

/** Worn wood planks for the stage floor, drawn once. */
export function makeWood(width = 1024, height = 1024): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#4a3221";
  ctx.fillRect(0, 0, width, height);
  const planks = 9;
  const ph = height / planks;
  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < planks; i++) {
    const tone = 0.82 + rnd() * 0.3;
    ctx.fillStyle = `rgb(${Math.round(92 * tone)} ${Math.round(62 * tone)} ${Math.round(40 * tone)})`;
    ctx.fillRect(0, i * ph, width, ph - 3);
    // Grain
    for (let g = 0; g < 70; g++) {
      ctx.strokeStyle = `rgb(0 0 0 / ${0.05 + rnd() * 0.12})`;
      ctx.lineWidth = 1 + rnd() * 2;
      const y = i * ph + rnd() * ph;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= width; x += 64) ctx.lineTo(x, y + Math.sin(x * 0.01 + g) * 3 * rnd());
      ctx.stroke();
    }
    // Wear: lighter scuffs
    for (let w = 0; w < 6; w++) {
      ctx.fillStyle = `rgb(255 235 200 / ${0.03 + rnd() * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(
        rnd() * width,
        i * ph + rnd() * ph,
        40 + rnd() * 120,
        6 + rnd() * 10,
        rnd(),
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    // Plank end seams
    let x = rnd() * 300;
    while (x < width) {
      ctx.fillStyle = "rgb(0 0 0 / 0.45)";
      ctx.fillRect(x, i * ph, 3, ph);
      x += 240 + rnd() * 400;
    }
  }
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** The Commander intake chat, drawn on a canvas so it types on the screen mesh itself. */
export class ChatCanvas {
  readonly texture: CanvasTexture;
  readonly total: number;
  private readonly canvas = document.createElement("canvas");
  private readonly ctx: CanvasRenderingContext2D;

  constructor(private readonly messages: { who: string; text: string }[]) {
    this.canvas.width = 1160;
    this.canvas.height = 710;
    this.ctx = this.canvas.getContext("2d")!;
    this.total = messages.reduce((n, m) => n + m.text.length + 8, 0);
    this.texture = new CanvasTexture(this.canvas);
    this.texture.colorSpace = SRGBColorSpace;
    this.texture.anisotropy = 4;
    this.draw(0);
  }

  draw(chars: number) {
    const { ctx, canvas } = this;
    const f = fonts();
    ctx.fillStyle = "#14120f";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    let y = 70;
    let left = chars;
    for (const m of this.messages) {
      const n = Math.max(0, Math.min(m.text.length, left));
      if (n === 0 && left <= 0) break;
      left -= m.text.length + 8;
      ctx.font = `600 26px ${f.mono}`;
      ctx.letterSpacing = "0.16em";
      ctx.fillStyle = m.who === "Organizer" ? "#ffb23f" : "#4da3ff";
      ctx.fillText(m.who.toUpperCase(), 80, y);
      y += 48;
      ctx.font = `500 46px ${f.body}`;
      ctx.letterSpacing = "0em";
      ctx.fillStyle = "#f3ede3";
      y = wrapText(ctx, m.text.slice(0, n) + (n < m.text.length ? "_" : ""), 80, y, 1000, 60);
      y += 52;
    }
    this.texture.needsUpdate = true;
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
) {
  const words = text.split(" ");
  let line = "";
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word;
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
  return y + lineHeight;
}

/** A soft radial glow for the halo sprites that stand in for bloom on weaker GPUs. */
export function makeHalo(size = 96): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgb(255 255 255 / 0.9)");
  g.addColorStop(0.25, "rgb(255 255 255 / 0.35)");
  g.addColorStop(0.6, "rgb(255 255 255 / 0.07)");
  g.addColorStop(1, "rgb(255 255 255 / 0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** White centre to black rim: an alpha map that dissolves the void floor into the background. */
export function makeRadialMask(size = 256): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "#ffffff");
  g.addColorStop(0.45, "#ffffff");
  g.addColorStop(0.8, "#3a3a3a");
  g.addColorStop(1, "#000000");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return new CanvasTexture(canvas);
}
