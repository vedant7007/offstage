# Sutradhar

Tell Sutradhar about your event. It builds the team, runs the show, and asks you only when it matters.

Agents propose. Policy decides. Humans approve. Code executes.

- Product spec: [docs/00-BLUEPRINT.md](docs/00-BLUEPRINT.md)
- Decisions: [docs/decisions/](docs/decisions/)

## Prerequisites

- Node 24 LTS (`.nvmrc`), pnpm 11 (`npm i -g pnpm@11`), Docker Desktop
- After cloning, once: `git config core.hooksPath .githooks`

## Setup in five commands

```sh
cp .env.example .env && pnpm keys        # paste the printed keys into .env
docker compose up -d db mailpit          # Postgres 17 + pgvector, Mailpit
pnpm install
pnpm db:migrate && pnpm db:seed
pnpm dev                                 # http://localhost:3000
```

Check it: `curl http://localhost:3000/api/health` returns `{"ok":true,...}`. Mail sent locally shows up at http://localhost:8025.

Run the background worker in a second terminal with `pnpm worker`.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Web app with hot reload |
| `pnpm worker` | Background worker (pg-boss jobs) with reload |
| `pnpm typecheck` / `pnpm lint` / `pnpm test` | What CI runs, plus `pnpm format:check` and `pnpm build` |
| `pnpm format` | Prettier over the repo |
| `pnpm db:generate` | Create a migration from schema changes (Abhinav only) |
| `pnpm db:migrate` | Apply migrations |
| `pnpm db:seed` | Seed the demo world |
| `pnpm demo:reset` | Truncate and reseed (target under 30 seconds) |
| `pnpm demo:trigger <scenario>` | `speaker_cancel`, `lunch_confusion`, `volunteer_noshow`, `queue_spike`, `budget_breach`, `projector_voice_note` |
| `pnpm keys` | Print fresh `AUTH_SECRET`, ticket signing keys and PII key |

## Layout

```
src/contracts   zod schemas and fixtures shared by everyone
src/db          Drizzle schema, migrations, seed, demo reset
src/server      auth, authz, policy, proposals, services, channels
src/ai src/agents src/solvers   agent runtime
src/app         Next.js App Router (public, attendee, crew, console, api)
worker/         background jobs
tests/          unit, e2e, evals
```

## Cloud (one server)

```sh
docker compose --profile cloud up -d --build
docker compose --profile cloud run --rm app pnpm db:migrate
```

Caddy terminates HTTPS for `DOMAIN` from `.env`. Full deploy steps land with the deploy checkpoint.
