"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { CONSOLE_PATH } from "@/components/public/links";
import { CHAPTERS, CRISIS_LOG, DEPARTMENTS, EVENT_TYPES, TIERS, type Chapter } from "./chapters";
import { OVERLAY_LABELS } from "./overlay-labels";
import { POSTERS } from "./posters";
import { DOM, useFilmScroll } from "./use-film-scroll";
import { Lines } from "./text-reveal";
import styles from "./landing.module.css";

const StageCanvas = dynamic(() => import("./stage-canvas"), { ssr: false });

type Mode = "pending" | "film" | "poster";

/** Whether this browser can play the film: motion allowed and WebGL 2 available. */
function detectMode(): Mode {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return "poster";
  try {
    const canvas = document.createElement("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) return "poster";
    gl.getExtension("WEBGL_lose_context")?.loseContext();
  } catch {
    return "poster";
  }
  return "film";
}

export function LandingPage() {
  const [mode, setMode] = React.useState<Mode>("pending");

  React.useEffect(() => {
    // Decided after paint: the server render and the first client frame show the film layout.
    const id = requestAnimationFrame(() => setMode(detectMode()));
    return () => cancelAnimationFrame(id);
  }, []);

  const scrollTo = useFilmScroll(mode === "film");
  const still = mode === "poster";

  return (
    <div className={styles.root} data-mode={mode}>
      <a href="#main" className={styles.skip}>
        Skip to content
      </a>
      <header className={styles.nav}>
        <Link href="/" className={styles.wordmark} aria-label="OFFSTAGE home">
          OFFSTAGE
        </Link>
        <Link href={CONSOLE_PATH} className={styles.navLink}>
          Enter live demo
        </Link>
      </header>

      {mode !== "poster" ? (
        <ol className={styles.rail} aria-label="Chapters">
          {CHAPTERS.map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                {...{ [DOM.rail]: "" }}
                aria-current={i === 0 ? "true" : undefined}
                aria-label={`Cue ${String(i).padStart(2, "0")}, ${c.cue}`}
                onClick={() => scrollTo(i)}
              >
                CUE {String(i).padStart(2, "0")}
              </button>
            </li>
          ))}
        </ol>
      ) : null}

      {mode === "film" ? (
        <>
          <div className={styles.canvas} aria-hidden>
            <StageCanvas />
          </div>
          <div className={styles.overlay} aria-hidden>
            {OVERLAY_LABELS.map((l) => (
              <div key={l.id} data-label={l.id} className={styles.label} style={{ opacity: 0 }}>
                {l.text}
                {l.sub ? <small>{l.sub}</small> : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      <main id="main" tabIndex={-1} className={styles.chapters}>
        {CHAPTERS.map((chapter, i) => (
          <section
            key={chapter.id}
            {...{ [DOM.section]: i }}
            id={`cue-${String(i).padStart(2, "0")}`}
            className={still ? styles.posterChapter : styles.chapter}
            style={{ "--vh": chapter.vh } as React.CSSProperties}
            aria-labelledby={`cue-${i}-title`}
          >
            {still && POSTERS[i] ? (
              <Image
                src={POSTERS[i]}
                alt=""
                className={styles.poster}
                sizes="(max-width: 767px) 100vw, 704px"
                priority={i === 0}
              />
            ) : null}
            <div className={`${styles.sticky} ${i === 0 ? styles.titleSticky : ""}`}>
              <ChapterText chapter={chapter} index={i} still={still} />
            </div>
          </section>
        ))}
      </main>

      <footer className={styles.footer}>
        <p>Agents propose. Policy decides. Humans approve. Code executes.</p>
        <nav aria-label="Footer">
          <Link href="/about-ai">About our AI</Link>
          <Link href="/e/hacknova-2026">Demo event</Link>
          <Link href={CONSOLE_PATH}>Console</Link>
        </nav>
      </footer>
    </div>
  );
}

function ChapterText({ chapter, index, still }: { chapter: Chapter; index: number; still: boolean }) {
  const titleId = `cue-${index}-title`;
  const blockClass = `${styles.block} ${styles[chapter.side]} ${still ? styles.in : ""}`;
  const block = { [DOM.block]: "" };

  if (index === 0) {
    return (
      <>
        <h1 id={titleId} className={styles.marquee}>
          OFFSTAGE
        </h1>
        <div {...block} className={`${styles.block} ${styles.tagline} ${still ? styles.in : ""}`}>
          <p className={styles.headline}>
            <Lines lines={chapter.headline} still={still} />
          </p>
        </div>
        <p className={styles.hint} aria-hidden>
          <span className={styles.hintBar} />
          Scroll
        </p>
      </>
    );
  }

  if (index === CHAPTERS.length - 1) {
    return (
      <div {...block} className={`${styles.block} ${styles.finale} ${still ? styles.in : ""}`}>
        <span className={styles.cue}>Cue 10</span>
        <h2 id={titleId} className={styles.headline}>
          <Lines lines={chapter.headline} still={still} />
        </h2>
        <Link href={CONSOLE_PATH} className={styles.cta}>
          Enter the live demo
          <ArrowRight aria-hidden size={18} />
        </Link>
        <p className={styles.credits}>
          <b>Vedant</b> · <b>Abhinav</b> · <b>Thanishka</b>
        </p>
      </div>
    );
  }

  return (
    <div {...block} className={blockClass}>
      <span className={styles.cue}>Cue {String(index).padStart(2, "0")}</span>
      <h2 id={titleId} className={styles.headline}>
        <Lines lines={chapter.headline} still={still} />
      </h2>
      {chapter.body ? (
        <p className={styles.body}>
          <Lines lines={chapter.body} offset={chapter.headline.length} still={still} />
        </p>
      ) : null}
      {chapter.id === "crew" ? (
        <ul className={styles.departments}>
          {DEPARTMENTS.map((d) => (
            <li key={d.name}>
              <span className={styles.department}>{d.name}</span>
              <ul>
                {d.agents.map((a) => (
                  <li key={a.name}>
                    {a.name}
                    <span>{a.lead}</span>
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}
      {chapter.id === "preparation" ? (
        <p className={styles.counter}>
          <span id={DOM.counter}>{still ? "320" : "0"}</span> registered
          <small>HackNova 2026, a seeded demo event</small>
        </p>
      ) : null}
      {chapter.id === "crisis" ? (
        <ol id={DOM.log} className={styles.log} aria-label="What the agents did">
          {CRISIS_LOG.map((line) => (
            <li key={line.at} className={still ? styles.on : undefined}>
              <time>{line.time}</time>
              <span>
                <b>{line.who}</b> {line.text}
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {chapter.id === "approval" ? <span className={styles.tag}>numbers illustrative</span> : null}
      {chapter.id === "fanout" ? <span className={styles.tag}>target</span> : null}
      {chapter.id === "rule" ? (
        <ol className={styles.tiers}>
          {TIERS.map((t) => (
            <li key={t.tier}>
              <b>{t.tier}</b>
              <span>{t.text}</span>
            </li>
          ))}
          <li>
            <b>!</b>
            <span>Emergencies skip the AI and alert every lead.</span>
          </li>
        </ol>
      ) : null}
      {chapter.id === "any-event" ? (
        <span id={DOM.eventType} className={styles.eventType} aria-live="off">
          {still ? EVENT_TYPES.join(" · ") : EVENT_TYPES[0]}
        </span>
      ) : null}
    </div>
  );
}
