<div align="center">

<img src="docs/assets/offstage-wordmark.svg" alt="OFFSTAGE wordmark: a lime dot followed by the word OFFSTAGE" width="420">

### Your event, run offstage.

Fourteen AI agents run the work behind an event, each paired with a human lead.<br>
Agents propose, policy decides, humans approve, code executes.

[![1st Prize: AIML Hacks 2026](https://img.shields.io/badge/1st_Prize-AIML_Hacks_2026-c1ff00?style=flat-square&labelColor=0b0b0c)](#team)
[![Live demo](https://img.shields.io/badge/Live_demo-offstage--live.vercel.app-0b0b0c?style=flat-square&logo=vercel)](https://offstage-live.vercel.app)
[![CI](https://github.com/vedant7007/offstage/actions/workflows/ci.yml/badge.svg)](https://github.com/vedant7007/offstage/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue?style=flat-square)](LICENSE)
[![Next.js 16](https://img.shields.io/badge/Next.js-16-000000?style=flat-square&logo=nextdotjs)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.9-3178c6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![PostgreSQL 17 + pgvector](https://img.shields.io/badge/PostgreSQL-17_%2B_pgvector-4169e1?style=flat-square&logo=postgresql&logoColor=white)](https://github.com/pgvector/pgvector)

<a href="docs/assets/offstage-demo.mp4"><img src="docs/assets/offstage-demo.gif" alt="A keynote speaker cancels: the Commander wakes, Radar and the stage log light up, the glass box shows its cited facts and steps, and the T3 plan with its ripple waits for the event head to approve" width="960"></a>

## [Live Demo](https://offstage-live.vercel.app) · [Watch the 60s demo](docs/assets/offstage-demo.mp4) · [Architecture](docs/architecture.md)

</div>

---

## Why OFFSTAGE

**The problem.** Most college events run on WhatsApp threads, spreadsheets and favours.
When a speaker cancels, the change has to reach rooms, volunteers, announcements, helpdesk answers and sponsors, and people usually update only some of them.
Enterprise event tools cost lakhs, are built for corporate conferences, and do not handle Indian college needs such as faculty approval and OD letters.

**The solution.** OFFSTAGE gives every event a team of 14 specialised agents that share one source of truth.
Agents never write to the database directly. They file proposals, and a policy engine written in code decides which ones need a human and which human.
Approved proposals run through deterministic executors in one database transaction. Every step is traced, every message goes through an outbox, and emergencies always go to people.

## How it works

### The law

```mermaid
flowchart LR
  A["Agents propose<br/>14 agents file typed proposals"] --> P{"Policy decides<br/>code assigns T0 to T3"}
  P -- "T0, T1" --> X["Code executes<br/>one DB transaction, audit log, outbox"]
  P -- "T2: 1 approval<br/>T3: 2 approvals" --> H["Humans approve<br/>the agent's lead, owner or faculty"]
  H --> X
  X -- "new domain events" --> A
```

T1 actions run at once with a 10 minute undo window. Emergencies (medical, safety, fire, harassment) are never handled by agents: they raise a loud alert to every lead and agents only help draft. Details: [docs/policy.md](docs/policy.md).

### The 14 agents

Every agent is a config on one shared runtime ([src/agents/index.ts](src/agents/index.ts)). Tiers below are the tiers the policy engine assigns to each agent's typical action; full detail in [docs/agents.md](docs/agents.md).

| Agent | Job | Human lead | Example action | Tier |
|---|---|---|---|---|
| Commander | Turns a disruption into one plan; intake, daily briefing, what-if | Event head | Speaker cancels: move a session into the gap, reassign crew, announce | T2 (T3 if a 50+ session is cancelled) |
| Planner | Flags overdue and at-risk milestones | Event head | "Overdue: venue booking confirmed" note | T0 |
| Finance | Warns before overspend and proposes cover; never pays | Treasurer | Move budget from Decor to Food | T2 (T3 above 10,000 INR) |
| Sponsorship | Drafts sponsor follow-ups; never sends | Sponsorship lead | Follow-up mail draft for a sponsor | T1 |
| Marketing | Registrations against target, push suggestions, post drafts | Marketing lead | "25% behind target: push these 3 colleges" | T0 |
| Registrar | Flags duplicates, promotes the waitlist | Registrations lead | Promote 10 people from the waitlist | T2 (T3 if bulk) |
| Scheduler | Keeps the schedule clash-free with a deterministic solver | Program lead | Shift downstream sessions when one runs late | T2 |
| Speaker Liaison | Reminds speakers to send AV and travel requirements | Program lead | Requirements reminder to one speaker | T1 |
| Crew Chief | Covers missed shifts fairly with a solver | Volunteer lead | Assign Ravi to the registration desk shift | T1 |
| Logistics | Food counts and room readiness checklists | Logistics lead | "Lunch: 412 plates" food count | T1 |
| Herald | Announces approved changes to the right people | Comms lead | "Moved: Intro to ML" to 120 attendees | T2 (T3 above 200 people) |
| Helpdesk | Answers with citations, or escalates | Comms lead | Escalate a question it cannot ground | T0 |
| Radar | Watches question spikes, queues and voice-note reports | Ops lead | Lunch confusion: incident, signage task, announcement | T0 to T2 |
| Chronicler | Final report and lessons for next time | Event head | Final report for the event | T1 |

## Features

<table>
<tr>
<td width="50%" valign="top">

**Live Stage.** The console's home: every agent as a node, proposals and runs streaming in live over SSE.

<img src="docs/showcase-shots/desktop-live-stage-speaker-cancel.png" alt="Live Stage console for HackNova 2026: demo scenario buttons, check-in and approval counters, and the agent graph with Finance waiting for approval" width="100%">

</td>
<td width="50%" valign="top">

**Ripple view.** Before you approve, see everything a plan touches: sessions, people, crew, messages.

<img src="docs/showcase-shots/desktop-approval-t3-ripple.png" alt="T3 proposal to move a session into a cancelled keynote slot, with its ripple across sessions, 265 attendees, two volunteers and announcements per channel" width="100%">

</td>
</tr>
<tr>
<td valign="top">

**Glass box.** Every agent run is open: steps, tool calls, model, tokens, cost and latency.

<img src="docs/showcase-shots/desktop-glass-box-commander.png" alt="Glass box for a Commander run: model, tokens, cost, latency, cited facts and each tool and model step" width="100%">

</td>
<td valign="top">

**Jarvis voice.** Talk to the Commander. It answers from live state and turns requests into proposals, never approvals.

<img src="docs/showcase-shots/desktop-jarvis.png" alt="Voice Commander declining to approve by voice and refusing a prompt injection attempt" width="100%">

</td>
</tr>
<tr>
<td valign="top">

**Helpdesk with citations.** Attendees get answers grounded in event documents, with sources, or an honest escalation.

<img src="docs/showcase-shots/desktop-attendee-helpdesk.png" alt="Attendee helpdesk chat answering a question with a cited source" width="100%">

</td>
<td valign="top">

**Offline signed tickets.** Ed25519-signed QR tickets verify on a volunteer's phone with no network. First scan wins.

<img src="docs/showcase-shots/desktop-offline-checkin.png" alt="Crew check-in screen accepting a signed ticket while the device is offline, queued to sync later" width="100%">

</td>
</tr>
<tr>
<td valign="top">

**Confusion Radar.** When many people ask the same thing in a few minutes, Radar opens an incident and proposes a fix.

<img src="docs/showcase-shots/desktop-confusion-radar.png" alt="Radar panel during the lunch confusion scenario: 14 helpdesk questions in 10 minutes, 12 about the lunch location, two open incidents, and Radar proposing a lunch announcement that waits for approval" width="100%">

</td>
<td valign="top">

**What-if.** Ask "what if 30% more people show up" and see the impact in a sandbox that never touches real state.

<img src="docs/showcase-shots/desktop-whatif.png" alt="What-if view with a scenario question and its projected impact" width="100%">

</td>
</tr>
<tr>
<td valign="top">

**Daily briefing.** Every morning at 07:00 IST: what happened, what is due, what is at risk, what waits for you.

<img src="docs/showcase-shots/desktop-briefing.png" alt="Daily briefing page for the event head" width="100%">

</td>
<td valign="top">

**Close-out report.** Attendance, helpdesk, incidents and money, with every number taken from SQL.

<img src="docs/showcase-shots/desktop-closeout.png" alt="Close-out report with attendance, helpdesk and incident figures" width="100%">

</td>
</tr>
<tr>
<td valign="top">

**Emergency path.** Medical or safety reports skip the agents and raise a loud alert to every lead and the public status page.

<img src="docs/showcase-shots/desktop-emergency-banner.png" alt="Console emergency banner announcing a medical emergency to every lead" width="100%">

</td>
<td valign="top">

**Speaker view.** Every role has a screen: console, crew app, attendee portal, public page, and the speaker's own phone.

<img src="docs/showcase-shots/desktop-speaker-phone.png" alt="Speaker view showing the messages a speaker receives on their phone" width="100%">

</td>
</tr>
</table>

## Architecture

```mermaid
flowchart TB
  subgraph Clients
    O["Organizer and leads<br/>/console"]
    V["Volunteers<br/>/crew PWA"]
    AT["Attendees<br/>/me, /e/slug"]
  end

  subgraph Web["Next.js 16 app"]
    R["Route handlers<br/>authz + zod on every route"]
    ACT["actions.propose / approve<br/>src/server/actions"]
    POL["Policy engine<br/>src/server/policy"]
    EX["Executors<br/>one transaction per proposal"]
    SSE["SSE streams<br/>console + public status"]
  end

  subgraph DB["Postgres 17 + pgvector"]
    T[("Domain tables, proposals,<br/>audit_log, domain_events")]
    OB[("outbox")]
    KB[("kb_chunks<br/>vector 384 + full text")]
    Q[("pg-boss queues")]
  end

  subgraph Worker["Worker (Node)"]
    D["Domain-event dispatcher<br/>+ agent cron jobs"]
    AG["Agent runtime<br/>14 agent configs, solvers"]
    DR["Outbox drain<br/>every 3 s"]
  end

  subgraph Router["Model router"]
    G["Groq<br/>gpt-oss-120b / 20b, Prompt Guard 2, Whisper"]
    B["Amazon Bedrock<br/>Nova 2 Lite"]
    OL["Ollama<br/>qwen3:4b-instruct"]
    RU["Rules-only fallback"]
  end

  subgraph Channels
    WA["WhatsApp (Twilio)"]
    SMS["SMS (Twilio)"]
    TG["Telegram Bot API"]
    EM["Email (SMTP: Mailpit or SES)"]
    IA["In-app notifications"]
  end

  O & V & AT --> R
  R --> ACT --> POL
  POL -- "T0, T1 or approved" --> EX --> T
  EX --> OB
  T -- "LISTEN / NOTIFY" --> SSE --> O & AT
  T -- "NOTIFY" --> Q --> D --> AG
  AG -- "proposals" --> ACT
  AG <--> Router
  G -. "fallback" .-> B -. "fallback" .-> OL -. "fallback" .-> RU
  AG --> KB
  OB --> DR --> WA & SMS & TG & EM & IA
```

More diagrams (proposal flow, SSE stream, router chains): [docs/architecture.md](docs/architecture.md).

### Showcase vs full version

The [live demo](https://offstage-live.vercel.app) is a zero-cost build of the same app. How it works: [docs/showcase-mode.md](docs/showcase-mode.md). How it is deployed: [Deploying the showcase](docs/showcase-mode.md#deploying-the-showcase).

| | Showcase (`NEXT_PUBLIC_SHOWCASE=1`) | Full version |
|---|---|---|
| Data | Recorded from real runs of the full stack, PII scrubbed, replayed in the browser | Postgres 17 + pgvector |
| Agents and AI | Replayed agent runs, proposals, briefing, report and what-if | Live agents on Groq, Bedrock or Ollama |
| Approvals | Real role rules (T3 still needs two people), state kept in your browser | Policy engine, approvals and executors in Postgres |
| Helpdesk | BM25 search over the recorded knowledge base, with citations and escalation | Hybrid vector and full-text search with a model, guard and citations |
| Voice | Browser speech recognition and synthesis | Groq Whisper and Murf text to speech |
| Messages | None sent; delivery shown as simulated | WhatsApp, SMS, Telegram, email, in-app through the outbox |
| Sign-in | Pick a persona, no email or code | Email OTP (Better Auth) |
| Server API | Every `/api` route returns 404; a network guard blocks third-party hosts | Full API with authz on every route |
| Cost | Static hosting only | Model and messaging usage |

## Proof

Measured during the hackathon.

| What | Result |
|---|---|
| Helpdesk answers grounded in a cited source | 95 percent |
| Refusal when no source exists | 100 percent |
| Prompt injections blocked | 20 of 20 |
| Solver checks passed (schedule and crew) | 42 of 42 |
| Retrieval accuracy | 97.5 percent |
| Full demo run (71 agent runs, `AI_PROFILE=demo` on Groq and Bedrock) | about USD 0.03 (USD 0.0265) |

Tests in this repo today: 659 unit tests in 41 files (`pnpm test`), plus 14 database integration test files (`pnpm test:db`), Playwright end-to-end specs and a showcase network test.

## Tech stack

| Layer | Choice |
|---|---|
| Web | Next.js 16 (App Router), React 19, TypeScript 5.9 strict, Tailwind CSS 4 |
| Contracts | zod 4 schemas in `src/contracts`, shared by app, worker and agents |
| Database | PostgreSQL 17 + pgvector, Drizzle ORM |
| Jobs | pg-boss on the same Postgres |
| Realtime | Server-Sent Events over Postgres LISTEN/NOTIFY |
| Auth | Better Auth with email OTP, one authz helper on every route |
| AI | Vercel AI SDK 7 with Groq, Amazon Bedrock and Ollama providers |
| Retrieval | `bge-small-en-v1.5` embeddings (384 dims) run locally, hybrid search with reciprocal rank fusion |
| Solvers | Deterministic TypeScript for schedule and crew assignment |
| Channels | Twilio (WhatsApp, SMS), Telegram Bot API, nodemailer (Mailpit, Amazon SES SMTP) |
| Tickets | Ed25519 signed QR codes, verified offline with WebCrypto |
| Visuals | React Three Fiber, React Flow, GSAP |
| Tests | Vitest, Playwright, a custom eval harness |
| Hosting | Showcase on Vercel; full stack on Docker Compose with Caddy |

## Quick start

<details>
<summary><b>Try the showcase</b> (nothing to install)</summary>

Open [offstage-live.vercel.app](https://offstage-live.vercel.app), choose a persona (start with **Event head**), then trigger a scenario such as "Speaker cancels" from the Live Stage and approve the plan. Use **Reset demo** in the header to start again.

</details>

<details>
<summary><b>Run the showcase locally</b> (no database, no <code>.env</code>, no keys)</summary>

Needs Node 24 and pnpm 11 (`corepack enable`).

```sh
pnpm install
NEXT_PUBLIC_SHOWCASE=1 pnpm build
pnpm start            # http://localhost:3000
```

</details>

<details>
<summary><b>Run the full stack</b> (Docker, Postgres, worker, real agents)</summary>

Needs Node 24, pnpm 11 and Docker. Model keys are optional: with none, agents fall back to rules. Full guide: [docs/running-locally.md](docs/running-locally.md).

```sh
cp .env.example .env
pnpm keys                          # paste the printed secrets and the local DATABASE_URL into .env
docker compose up -d db mailpit    # Postgres 17 + pgvector, Mailpit inbox on :8025
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                           # terminal 1: http://localhost:3000
pnpm worker                        # terminal 2: agents, jobs, outbox
```

</details>

## Project structure

```
src/
  agents/       14 agent configs and the shared agent runtime
  ai/           model router, prompt-injection guard, RAG, voice, evals
  app/          Next.js routes: (public), (attendee), (crew), (console), api
  components/   UI kit and the console, crew, attendee, public and landing screens
  contracts/    zod schemas and types shared by everything
  db/           Drizzle schema, migrations, seed, demo reset and triggers
  lib/          API client, time (UTC stored, IST shown), i18n, logger
  server/       authz, policy engine, actions and executors, channels, SSE
  showcase/     zero-cost demo: flag, recorded fixtures, replay engine, guards
  solvers/      deterministic schedule and crew solvers
  styles/       design tokens and theme
  templates/    event type templates (hackathon, workshop, charity drive, other)
worker/
  index.ts      pg-boss worker: dispatcher, cron, briefing, outbox drain
  jobs/         agent jobs, domain events, outbox
tests/
  unit/ integration/ e2e/ evals/ voice/
scripts/        key generation, fixture recorder, deploy helpers
docs/           architecture, agents, policy, showcase, running locally, ADRs
```

## Screenshots

<table>
<tr>
<td width="68%"><img src="docs/showcase-shots/desktop-landing.png" alt="OFFSTAGE landing page on a desktop screen" width="100%"></td>
<td width="32%"><img src="docs/showcase-shots/mobile-crew-home.png" alt="Volunteer crew app on a phone showing the current shift and tasks" width="100%"></td>
</tr>
<tr>
<td><img src="docs/showcase-shots/desktop-phone-dock.png" alt="Phone dock on the Live Stage showing the messages an attendee, a volunteer and a speaker received after a schedule change" width="100%"></td>
<td><img src="docs/showcase-shots/mobile-live-stage-speaker-cancel.png" alt="Live Stage console on a phone during the speaker cancellation scenario" width="100%"></td>
</tr>
</table>

## Roadmap

- Executors for certificates and OD letters (both are already tiered T3 in the policy engine).
- An API route for the per-event agent kill switch; today it is a database flag checked on every agent wake.
- Native SES and Resend email drivers (email goes through SMTP today).
- More event templates (four ship today: hackathon, workshop, charity drive, other).
- Production WhatsApp senders in place of the Twilio sandbox.

## Team

Team **MASTICODE**. 1st Prize, AIML Hacks 2026, KG Reddy College of Engineering.

| Name | Role | GitHub |
|---|---|---|
| Vedant Idlgave | Agents and AI | [@vedant7007](https://github.com/vedant7007) |
| Abhinav Nakka | Platform and security | [@Abhinav1480](https://github.com/Abhinav1480) |
| V Thanishka | Design and experience | [@vthanishka](https://github.com/vthanishka) |

## Acknowledgements

- AIML Hacks 2026 and KG Reddy College of Engineering for the problem statement (GENAI-25, Multi-Agent Event Management System) and the 36 hours.
- Groq, Amazon Bedrock and Ollama for the models; Hugging Face Transformers.js and `bge-small-en-v1.5` for local embeddings.
- pgvector, pg-boss, Drizzle, Better Auth, the Vercel AI SDK, Twilio and Telegram for the building blocks.

## Contact and license

Questions, pilots or feedback: [email us](mailto:vedantidlgave16@gmail.com?subject=OFFSTAGE%20enquiry).

Released under the [MIT License](LICENSE), copyright (c) 2026 Vedant Idlgave, Abhinav Nakka and V Thanishka. Contributions are welcome: see [CONTRIBUTING.md](CONTRIBUTING.md), the [Code of Conduct](CODE_OF_CONDUCT.md) and the [security policy](SECURITY.md). The codename in the source is `sutradhar`, "the one who holds the strings".
