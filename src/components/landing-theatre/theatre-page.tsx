"use client";

import Lenis from "lenis";
import "lenis/dist/lenis.css";
import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import { CONTACT_MAILTO, DEMO_EVENT_SLUG, LOGIN_PATH, REPO_URL, eventPath } from "@/components/public/links";
import en from "@/lib/i18n/en.json";
import { useT } from "@/lib/i18n/provider";
import type { MessageKey, Translate } from "@/lib/i18n/translate";
import { isShowcase } from "@/showcase/flag";
import { ActCommander } from "./act-commander";
import { ActFeatures } from "./act-features";
import { ShowAct } from "./act-show";
import {
  ACTS,
  BOW,
  CHAIN,
  CHAOS,
  CMD,
  COMMANDER,
  CREW,
  FEATS,
  IMPACT,
  LAW,
  LAW_LINE,
  PROOF,
  TEAM,
  TIERS,
  TRUST,
  actLabel,
  type ActId,
  type Agent,
} from "./content";
import { useTheatre } from "./use-theatre";
import s from "./theatre.module.css";

const REDUCE = "(prefers-reduced-motion: reduce)";
const subscribe = (cb: () => void) => {
  const m = window.matchMedia(REDUCE);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
};

const cx = (...c: (string | false | undefined)[]) => c.filter(Boolean).join(" ");
const vars = (v: Record<string, string | number>) => v as unknown as CSSProperties;
const nn = (i: number) => String(i + 1).padStart(2, "0");

/** Translates every leaf of an en.json subtree by its dot path, keeping the tree's shape. */
function translateTree<T>(t: Translate, tree: T, path: string): T {
  return Object.fromEntries(
    Object.entries(tree as Record<string, unknown>).map(([k, v]) => [
      k,
      typeof v === "string" ? t(`${path}.${k}` as MessageKey) : translateTree(t, v, `${path}.${k}`),
    ]),
  ) as T;
}

/** The kicker and h2 of a cue, from the one label each act uses everywhere. */
function CueHead({
  id,
  sticky,
  center,
  children,
}: {
  id: ActId;
  sticky?: boolean;
  center?: boolean;
  children?: ReactNode;
}) {
  const act = ACTS.find((a) => a.id === id);
  return (
    <header className={cx(s.cueHead, sticky && s.cueHeadSticky, center && s.cueHeadCenter)}>
      <p className={cx(s.cueKicker, s.mono)}>{act?.cue ? `Cue ${act.cue}` : act?.label}</p>
      {children}
    </header>
  );
}

/** The award, as a gold pill. Shown in the hero and again at the curtain call. */
function Badge({ text }: { text: string }) {
  return (
    <p className={cx(s.badge, s.mono)}>
      <svg viewBox="0 0 24 24" aria-hidden className={s.badgeIcon}>
        <path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" />
      </svg>
      {text}
    </p>
  );
}

function AgentBody({ agent }: { agent: Agent }) {
  return (
    <>
      <span className={cx(s.agentN, s.mono)}>{agent.name}</span>
      <span className={s.agentD}>{agent.does}</span>
      <span className={cx(s.agentL, s.mono)}>Human lead: {agent.lead}</span>
    </>
  );
}

/** The disclosure card. Turns over on hover, keyboard focus and click, and once by itself when it scrolls in. */
function Flip({ film }: { film: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || !film) return;
    let timer = 0;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.setAttribute("data-peek", "");
        timer = window.setTimeout(() => el.removeAttribute("data-peek"), 2400);
        io.disconnect();
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      window.clearTimeout(timer);
    };
  }, [film]);

  return (
    <div className={s.flipWrap}>
      <button
        ref={ref}
        type="button"
        className={s.flip}
        aria-pressed={pressed}
        onClick={() => setPressed((p) => !p)}
      >
        <span className={s.flipInner}>
          <span className={cx(s.flipFace, s.flipFront)}>
            <span className={cx(s.flipTag, s.mono)}>Drafted by</span>
            <span className={s.flipName}>OFFSTAGE</span>
          </span>
          <span className={cx(s.flipFace, s.flipBack)}>
            <span className={cx(s.flipTag, s.mono)}>Approved by</span>
            <span className={s.flipName}>Program lead</span>
          </span>
        </span>
      </button>
      <p className={cx(s.flipNote, s.mono)}>Hover, tap or focus to turn it over</p>
    </div>
  );
}

