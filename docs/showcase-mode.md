# Showcase mode: the zero-cost demo

The [live demo](https://offstage-live.vercel.app) is the same app built with one flag. It needs no database, sign-in, secrets or model calls, and it makes no third-party network requests. Every screen works in the browser from data recorded on real runs of the full stack.

## The flag

```ts
// src/showcase/flag.ts
export const isShowcase = () => process.env.NEXT_PUBLIC_SHOWCASE === "1";
```

Next.js inlines the value at build time. With the flag off, none of the showcase code paths run and the app behaves exactly as the full version.

```sh
NEXT_PUBLIC_SHOWCASE=1 pnpm build && pnpm start
```

Where the flag changes behaviour:

| Place | Showcase behaviour |
|---|---|
| `src/lib/api-client.ts` | Every API call is answered in the browser. The live stream is a `ShowcaseStream` instead of an `EventSource`. |
| `src/lib/api-client.mock.ts` | It asks the showcase first (`showcaseCall`). If the showcase has no answer, it falls back to the contract fixtures. |
| `src/proxy.ts` | Every `/api` request returns 404 |
| `src/app/layout.tsx` | It mounts the network guard and the "simulated data" banner. |
| `src/instrumentation.ts` | It skips the database and the demo-clock sync. |
| `/login` | Shows a persona chooser instead of email OTP |
| `/console/[eventId]` | It adds scenario triggers, including a "Medical emergency" button. |
| `/demo/tickets` | Three signed sample tickets to scan (this page exists only in the showcase) |
| Voice dock | Browser speech instead of paid speech services |

## Deploying the showcase

The hosted demo is deployed with the Vercel CLI. There is no GitHub integration, so a push to `main` does not deploy anything.

1. Link a checkout to the Vercel project once: `vercel link`.
2. Set `NEXT_PUBLIC_SHOWCASE=1` in the Vercel project's environment variables (Production). No other variables are needed.
3. From the linked checkout, run `vercel deploy --prod`. Vercel builds the app with the flag on and serves it.

## Fixtures recorded from real runs

The fixtures are in `src/showcase/fixtures/`. They are recorded data and are not edited by hand.

| File | Contents |
|---|---|
| `world.json` | The HackNova 2026 event, the demo clock, each persona's view, and every recorded API response, keyed by endpoint and parameters (`src/showcase/key.ts`) |
| `scenarios/*.json` | Seven scenarios: `speaker_cancel`, `lunch_confusion`, `volunteer_noshow`, `queue_spike`, `budget_breach`, `projector_voice_note`, `emergency`. Each has phases (the trigger, then one per approval), and each phase has timed stream messages plus the responses that changed. |
| `kb.json` | Knowledge base documents and chunks for the helpdesk |
| `recorded-runs.json` | Agent runs with their model and provider, or `null` for rule-based steps |
| `briefing.json`, `closeout.json`, `evals.json` | Data for the briefing, report and evals pages |
| `src/showcase/tickets.json` | Three Ed25519-signed demo tickets and the public key. The private key was discarded after signing. |

**How they were recorded.** The recorder is `scripts/export-showcase-fixtures.ts`, run with `pnpm showcase:fixtures`. It runs against a live app and worker with `DEMO_MODE=true` and real sends off. For each scenario it:

1. Resets the demo world.
2. Fires the trigger. The emergency scenario uses a medical voice note through the real path.
3. Records the console SSE stream with the time of each message, until the stream has been quiet for 20 seconds.
4. Snapshots every read the UI makes, for every persona, and keeps only what changed.
5. Approves each pending proposal as each permitted approver, recording a new phase after every approval.

**Validation and PII scrubbing.**

- Every response is validated against the zod contract.
- Personal data is scrubbed deterministically by `src/showcase/pii.ts`. Phones become `+91 90000 000NN`, emails become `name@example.com`, and chat ids are replaced. Each person keeps the same replacement in every file.
- The writer refuses to save if any real Indian mobile number or non-example email is left. A unit test repeats the check on every fixture file.

## The replay engine

`src/showcase/engine.ts`, `data.ts` and `bus.ts`:

- **Stream.** `ShowcaseStream` is an `EventTarget` that sends the same `StreamMessage` objects as the real SSE route. The console code consumes it the same way.
- **Timing.** Messages play at their recorded offsets, in their original order. To keep a phase watchable:
  - gaps over 4 seconds are shortened to 1.5 seconds;
  - a phase longer than 20 seconds is scaled down evenly, with a floor of 150 ms per gap.
- **State.** A phase's snapshot of responses is applied when its first proposal lands. Pages that refetch after that point see the new state. Lists such as proposals and agent runs build up across scenarios, so a second scenario keeps the first one's work on screen.
- **Approvals.**
  - The recorded approval rule applies, so a T3 proposal still needs every required role.
  - Approving as the wrong persona explains who can approve, for example "Switch persona to the Faculty approver".
  - When the rule is met, the next recorded phase plays.
  - Rejecting plays nothing.
- **Disabled in the showcase:**
  - Editing and undoing proposals.
  - Real sends: the toggle is locked off.
- **What-if** returns the closest recorded sample to your question.
- **Helpdesk** (`src/showcase/helpdesk.ts`) runs in the browser:
  - BM25 search over `kb.json` plus the live schedule, so a moved session answers with its new time.
  - Answers carry citations.
  - Below a confidence threshold it escalates with the real helpdesk's wording.
  - It detects English, Hindi and Hinglish, and refuses prompt injections with the same patterns as `src/ai/guard`.
- **Voice** (`src/showcase/voice/`):
  - Uses the Web Speech API for recognition and speech, and offers typing when the browser has none.
  - An in-browser Commander answers from recorded data and can play scenarios.
  - Actions stay drafts. It never approves by voice.
- **Offline tickets.** The crew scanner verifies the sample tickets with WebCrypto Ed25519 against the showcase public key. The first scan wins and later scans show as duplicates.

## Persona store

`src/showcase/store.ts` keeps one small ledger: the persona, the demo clock start, the phases played, approvals, rejections and check-ins.

- **Where it is stored:**
  - in `localStorage` under `offstage:showcase`;
  - mirrored to the `offstage_showcase` cookie, so server-rendered pages show the same state;
  - kept in sync across tabs.
- **Reset:**
  - **Reset demo** in the header clears the ledger but keeps your persona.
  - Clearing site data also resets it.
- **Personas** on `/login`:

| Option | Persona | Lands on |
|---|---|---|
| Event head (start here) | owner | `/console/[eventId]` |
| Faculty approver | faculty | `/console/[eventId]` |
| Ravi Kumar, volunteer | volunteer | `/crew` |
| Sneha Reddy, attendee | attendee | `/me` |
| Lakshmi Prasad, speaker | read-only | `/console/[eventId]/speaker` |
| Judge view | read-only | `/console/[eventId]` |

## The server API is blocked

`src/proxy.ts` matches `/api` and `/api/:path*`. In the showcase, `showcaseApiBlock` (`src/showcase/guard/api-block.ts`) answers every match with a 404 JSON body, "The showcase demo has no server API.", without touching any route handler, secret or database.

## Network guard

`src/showcase/guard/network.ts` installs before any component runs.

- **What it wraps:** `fetch`, `XMLHttpRequest`, `EventSource`, `WebSocket` and `navigator.sendBeacon`.
- **Allowed:**
  - the same host;
  - `data:` and `blob:` URLs;
  - Google Fonts (`fonts.googleapis.com`, `fonts.gstatic.com`).
- **Everything else is blocked.** In development it throws. In production it warns once and fails the request.

## Tests

| Test | Covers |
|---|---|
| `tests/unit/showcase/engine.test.ts` | Ledger cookie round trip, gap squeezing, `speaker_cancel` end to end (trigger, owner and faculty approvals, follow-up phase, helpdesk), rejection, every persona's reads stay within the contract, lists build up, offline check-in accepts a ticket once |
| `tests/unit/showcase/fixtures.test.ts` | Response keys, PII scrubbing, `world.json` matches the contract, no personal data in any fixture |
| `tests/unit/showcase/guard.test.ts` | URL policy, dev throw, production warn-once, `/api` blocked only when the flag is on |
| `tests/unit/showcase/helpdesk.test.ts`, `voice.test.ts` | Browser helpdesk answers and escalations; voice never calls paid endpoints |
| `tests/e2e/showcase-network.spec.ts` | Run with `pnpm test:showcase-net`. It builds and starts the showcase with no database or `.env`, visits the main pages on desktop (1440 px) and phone (390 px), fires a scenario, and fails on any request to a foreign host. |

## What differs from the full version

| | Showcase | Full version |
|---|---|---|
| Agents and models | Recorded runs | Live runs on Groq, Bedrock or Ollama |
| What-if | Closest recorded sample | A fresh simulation |
| Messages | None sent | WhatsApp, SMS, Telegram, email, in-app |
| Edit and undo of proposals | Off | On |
| Data | Your browser only | Shared Postgres |

To run the full version, see [running-locally.md](running-locally.md).
