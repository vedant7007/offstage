"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Feature } from "./content";
import s from "./theatre.module.css";
import f from "./act-features.module.css";

/** Already translated strings for the micro-visuals, from the "theatre.features" keys. */
export type FeaturesCopy = {
  tokens: string;
  cost: string;
  queued: string;
  offline: string;
  synced: string;
  question: string;
  spike: string;
  certificate: string;
  verified: string;
  headcount: string;
  foodCount: string;
  sandbox: string;
};

export type ActFeaturesProps = {
  /** The six features in content order: ripple, glass box, offline, radar, colleges, what-if. */
  feats: readonly Feature[];
  copy: FeaturesCopy;
  /** False under reduced motion: tiles sit assembled and every micro-visual is a still frame. */
  film: boolean;
  /** The act's cue head. It scrolls with the grid on screens too short to show every tile. */
  head?: ReactNode;
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const vars = (v: Record<string, string | number>) => v as unknown as CSSProperties;

/* ----- micro-visuals: decorative, so aria-hidden; the tile text carries the meaning ----- */

const SATS: [number, number][] = [
  [42, 32],
  [198, 28],
  [28, 104],
  [214, 110],
  [120, 14],
  [150, 126],
  [74, 72],
  [170, 64],
];

function Ripple() {
  return (
    <svg className={f.svg} viewBox="0 0 240 140">
      {SATS.map(([x, y]) => (
        <line key={`l${x}`} className={f.ripLine} x1="120" y1="70" x2={x} y2={y} />
      ))}
      {[0, 1].map((i) => (
        <circle key={i} className={f.ripRing} cx="120" cy="70" r="90" style={vars({ "--i": i })} />
      ))}
      {SATS.map(([x, y]) => (
        <g key={`s${x}`} style={vars({ "--d": (Math.hypot(x - 120, y - 70) / 90) * 3 })}>
          <circle className={f.ripSat} cx={x} cy={y} r="4.5" />
          <circle className={f.ripHit} cx={x} cy={y} r="4.5" />
        </g>
      ))}
      <circle className={f.ripCore} cx="120" cy="70" r="8" />
    </svg>
  );
}

function GlassBox({ copy }: { copy: FeaturesCopy }) {
  return (
    <div className={f.glass}>
      <span className={s.mono}>{copy.tokens}</span>
      <b className={f.tok} />
      <span className={s.mono}>{copy.cost}</span>
      <b className={f.cost} />
      <i className={f.glassBar} />
    </div>
  );
}

function Offline({ copy }: { copy: FeaturesCopy }) {
  return (
    <div className={f.off}>
      <b className={f.queue} />
      <span className={s.mono}>{copy.queued}</span>
      <span className={cx(f.pill, s.mono)}>
        <span className={f.pillOff}>{copy.offline}</span>
        <span className={f.pillOn}>{copy.synced}</span>
      </span>
      <span className={f.pips}>
        {Array.from({ length: 7 }, (_, i) => (
          <i key={i} style={vars({ "--i": i })} />
        ))}
      </span>
    </div>
  );
}

function Radar({ copy }: { copy: FeaturesCopy }) {
  return (
    <div className={f.radar}>
      <span className={s.mono}>{copy.question}</span>
      <span className={cx(f.radarTag, s.mono)}>{copy.spike}</span>
      <svg className={f.svg} viewBox="0 0 200 48">
        <polyline
          className={f.spark}
          pathLength="1"
          points="0,38 15,37 30,39 45,35 60,38 75,34 90,37 105,34 120,36 132,32 145,6 157,34 172,35 187,33 200,34"
        />
        <circle className={f.spikeHalo} cx="145" cy="6" r="4" />
        <circle className={f.spikeDot} cx="145" cy="6" r="4" />
      </svg>
    </div>
  );
}

function Certificate({ copy }: { copy: FeaturesCopy }) {
  return (
    <div className={f.certWrap}>
      <div className={f.cert}>
        <span className={s.mono}>{copy.certificate}</span>
        <i />
        <i />
      </div>
      <span className={cx(f.verify, s.mono)}>
        <svg viewBox="0 0 24 24">
          <circle cx="12" cy="12" r="11" />
          <path pathLength="1" d="M7 12.5l3.2 3.2L17 9" />
        </svg>
        {copy.verified}
      </span>
    </div>
  );
}

function WhatIf({ copy }: { copy: FeaturesCopy }) {
  return (
    <div className={f.wi}>
      <span className={cx(f.wiChip, s.mono)}>{copy.sandbox}</span>
      <span className={s.mono}>{copy.headcount}</span>
      <span className={cx(f.wiTrack, f.wiSlide)}>
        <i className={f.wiFill} />
        <i className={f.wiThumbRail}>
          <i />
        </i>
      </span>
      <span className={s.mono}>{copy.foodCount}</span>
      <span className={f.wiTrack}>
        <i className={f.wiBar} />
      </span>
    </div>
  );
}

/** One visual per feature, in FEATS order. Index 0 and 5 are the large tiles. */
const VISUALS = [Ripple, GlassBox, Offline, Radar, Certificate, WhatIf];
const BIG = new Set([0, 5]);

/**
 * Cue 06, "Bento backstage": six tiles that assemble as the act scrolls. With film on, the
 * theatre loop drives it through collectFeatures and updateFeatures; the micro-visuals loop in
 * CSS only while the act carries data-on.
 */
export function ActFeatures({ feats, copy, film, head }: ActFeaturesProps) {
  return (
    <div className={cx(s.stage, f.stage, !film && f.still)}>
      <div className={f.track} data-t="featuresTrack">
        {head}
        <ul className={f.grid} data-t="featuresGrid">
          {feats.map((feat, i) => {
            const Visual = VISUALS[i];
            return (
              <li key={feat.t} className={cx(f.tile, BIG.has(i) && f.big, i === 5 && f.ink)}>
                {Visual ? (
                  <div className={f.viz} aria-hidden>
                    <Visual copy={copy} />
                  </div>
                ) : null}
                <div className={f.text}>
                  <span className={cx(f.n, s.mono)}>{String(i + 1).padStart(2, "0")}</span>
                  <h3 className={f.t}>{feat.t}</h3>
                  <p className={f.d}>{feat.d}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

/* ----- frame loop hooks: collect once, then write only (no layout reads) ----- */

export type FeaturesEls = { track: HTMLElement | null; tiles: HTMLElement[] };

export function collectFeatures(root: ParentNode): FeaturesEls {
  const grid = root.querySelector<HTMLElement>('[data-t="featuresGrid"]');
  return {
    track: root.querySelector<HTMLElement>('[data-t="featuresTrack"]'),
    tiles: Array.from(grid?.children ?? []) as HTMLElement[],
  };
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (v: number) => 1 - (1 - v) ** 3;

/**
 * Tiles rise into place one after another: translateY 40px to 0, scale .96 to 1, opacity 0 to 1.
 * The first two are already on their way as the stage scrolls in, the last lands by dp 0.6.
 * --fp pans the track on screens too short for the whole grid (CSS turns it into a translate).
 */
export function updateFeatures(els: FeaturesEls, dp: number, _t: number) {
  els.tiles.forEach((el, i) => {
    const a = easeOut(clamp((dp + 0.08 - i * 0.07) / 0.3));
    el.style.transform = `translate3d(0,${((1 - a) * 40).toFixed(2)}px,0) scale(${(0.96 + 0.04 * a).toFixed(4)})`;
    el.style.opacity = a.toFixed(3);
  });
  els.track?.style.setProperty("--fp", clamp((dp - 0.08) / 0.84).toFixed(4));
}
