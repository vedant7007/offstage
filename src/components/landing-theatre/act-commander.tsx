"use client";

import type { CSSProperties, ReactNode } from "react";
import type { Agent, Step } from "./content";
import s from "./theatre.module.css";
import c from "./act-commander.module.css";

/*
 * Cue 02, the Director's console. Left: the intake interview as a chat transcript whose text is
 * scrubbed by scroll. Right: the event plan builds, timeline bars first, then the agent team, which
 * hands off to the crew. Every scroll-driven value is a CSS custom property read only under `.film`,
 * so with motion off (or before the first frame) the CSS fallbacks show the finished, still layout.
 */

/** English copy, one entry per key under "theatre.commander" in en.json. */
export const COMMANDER_EN = {
  transcript: "Intake interview",
  plan: "Event plan",
  timeline: "Timeline",
  timelineStart: "Kickoff",
  timelineEnd: "Event day",
  barRegistrations: "Registrations",
  barSponsors: "Sponsors and budget",
  barSpeakers: "Speakers and sessions",
  barVolunteers: "Volunteer shifts",
  barEvent: "Event days",
  team: "Agent team",
  teamNote: "Each one reports to a human lead",
  handoff: "Next: the crew",
  closing: "One shared source of truth.",
} as const;

export type CommanderCopy = Record<keyof typeof COMMANDER_EN, string>;

export type ActCommanderProps = {
  /** CMD from content.ts. The first step's speaker is the organiser; the rest are the Commander. */
  steps: readonly Step[];
  /** The Commander first, then the crew: [COMMANDER, ...CREW]. */
  agents: readonly Pick<Agent, "name">[];
  copy: CommanderCopy;
  film: boolean;
  /** The act's cue head, rendered in flow above the transcript (pass it without `sticky`). */
  head?: ReactNode;
};

/** Timeline bars: copy key, start and end as a fraction of the run up to the event. */
const BARS = [
  ["barRegistrations", 0, 0.7],
  ["barSponsors", 0.05, 0.5],
  ["barSpeakers", 0.2, 0.8],
  ["barVolunteers", 0.6, 0.93],
  ["barEvent", 0.9, 1],
] as const;

const cx = (...v: (string | false | undefined)[]) => v.filter(Boolean).join(" ");