export function TheatrePage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const reduced = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(REDUCE).matches,
    () => false,
  );
  const film = !reduced;
  useTheatre(rootRef, film);
  const t = useT();
  const copy = useMemo(() => translateTree(t, en.theatre, "theatre"), [t]);
  const L = copy.landing;

  // Smooth wheel scrolling on this page only. It moves the real window scroll, so the theatre's
  // scroll listener keeps working; destroyed on unmount so other routes scroll natively.
  const lenisRef = useRef<Lenis | null>(null);
  useEffect(() => {
    if (!film) return;
    const lenis = new Lenis({ autoRaf: true, lerp: 0.1, smoothWheel: true, syncTouch: false, anchors: true });
    lenisRef.current = lenis;
    return () => {
      lenis.destroy();
      lenisRef.current = null;
    };
  }, [film]);

  const goTo = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    if (lenisRef.current) lenisRef.current.scrollTo(el);
    else el.scrollIntoView();
  };

  return (
    <div ref={rootRef} className={s.root} data-mode={film ? "film" : "poster"}>
      <a href="#main" className={s.skip}>
        Skip to content
      </a>
      <noscript>
        <p className={s.noscript}>
          This page is a scroll-driven theatre. Turn on JavaScript to see the full show.
        </p>
      </noscript>

      <div className={s.progress} data-t="progress" aria-hidden />

      <header className={s.nav} data-t="nav">
        <a className={s.brand} href="#opening">
          <span className={s.mark} aria-hidden />
          OFFSTAGE
        </a>
        <p className={cx(s.navCue, s.mono)} data-t="cue" aria-live="polite">
          {actLabel(0)}
        </p>
      </header>
      <Link href={LOGIN_PATH} className={cx(s.btn, s.btnLime, s.navCta)}>
        {L.ctaDemo}
      </Link>

      <nav className={s.rail} aria-label="Story progress">
        <ol>
          {ACTS.map((a, i) => (
            <li key={a.id}>
              <button
                type="button"
                data-rail=""
                aria-current={i === 0 ? "step" : undefined}
                onClick={() => goTo(a.id)}
              >
                <span className={s.railLabel}>{actLabel(i)}</span>
              </button>
            </li>
          ))}
        </ol>
      </nav>

      <main id="main" tabIndex={-1} className={s.main}>
        {/* Opening: the curtain */}
        <section
          id="opening"
          data-act="opening"
          className={cx(s.act, s.dark)}
          style={vars({ "--acth": "170vh" })}
        >
          <div className={cx(s.stage, s.stageHero, s.persp)}>
            <div className={s.hero} data-t="hero">
              <Badge text={L.badge} />
              <h1 className={s.heroTitle}>
                <span className={s.line}>{L.heroTitleA}</span>{" "}
                <span className={s.line}>
                  {L.heroTitleB} <span className={s.accent}>{L.heroTitleC}</span>
                </span>
              </h1>
              <p className={s.heroSub}>{L.heroSub}</p>
              <div className={s.heroCtas}>
                <Link href={LOGIN_PATH} className={cx(s.btn, s.btnLime, s.btnLg)}>
                  {L.ctaDemo} <span aria-hidden>→</span>
                </Link>
                <a href="#how" className={cx(s.btn, s.btnGhost, s.btnLg)}>
                  {L.ctaHow}
                </a>
              </div>
            </div>
            <p className={cx(s.hint, s.mono)} data-t="hint" aria-hidden>
              Scroll for the story <span className={s.hintDot} />
            </p>
            <div className={s.valance} aria-hidden />
            <div className={cx(s.curtain, s.curtainL)} data-t="curtL" aria-hidden />
            <div className={cx(s.curtain, s.curtainR)} data-t="curtR" aria-hidden />
          </div>
        </section>

        {/* Cue 01: the chaos */}
        <section
          id="chaos"
          data-act="chaos"
          className={cx(s.act, s.light)}
          style={vars({ "--acth": "200vh" })}
        >
          <div className={cx(s.stage, s.stageChaos)}>
            <CueHead id="chaos">
              <h2 className={s.cueTitle}>
                <span className={s.line}>The chaos</span> <span className={s.line}>before the show</span>
              </h2>
              <p className={s.cueLede}>
                Every college event starts the same way: bright people, big ideas, and nothing in one place.
              </p>
            </CueHead>
            <ul className={s.chaos} data-t="chaos">
              {CHAOS.map((c, i) => (
                <li
                  key={c.t}
                  className={cx(s.ccard, c.red && s.ccardRed)}
                  style={vars({
                    "--x": `${c.x}%`,
                    "--y": `${c.y}%`,
                    "--mx": `${i % 2 ? 51 : 3}%`,
                    "--my": `${13 + Math.floor(i / 2) * 18 + (i % 2) * 3}%`,
                  })}
                >
                  <span className={cx(s.ccardI, s.mono)}>{nn(i)}</span>
                  <p>{c.t}</p>
                </li>
              ))}
            </ul>
            <p className={cx(s.chaosOut, s.mono)} data-t="chaosOut">
              Then the lights come up on a different way to run a show.
            </p>
          </div>
        </section>

        {/* Cue 02: enter the Commander */}
        <section
          id="commander"
          data-act="commander"
          className={cx(s.act, s.dark)}
          style={vars({ "--acth": "220vh" })}
        >
          <ActCommander
            steps={CMD}
            agents={[COMMANDER, ...CREW]}
            copy={copy.commander}
            film={film}
            head={
              <CueHead id="commander">
                <h2 className={s.cueTitle}>
                  <span className={s.line}>Enter the</span> <span className={s.line}>Commander</span>
                </h2>
              </CueHead>
            }
          />
        </section>

        {/* Cue 03: how it works */}
        <section id="how" data-act="how" className={cx(s.act, s.light, s.actTail)}>
          <div className={s.scroll} data-scroll="" style={vars({ "--scrollh": "180vh" })}>
            <div className={cx(s.stage, s.stageRule)}>
              <CueHead id="how">
                <h2 className={s.cueTitle}>How it works</h2>
                <p className={s.cueLede}>One rule runs every agent, every hour of the event.</p>
              </CueHead>
              <ol className={s.plates} data-t="plates">
                {LAW.map((line, i) => (
                  <li key={line} className={cx(s.plate, i % 2 === 1 && s.plateAlt)}>
                    <span className={cx(s.plateI, s.mono)}>{nn(i)}</span>
                    <span className={s.plateT}>{line}</span>
                  </li>
                ))}
              </ol>
              <p className={s.emerg} data-t="emerg">
                Emergencies go straight to humans. Every lead is alerted.
              </p>
            </div>
          </div>
          <div className={s.tiers} data-reveal="">
            <h3 className={cx(s.tiersH, s.mono)}>Autonomy tiers</h3>
            <ul className={s.tiersList}>
              {TIERS.map((t) => (
                <li key={t.tier}>
                  <span className={cx(s.tier, s.mono)}>{t.tier}</span>
                  <span>{t.text}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Cue 04: the crew */}
        <section id="crew" data-act="crew" className={cx(s.act, s.dark)} style={vars({ "--acth": "260vh" })}>
          <div className={cx(s.stage, s.stageCrew, s.persp)}>
            <div className={s.crewSpot} aria-hidden />
            <CueHead id="crew" sticky>
              <h2 className={s.cueTitle}>The crew</h2>
              <p className={s.cueLede}>14 agents, every one with a human lead. Scroll to turn the stage.</p>
            </CueHead>
            <div className={s.rings}>
              <ul className={s.ring} data-t="ring">
                {CREW.map((a) => (
                  <li key={a.name} className={s.agent}>
                    <AgentBody agent={a} />
                  </li>
                ))}
              </ul>
              <div className={cx(s.agent, s.agentCore)}>
                <AgentBody agent={COMMANDER} />
              </div>
            </div>
          </div>
        </section>

        {/* Cue 05: the live ops board */}
        <section id="show" data-act="show" className={cx(s.act, s.dark)} style={vars({ "--acth": "280vh" })}>
          <ShowAct
            chain={CHAIN}
            impact={IMPACT}
            text={copy.show}
            film={film}
            head={
              <CueHead id="show">
                <h2 className={s.cueTitle}>
                  <span className={s.line}>The show</span> <span className={s.line}>must go on</span>
                </h2>
              </CueHead>
            }
          />
        </section>

        {/* Cue 06: what runs backstage */}
        <section
          id="features"
          data-act="features"
          className={cx(s.act, s.light)}
          style={vars({ "--acth": "220vh" })}
        >
          <ActFeatures
            feats={FEATS}
            copy={copy.features}
            film={film}
            head={
              <CueHead id="features">
                <h2 className={s.cueTitle}>
                  <span className={s.line}>What runs</span> <span className={s.line}>backstage</span>
                </h2>
              </CueHead>
            }
          />
        </section>

        {/* Cue 07: proof */}
        <section id="proof" data-act="proof" className={cx(s.act, s.light)}>
          <div className={s.proof}>
            <CueHead id="proof">
              <h2 className={s.cueTitle}>{L.proofKicker}</h2>
            </CueHead>
            <ul className={s.proofGrid} data-reveal="">
              {PROOF.map((p) => (
                <li key={p.key}>
                  <span className={s.proofN}>{p.value ?? L.proofCostValue}</span>
                  <span className={s.proofT}>{L[p.key]}</span>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Cue 08: trust */}
        <section id="trust" data-act="trust" className={cx(s.act, s.light, s.actTail)}>
          <div className={s.scroll} data-scroll="" style={vars({ "--scrollh": "120vh" })}>
            <div className={cx(s.stage, s.stageTrust)}>
              <CueHead id="trust">
                <h2 className={s.cueTitle}>
                  <span className={s.line}>Trust is</span> <span className={s.line}>the contract</span>
                </h2>
              </CueHead>
              <ul className={s.trust} data-reveal="">
                {TRUST.map((t, i) => (
                  <li key={t}>
                    <span className={cx(s.trustI, s.mono)}>{nn(i)}</span>
                    <span className={s.trustT}>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className={s.disclose} data-reveal="">
            <h3 className={cx(s.discloseH, s.mono)}>Every automated message says so</h3>
            <Flip film={film} />
            <p className={cx(s.discloseLine, s.mono)}>“Drafted by OFFSTAGE, approved by the program lead”</p>
          </div>
        </section>

        {/* Curtain call */}
        <section
          id="final"
          data-act="final"
          className={cx(s.act, s.dark)}
          style={vars({ "--acth": "240vh" })}
        >
          <div className={cx(s.stage, s.stageFinal, s.persp)}>
            <div className={s.floor} aria-hidden />
            <div className={s.spot} aria-hidden />
            <CueHead id="final" center />
            <ul className={s.bow} data-t="bow">
              {BOW.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
            <div className={s.finalMsg} data-t="finalMsg">
              <h2 className={s.finalT}>
                <span className={s.line}>The show</span>{" "}
                <span className={s.line}>
                  goes <span className={s.accent}>on.</span>
                </span>
              </h2>
              <p className={s.finalS}>OFFSTAGE runs everything behind it.</p>
            </div>
            <div className={s.team} data-t="team">
              <Badge text={L.badge} />
              <p className={s.mono}>
                {L.teamLabel}: {TEAM.join(", ")}
              </p>
            </div>
            <div className={s.ctaRow} data-t="cta">
              <Link href={LOGIN_PATH} className={cx(s.btn, s.btnLime, s.btnLg)}>
                {L.ctaDemo} <span aria-hidden>→</span>
              </Link>
              <Link href={eventPath(DEMO_EVENT_SLUG)} className={cx(s.btn, s.btnGhost, s.btnLg)}>
                See the attendee side
              </Link>
            </div>
            <div className={cx(s.curtain, s.curtainL, s.finCurtain)} data-t="finL" aria-hidden />
            <div className={cx(s.curtain, s.curtainR, s.finCurtain)} data-t="finR" aria-hidden />
          </div>
        </section>

        {isShowcase() ? (
          <section className={s.notice} aria-labelledby="demo-notice">
            <h2 id="demo-notice" className={cx(s.noticeH, s.mono)}>
              {L.noticeTitle}
            </h2>
            <p className={s.noticeP}>{L.noticeBody}</p>
          </section>
        ) : null}

        <section id="contact" className={s.contact} aria-labelledby="contact-title" data-reveal="">
          <p className={cx(s.cueKicker, s.mono)}>{L.contactKicker}</p>
          <h2 id="contact-title" className={s.contactT}>
            {L.contactTitle}
          </h2>
          <p className={s.contactP}>{L.contactBody}</p>
          <div className={s.contactRow}>
            <a href={CONTACT_MAILTO} className={cx(s.btn, s.btnInk, s.btnLg)}>
              {L.contactCta} <span aria-hidden>→</span>
            </a>
            <a
              href={REPO_URL}
              className={cx(s.btn, s.btnLine, s.btnLg)}
              target="_blank"
              rel="noopener noreferrer"
            >
              {L.source}
            </a>
          </div>
        </section>
      </main>

      <footer className={s.foot}>
        <p className={cx(s.law, s.mono)}>{LAW_LINE}</p>
        <p className={cx(s.flow, s.mono)} aria-hidden>
          problem → commander → rule → crew → live ops → backstage → proof → trust → curtain call
        </p>
        <nav aria-label="Footer" className={s.footNav}>
          <Link href="/about-ai">About our AI</Link>
          <Link href={eventPath(DEMO_EVENT_SLUG)}>Demo event</Link>
          <Link href={LOGIN_PATH}>{L.ctaDemo}</Link>
          <a href={CONTACT_MAILTO}>{L.contactCta}</a>
          <a href={REPO_URL} target="_blank" rel="noopener noreferrer">
            GitHub
          </a>
        </nav>
      </footer>
    </div>
  );
}
