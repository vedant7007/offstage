# Contributing to OFFSTAGE

Thanks for taking the time to help. Bug reports, fixes, docs and new event templates are all welcome.

## Setup

You need Node 24 (see `.nvmrc`) and pnpm 11 (`corepack enable` picks up the pinned version).

```sh
pnpm install
NEXT_PUBLIC_SHOWCASE=1 pnpm build && pnpm start   # zero-setup showcase, no database or keys
```

For the full stack (Docker, Postgres, worker, agents) follow [docs/running-locally.md](docs/running-locally.md).

## Before you open a pull request

Run the same checks CI runs:

```sh
pnpm typecheck
pnpm lint
pnpm format:check     # pnpm format fixes it
pnpm test
NEXT_PUBLIC_SHOWCASE=1 pnpm build
```

If you touch the database, executors or channels, also run `pnpm test:db` (needs `docker compose up -d db`). For UI changes, `pnpm test:e2e` runs the Playwright suite against the full stack.

## Ground rules

- **Agents propose, policy decides, humans approve, code executes.** Agent code never writes to domain tables; it files proposals through `actions.propose()`. See [docs/policy.md](docs/policy.md).
- **Contracts first.** Shared types come from the zod schemas in `src/contracts/`. Do not redefine them locally.
- **Validate and authorize.** Every route calls the authz helper and parses its input with zod. Never log personal data or put secrets in code.
- **Time.** Store UTC, display Asia/Kolkata, through `src/lib/time.ts`.
- **Accessibility.** UI meets WCAG 2.2 AA, keeps a visible focus ring and respects reduced motion.
- **Showcase mode.** Anything showcase-only sits behind `isShowcase()` from `src/showcase/flag.ts` and must not change real mode.

## Commits and pull requests

- Branch from `main` with a short topic name, for example `fix/helpdesk-citations`.
- Use [Conventional Commits](https://www.conventionalcommits.org): `feat(scope): ...`, `fix(scope): ...`, `docs: ...`, `test(scope): ...`, `chore: ...`.
- Keep pull requests small and focused. Fill in the template, link the issue, and add screenshots for UI changes.
- Rebase on `main` before asking for review. CI must be green before merge.

## Reporting bugs and security issues

Open an issue with the bug report template. For security problems, do not open a public issue: follow [SECURITY.md](SECURITY.md).

By contributing you agree that your work is released under the [MIT License](LICENSE) and that you follow the [Code of Conduct](CODE_OF_CONDUCT.md).