export function ActCommander({ steps, agents, copy, film, head }: ActCommanderProps) {
  const organiser = steps[0]?.a;
  return (
    <div className={cx(s.stage, c.stage, film && c.film)} data-t="commanderConsole">
      <div className={c.glow} aria-hidden />
      <div className={c.grid}>
        <div className={c.left}>
          {head}
          <div className={cx(c.panel, c.chat)}>
            <h3 className={cx(s.mono, c.panelHead)}>
              <span className={c.dot} aria-hidden />
              {copy.transcript}
            </h3>
            <ol className={c.log}>
              {steps.map((step) => (
                <li
                  key={step.t}
                  className={cx(c.msg, step.a === organiser && c.msgOrg)}
                  data-t="commanderMsg"
                >
                  <span className={cx(s.mono, c.role)}>{step.a}</span>
                  <p className={c.bubble}>
                    <span className={c.full}>{step.t}</span>
                    {film ? (
                      <span className={c.typed} data-t="commanderType" aria-hidden>
                        {step.t}
                      </span>
                    ) : null}
                  </p>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className={cx(c.panel, c.plan)}>
          <h3 className={cx(s.mono, c.panelHead)}>
            <span className={c.dot} aria-hidden />
            {copy.plan}
          </h3>
          <div className={c.planBody}>
            <div className={c.timeline}>
              <p className={cx(s.mono, c.sub)}>{copy.timeline}</p>
              <ul className={c.bars}>
                {BARS.map(([key, from, to]) => (
                  <li
                    key={key}
                    className={cx(c.bar, key === "barEvent" && c.barEvent)}
                    data-t="commanderBar"
                    style={{ "--from": from, "--to": to } as CSSProperties}
                  >
                    <span className={c.barLabel}>{copy[key]}</span>
                    <span className={c.track} aria-hidden>
                      <span className={c.fill} />
                    </span>
                  </li>
                ))}
              </ul>
              <p className={cx(s.mono, c.axis)} aria-hidden>
                <span>{copy.timelineStart}</span>
                <span>{copy.timelineEnd}</span>
              </p>
            </div>
            <div className={c.team}>
              <p className={cx(s.mono, c.sub, c.teamHead)}>
                <span>{copy.team}</span>
                <span className={c.teamNote}>{copy.teamNote}</span>
              </p>
              <ul className={c.chips}>
                {agents.map((a, i) => (
                  <li key={a.name} className={cx(c.chip, i === 0 && c.chipCore)} data-t="commanderChip">
                    <span className={c.chipDot} aria-hidden />
                    {a.name}
                  </li>
                ))}
              </ul>
              <p className={cx(s.mono, c.handoff)}>
                {copy.handoff} <span aria-hidden>↓</span>
              </p>
            </div>
          </div>
        </div>
      </div>
      <p className={c.closing}>{copy.closing}</p>
    </div>
  );
}

/* ----- scroll scenes ----- */

type Msg = { el: HTMLElement; type: HTMLElement | null; chars: string[]; shown: number };
export type CommanderEls = {
  console: HTMLElement | null;
  msgs: Msg[];
  bars: HTMLElement[];
  chips: HTMLElement[];
};

const graphemes = (text: string) =>
  typeof Intl !== "undefined" && "Segmenter" in Intl
    ? Array.from(new Intl.Segmenter(undefined, { granularity: "grapheme" }).segment(text), (g) => g.segment)
    : Array.from(text);

/** Finds the act's elements once. Call after a render with film on. */
export function collectCommander(root: ParentNode): CommanderEls {
  const all = (k: string) => Array.from(root.querySelectorAll<HTMLElement>(`[data-t="${k}"]`));
  return {
    console: root.querySelector<HTMLElement>('[data-t="commanderConsole"]'),
    msgs: all("commanderMsg").map((el) => {
      const type = el.querySelector<HTMLElement>('[data-t="commanderType"]');
      const chars = graphemes(type?.textContent ?? "");
      return { el, type, chars, shown: chars.length };
    }),
    bars: all("commanderBar"),
    chips: all("commanderChip"),
  };
}

const clamp = (v: number) => Math.min(1, Math.max(0, v));
const easeOut = (x: number) => 1 - (1 - x) ** 3;
const back = (x: number) => 1 + 2.4 * (x - 1) ** 3 + 1.4 * (x - 1) ** 2; // overshoots a little, lands on 1

/** Writes an inline custom property only when its rounded value changes. Reads no layout. */
const set = (el: HTMLElement | null, k: string, v: number) => {
  if (!el) return;
  const str = v.toFixed(3);
  if (el.style.getPropertyValue(k) !== str) el.style.setProperty(k, str);
};

/*
 * Timings, as eased act progress dp from 0 to 1:
 *   message i  appears at 0.02 + 0.11 i and types over 0.035 + 0.11 i to + 0.08 (last done by 0.555)
 *   bar j      grows 0.24 + 0.025 j, over 0.09 (as the plan message types; all done by 0.43)
 *   swap       0.43 to 0.46, small screens only: the team takes the timeline's place
 *   chip k     pops 0.45 + 0.02 k, over 0.07 (as the team message types; all in by 0.78)
 *   handoff    0.78 to 0.87, the team lights up for the crew
 *   closing    0.86 to 0.95, "One shared source of truth."; it holds to 1
 */
export function updateCommander(els: CommanderEls, dp: number, _t: number) {
  const n = els.msgs.length;
  const appear = (i: number) => easeOut(clamp((dp - (0.02 + 0.11 * i)) / 0.03));
  els.msgs.forEach((m, i) => {
    const a = appear(i);
    const typed = clamp((dp - (0.035 + 0.11 * i)) / 0.08);
    set(m.el, "--a", a);
    set(m.el, "--live", i < n - 1 ? 1 - appear(i + 1) : 1); // narrow screens show one message at a time
    set(m.el, "--k", a > 0.5 && typed < 1 ? 1 : 0); // the caret shows until the line is typed
    const shown = Math.round(m.chars.length * typed);
    if (m.type && shown !== m.shown) {
      m.shown = shown;
      m.type.textContent = m.chars.slice(0, shown).join("");
    }
  });
  els.bars.forEach((el, j) => set(el, "--g", easeOut(clamp((dp - (0.24 + 0.025 * j)) / 0.09))));
  els.chips.forEach((el, k) => {
    const x = clamp((dp - (0.45 + 0.02 * k)) / 0.07);
    set(el, "--c", back(x));
    set(el, "--co", clamp(x * 1.8));
  });
  set(els.console, "--swap", easeOut(clamp((dp - 0.43) / 0.03)));
  set(els.console, "--hand", easeOut(clamp((dp - 0.78) / 0.09)));
  set(els.console, "--end", easeOut(clamp((dp - 0.86) / 0.09)));
}
