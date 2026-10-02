## What and why

<!-- One or two sentences. Link the issue: Closes #123 -->

## How to verify

<!-- Steps a reviewer can follow, and screenshots for UI changes (desktop and 390 px phone). -->

## Checklist

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm format:check` and `pnpm test` pass
- [ ] `NEXT_PUBLIC_SHOWCASE=1 pnpm build` passes
- [ ] `pnpm test:db` passes if I touched the database, executors or channels
- [ ] Agents still only propose; nothing writes to domain tables outside the executors
- [ ] New routes call the authz helper and validate input with zod
- [ ] No secrets or personal data in code, logs, fixtures or screenshots
- [ ] UI meets WCAG 2.2 AA (contrast, visible focus, keyboard, reduced motion)
- [ ] Commit messages follow Conventional Commits
