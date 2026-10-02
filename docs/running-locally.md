# Running the full stack locally

This runs the real system: Postgres with pgvector, the Next.js app, the worker with all 14 agents, and a local mail inbox. For the zero-setup demo instead, see [showcase-mode.md](showcase-mode.md).

## Prerequisites

- Node 24 (see `.nvmrc`) and pnpm 11. Run `corepack enable` once and the pinned pnpm version is used.
- Docker, for Postgres 17 + pgvector and Mailpit.
- Optional: a Groq API key, AWS credentials with Bedrock access, or [Ollama](https://ollama.com) with `qwen3:4b-instruct` pulled. With none of these, agents use their rule-based fallbacks.
- Optional: a Twilio account (WhatsApp sandbox, SMS) and a Telegram bot token. Without them every channel uses the mock driver and the outbox marks messages `delivered_mock`.

## 1. Configure

```sh
cp .env.example .env
pnpm keys
```

`pnpm keys` prints fresh values for `AUTH_SECRET`, the Ed25519 ticket signing key pair and `PII_ENCRYPTION_KEY`. Paste them into `.env`, and set `DATABASE_URL` to the local value shown in its comment. Every other variable is documented inline in `.env.example`. The ones that matter first:

| Variable | Local value | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgres://sutradhar:sutradhar@localhost:5432/sutradhar` | Matches the `db` service in `docker-compose.yml` |
| `DEMO_MODE` | `true` | Persona switcher and demo triggers. Never on for a real event. |
| `EMAIL_DRIVER` | `mailpit` | Mail lands in the Mailpit inbox |
| `AI_PROFILE` | `dev` | `dev`: Ollama first, then Groq. `demo`: Bedrock and Groq first. |
| `GROQ_API_KEY`, `AWS_*`, `OLLAMA_BASE_URL` | empty | Model providers |
| `REAL_SENDS` | `off` | `on` sends real messages, but only to `DEMO_REAL_RECIPIENTS` |

## 2. Start services and the database

```sh
docker compose up -d db mailpit
pnpm install
pnpm db:migrate
pnpm db:seed
```

- `docker compose` starts Postgres 17 with pgvector on port 5432, and Mailpit (SMTP on port 1025, web inbox at http://localhost:8025).
- `pnpm db:seed` creates the demo world, including the HackNova 2026 hackathon.
- Optional: `pnpm ai:models` downloads the local embedding model (`bge-small-en-v1.5`) ahead of time.

## 3. Run

Use two terminals:

```sh
pnpm dev      # web app at http://localhost:3000
pnpm worker   # agents, cron jobs, daily briefing, outbox delivery
```

Check the app: `curl http://localhost:3000/api/health` should return `{"ok":true,...}`.

With `DEMO_MODE=true`, the login page offers demo personas. Open `/console` as the event head to see the Live Stage.

## 4. Play a scenario

```sh
pnpm demo:reset                    # reseed both demo events, clock set to 10:30 IST on HackNova day 1
pnpm demo:trigger speaker_cancel   # or lunch_confusion, volunteer_noshow, queue_spike, budget_breach, projector_voice_note
```

`pnpm demo:reset --real-time` keeps the real clock. Watch the Live Stage: agents wake, proposals arrive, and T2 and T3 proposals wait in **Approvals**. Approve one and the executor applies it. Messages appear in Mailpit, or in the outbox as `delivered_mock`.

## Checks

| Command | What it runs |
|---|---|
| `pnpm typecheck` | `next typegen` and `tsc --noEmit` |
| `pnpm lint` | ESLint |
| `pnpm format:check` | Prettier |
| `pnpm test` | Unit tests (Vitest) |
| `pnpm test:db` | Database integration tests. It creates its own `<db>_test` database next to `DATABASE_URL`. |
| `pnpm test:e2e` | Playwright end-to-end tests |
| `pnpm test:showcase-net` | Showcase build: fails on any third-party request |
| `pnpm evals` | Helpdesk grounding, refusal, injection and retrieval evals (needs model access) |
| `pnpm ai:smoke` | Calls every configured model provider once |
| `pnpm build` | Production build |

## Useful extras

- **Row counts.** `pnpm db:counts` shows rows per table and per event.
- **Knowledge base.** `pnpm kb:index` re-indexes the knowledge base.
- **Telegram.** Set `TELEGRAM_BOT_TOKEN` and, in exactly one worker, `TELEGRAM_POLLING=on`. Telegram allows only one poller per token.
- **WhatsApp.**
  - Set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` and `TWILIO_WHATSAPP_FROM`.
  - Point the sandbox webhook at `POST /api/channels/twilio/whatsapp` on a public URL.
  - The route checks Twilio's signature against `APP_URL`.
- **Cloud.** `docker compose --profile cloud up -d --build` runs the app, worker and Caddy (HTTPS for `DOMAIN`) on one server.
