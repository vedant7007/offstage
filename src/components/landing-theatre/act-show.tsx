import type { ReactNode } from "react";
import type { Step } from "./content";
import th from "./theatre.module.css";
import s from "./act-show.module.css";

/*
 * Cue 04 as a live ops board: a clock that runs from 2:03 PM to 2:11 PM, the agents lighting up
 * around the Commander, the event log filling in, and the impact counters ticking. The frame loop
 * calls updateShow(els, dp) with the act's eased progress; every value on the board is a pure
 * function of dp, so it scrubs both ways. With film off the board renders its finished state.
 */

export type ShowStat = { n: number; label: string };

/** Already translated copy, one field per key under "theatre.show" (see SHOW_KEYS). */
export type ShowText = {
  board: string;
  pm: string;
  clockSr: string;
  boom: string;
  end: string;
  graph: string;
  log: string;
  stats: string;
  caption: string;
  policy: string;
  node: {
    input: string;
    commander: string;
    scheduler: string;
    liaison: string;
    crew: string;
    herald: string;
    helpdesk: string;
  };
};

export type ShowActProps = {
  /** CHAIN from content.ts: the 11 steps, in order. */
  chain: readonly Step[];
  /** IMPACT from content.ts: 93 / 2 / 1 / 2. */
  impact: readonly ShowStat[];
  text: ShowText;
  film: boolean;
  /** The cue head (kicker and h2). Pass it without `sticky`: the board lays it out in flow. */
  head?: ReactNode;
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const smooth = (v: number) => v * v * (3 - 2 * v);

/*
 * ----- timing: steps play over dp 0.03 to 0.64, then the finished board holds for the rest of
 * the act, so a visitor scrolling at reading pace sees the counters land, not only the run -----
 */

const S0 = 0.03;
const S1 = 0.64;
const CLOCK_END = 0.7; // the clock reaches 2:11 PM as the board settles
const START_MIN = 3; // 2:03 PM
const RUN_MIN = 8; // to 2:11 PM

const minuteAt = (dp: number) => START_MIN + Math.floor(RUN_MIN * clamp(dp / CLOCK_END) + 1e-6);
const hhmm = (m: number) => `2:${String(m).padStart(2, "0")}`;

/* ----- the graph: node positions in a 560 x 360 box, lines from the first node to the second ----- */

const W = 560;
const H = 360;
const NODES = [
  { k: "input", x: 58, y: 180 },
  { k: "commander", x: 280, y: 180 },
  { k: "scheduler", x: 140, y: 58 },
  { k: "liaison", x: 420, y: 58 },
  { k: "crew", x: 498, y: 180 },
  { k: "herald", x: 420, y: 302 },
  { k: "helpdesk", x: 140, y: 302 },
] as const;
const LINES = [
  [0, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [1, 5],
  [1, 6],
] as const;

/**
 * What each of the 11 steps does on the graph: the node it lights, the lines a pulse runs along
 * (out = first node to second, back = the reverse), and the Commander's ripple ring.
 */
type Beat = { hot: number[]; out?: number[]; back?: number[]; ring?: boolean };
const BEATS: Beat[] = [
  { hot: [0], out: [0] }, // the keynote cancels
  { hot: [1], ring: true }, // the Commander wakes
  { hot: [1], out: [1, 2, 3, 4, 5] }, // it pulls in the five
  { hot: [2], out: [1] }, // the solver checks every slot
  { hot: [2], back: [1] }, // three slots come back
  { hot: [1], ring: true, out: [1, 2, 3, 4, 5] }, // ripple view
  { hot: [1] }, // policy: T3
  { hot: [1] }, // program lead approves
  { hot: [1] }, // faculty approves
  { hot: [5], out: [4, 2, 3] }, // Herald tells attendees, speaker and volunteers
  { hot: [6], out: [5] }, // Helpdesk answers
];

/** Tag colour per step, by position in CHAIN. */
const KIND = ["input", "cmd", "cmd", "agent", "agent", "cmd", "policy", "human", "human", "agent", "agent"];
const POLICY_STEP = 6;
const APPROVALS = [7, 8];

/** When each counter runs, in step units (3.5 = halfway through step 3). Same order as IMPACT. */
const STAT_AT: [number, number][] = [
  [9.2, 10.6], // attendees told
  [9.3, 9.9], // volunteers moved
  [8.6, 9.1], // session moved
  [7.3, 8.7], // human approvals: one per check mark
];

const kindClass: Record<string, string | undefined> = {
  input: s.tagInput,
  cmd: s.tagCmd,
  policy: s.tagPolicy,
  human: s.tagHuman,
};

export function ShowAct({ chain, impact, text, film, head }: ShowActProps) {
  const n = chain.length;
  const span = (S1 - S0) / n;
  const end = film ? 0 : 1;

  return (
    <div className={cx(th.stage, s.stage)}>
      <div className={s.backdrop} aria-hidden />
      <div className={cx(s.board, !film && s.still)}>
        {head ? <div className={s.head}>{head}</div> : null}

        <div className={s.clockBox}>
          <p className={cx(s.boardLabel, s.mono)}>
            <span className={s.liveDot} aria-hidden />
            {text.board}
          </p>
          <p className={s.clock}>
            <span className={s.srOnly}>{text.clockSr}</span>
            <span className={s.clockTime} data-t="showClock" aria-hidden>
              {hhmm(minuteAt(end))}
            </span>
            <span className={cx(s.clockPm, s.mono)} aria-hidden>
              {text.pm}
            </span>
          </p>
          <div className={s.track} aria-hidden>
            <span className={s.trackFill} data-t="showTrack" />
          </div>
          <div className={s.status}>
            <p className={cx(s.boom, s.mono)} data-t="showBoom">
              {text.boom}
            </p>
            <p className={cx(s.end, s.mono)} data-t="showEnd">
              {text.end}
            </p>
          </div>
        </div>

        <div className={s.graphArea}>
          <div className={s.graph} role="img" aria-label={text.graph}>
            <svg className={s.wires} viewBox={`0 0 ${W} ${H}`} aria-hidden>
              {LINES.map(([a, b], l) => {
                const A = NODES[a];
                const B = NODES[b];
                const red = l === 0;
                return (
                  <g key={l}>
                    <path
                      className={cx(s.wire, red && s.wireRed)}
                      d={`M${A.x} ${A.y}L${B.x} ${B.y}`}
                      data-t="showLine"
                    />
                    <path
                      className={cx(s.pulse, red && s.pulseRed)}
                      d={`M${A.x} ${A.y}L${B.x} ${B.y}`}
                      pathLength={1}
                      data-t="showPulse"
                    />
                    <path
                      className={cx(s.pulse, red && s.pulseRed)}
                      d={`M${B.x} ${B.y}L${A.x} ${A.y}`}
                      pathLength={1}
                      data-t="showPulse"
                    />
                  </g>
                );
              })}
            </svg>
            <span
              className={s.ring}
              data-t="showRing"
              style={{ left: `${(NODES[1].x / W) * 100}%`, top: `${(NODES[1].y / H) * 100}%` }}
            />
            {NODES.map((node, i) => (
              <span
                key={node.k}
                className={cx(s.node, i === 1 && s.nodeCore, i === 0 && s.nodeInput)}
                data-t="showNode"
                style={{ left: `${(node.x / W) * 100}%`, top: `${(node.y / H) * 100}%` }}
              >
                {text.node[node.k]}
              </span>
            ))}
            <span
              className={s.gate}
              data-t="showGate"
              style={{ left: `${(NODES[1].x / W) * 100}%`, top: `${((NODES[1].y + 46) / H) * 100}%` }}
            >
              {text.policy}
              <span className={s.pip}>
                <span className={s.pipFill} data-t="showPip" />
              </span>
              <span className={s.pip}>
                <span className={s.pipFill} data-t="showPip" />
              </span>
            </span>
          </div>
        </div>

        <div className={s.log}>
          <h3 className={cx(s.logH, s.mono)}>{text.log}</h3>
          <div className={s.logWin}>
            <ol className={s.rows} data-t="showLog">
              {chain.map((step, i) => (
                <li key={step.t} className={s.row} data-t="showRow">
                  <span className={cx(s.rowTime, s.mono)}>{hhmm(minuteAt(S0 + i * span))}</span>
                  <span className={cx(s.tag, kindClass[KIND[i] ?? ""], s.mono)}>{step.a}</span>
                  <span className={s.rowText}>{step.t}</span>
                  {APPROVALS.includes(i) ? (
                    <svg className={s.check} viewBox="0 0 16 16" aria-hidden>
                      <path d="M3 8.6 6.6 12 13 4.6" pathLength={1} data-t="showCheck" />
                    </svg>
                  ) : null}
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className={s.statsBox}>
          <ul className={s.stats} aria-label={text.stats}>
            {impact.map((m) => (
              <li key={m.label}>
                <span className={s.srOnly}>{`${m.n} ${m.label}`}</span>
                <b className={s.statN} data-t="showStat" data-n={m.n} aria-hidden>
                  {String(film ? 0 : m.n)}
                </b>
                <span className={s.statL} aria-hidden>
                  {m.label}
                </span>
              </li>
            ))}
          </ul>
          <p className={cx(s.caption, s.mono)}>{text.caption}</p>
        </div>
      </div>
    </div>
  );
}

/* ----- the frame loop side ----- */

type El = Element & ElementCSSInlineStyle;

/** Finds the board's elements once. Call it with the theatre root (or the act). */
export function collectShow(root: ParentNode) {
  const all = (k: string) => Array.from(root.querySelectorAll<El>(`[data-t="${k}"]`));
  const one = (k: string) => root.querySelector<El>(`[data-t="${k}"]`);
  const stats = all("showStat");
  return {
    clock: one("showClock"),
    track: one("showTrack"),
    boom: one("showBoom"),
    end: one("showEnd"),
    ring: one("showRing"),
    gate: one("showGate"),
    log: one("showLog"),
    pips: all("showPip"),
    nodes: all("showNode"),
    lines: all("showLine"),
    pulses: all("showPulse"),
    rows: all("showRow"),
    checks: all("showCheck"),
    stats,
    finals: stats.map((el) => Number(el.getAttribute("data-n")) || 0),
    last: { minute: -1, counts: stats.map(() => -1) },
  };
}

export type ShowEls = ReturnType<typeof collectShow>;

/** Writes the board for progress dp (0 to 1). Writes only: no layout reads. */
export function updateShow(els: ShowEls, dp: number, _t?: number) {
  const n = els.rows.length || BEATS.length;
  const span = (S1 - S0) / n;
  const x = (dp - S0) / span; // position in step units
  const k = Math.floor(x); // the active step, out of range before and after the run
  const f = x - k; // progress through it
  const inAt = (i: number) => smooth(clamp((x - i) / 0.3));
  const outAt = (i: number) => smooth(clamp((x - i - 1) / 0.25));

  // Clock: rewrite the text only when the minute turns.
  const m = minuteAt(dp);
  if (m !== els.last.minute) {
    els.last.minute = m;
    if (els.clock) els.clock.textContent = hhmm(m);
  }
  if (els.track) els.track.style.transform = `scaleX(${clamp(dp / CLOCK_END)})`;
  const settle = clamp((dp - 0.66) / 0.06);
  if (els.boom) els.boom.style.opacity = String(1 - settle);
  if (els.end) {
    const e = smooth(clamp((dp - 0.68) / 0.06));
    els.end.style.opacity = String(e);
    els.end.style.transform = `translateY(${(1 - e) * 8}px)`;
  }

  // Log rows: arrive with their step, glow while active, dim once the next one lands.
  let started = 0;
  els.rows.forEach((row, i) => {
    const a = inAt(i);
    const o = outAt(i);
    started += a;
    row.style.opacity = String(a * (1 - 0.4 * o));
    row.style.transform = `translateY(${(1 - a) * 10}px)`;
    row.style.setProperty("--hot", (a * (1 - o)).toFixed(3));
  });
  // Narrow screens show a window of rows; it scrolls so the newest row stays in view.
  els.log?.style.setProperty("--shift", started.toFixed(3));

  // Check marks draw in on the two approvals.
  const draws = APPROVALS.map((i) => smooth(clamp((x - i - 0.35) / 0.4)));
  els.checks.forEach((p, j) => (p.style.strokeDashoffset = String(1 - (draws[j] ?? 0))));
  els.pips.forEach((p, j) => (p.style.transform = `scale(${draws[j] ?? 0})`));
  if (els.gate) {
    const g = smooth(clamp((x - POLICY_STEP) / 0.3));
    els.gate.style.opacity = String(g);
    els.gate.style.transform = `translate(-50%,-50%) translateY(${(1 - g) * 8}px)`;
  }

  // Graph: a node is lit while its step is active and stays seen afterwards.
  const hot = els.nodes.map(() => 0);
  const seen = els.nodes.map(() => 0);
  const lineSeen = LINES.map(() => 0);
  BEATS.forEach((b, i) => {
    const a = inAt(i);
    if (a <= 0) return;
    const h = a * (1 - outAt(i));
    for (const j of b.hot) {
      hot[j] = Math.max(hot[j] ?? 0, h);
      seen[j] = Math.max(seen[j] ?? 0, a);
    }
    for (const l of [...(b.out ?? []), ...(b.back ?? [])]) {
      lineSeen[l] = Math.max(lineSeen[l] ?? 0, a);
      for (const j of LINES[l] ?? []) seen[j] = Math.max(seen[j] ?? 0, a);
    }
  });
  els.nodes.forEach((el, i) => {
    el.style.opacity = String(0.42 + 0.58 * (seen[i] ?? 0));
    el.style.setProperty("--hot", (hot[i] ?? 0).toFixed(3));
  });
  els.lines.forEach((el, l) => (el.style.opacity = String(0.3 + 0.7 * (lineSeen[l] ?? 0))));

  // One pulse per line and direction, running during the first part of the active step.
  const beat = BEATS[k];
  const u = clamp((f - 0.08) / 0.62);
  const vis = Math.min(1, u * 8, (1 - u) * 8);
  els.pulses.forEach((p, idx) => {
    const l = idx >> 1;
    const runs = idx % 2 ? beat?.back?.includes(l) : beat?.out?.includes(l);
    p.style.opacity = runs ? String(vis) : "0";
    if (runs) p.style.strokeDashoffset = String(0.16 - u * 1.16);
  });
  if (els.ring) {
    const r = beat?.ring ? u : 0;
    els.ring.style.opacity = String(beat?.ring ? vis * (1 - r) : 0);
    els.ring.style.transform = `translate(-50%,-50%) scale(${0.6 + 1.8 * r})`;
  }

  // Counters tick as the run lands. The numbers are aria-hidden; the final values sit in
  // visually hidden text beside them.
  els.stats.forEach((el, i) => {
    const [a, b] = STAT_AT[i] ?? [7, 10.8];
    const v = Math.round((els.finals[i] ?? 0) * clamp((x - a) / (b - a)));
    if (v !== els.last.counts[i]) {
      els.last.counts[i] = v;
      el.textContent = String(v);
    }
  });
}
