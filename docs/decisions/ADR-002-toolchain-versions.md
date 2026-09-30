# ADR-002: Toolchain versions at project start

- Date: 2026-09-30
- Status: Accepted
- Owner: Abhinav

## Context

The blueprint and the build prompts name tools, not versions, and say to verify everything at setup. A few of the newest releases do not yet work together, and one named version (Node 22) is no longer the active LTS.

## Decision

Versions checked with `npm view`, the Node.js release index and GitHub releases on 2026-09-30:

| Tool | Chosen | Why not the newest |
|---|---|---|
| Node | 24 LTS (Krypton) | Blueprint and prompt say 22. Node 24 is the active LTS; 22 is in maintenance. pg-boss 12 needs 22.12 or newer, so both work. |
| Next.js | 16.3.7 | Latest stable. |
| React | 19.2.8 | Version pinned by `create-next-app@16.3.7`. React 19.3.0 exists; we follow Next's template. |
| TypeScript | 5.9.3 | TypeScript 7.0 (native port) is latest, but `typescript-eslint` 8.x supports `>=4.8.4 <6.1.0` and Next's template ships `^5`. |
| ESLint | 9.39.5 | ESLint 10 is out, but `eslint-plugin-react` and `eslint-plugin-jsx-a11y` (pulled in by `eslint-config-next`) only declare support up to ESLint 9. |
| Tailwind CSS | 4.3.3 | Latest. |
| shadcn | 4.21.0, style `radix-nova` | shadcn 4 asks for a primitive library (Base UI, Radix or React Aria). Radix chosen as the most documented option. Thanishka owns `src/components/ui` and can re-run `shadcn init --force -b base` if she prefers Base UI. |
| Drizzle ORM / Kit | 0.45.3 / 0.31.11 | Latest stable (1.0 is still RC). |
| postgres.js | 3.4.9 | Latest. |
| pg-boss | 12.35.0 | Latest. Named export `PgBoss`. |
| zod | 4.6.5 | Latest. |
| pino | 10.3.1 | Latest. |
| Vitest | 5.0.2 | Latest. |
| pnpm | 11.10.0 | Latest. Build script approvals live in `pnpm-workspace.yaml` under `allowBuilds`. |
| Postgres image | `pgvector/pgvector:pg17` | As in the blueprint. |

## Consequences

- Revisit TypeScript 7 and ESLint 10 once `typescript-eslint` and the React ESLint plugins support them.
- `pnpm typecheck` runs `next typegen` first, because Next 16 generates route types such as `LayoutProps`.
