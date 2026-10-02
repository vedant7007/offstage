# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-10-02

First public release. OFFSTAGE won 1st Prize at AIML Hacks 2026 (problem GENAI-25, Multi-Agent Event Management System).

### Added

- Fourteen specialised agents (Commander, Planner, Finance, Sponsorship, Marketing, Registrar, Scheduler, Speaker Liaison, Crew Chief, Logistics, Herald, Helpdesk, Radar, Chronicler) on one shared runtime, each paired with a human lead.
- Proposal pipeline: agents file typed proposals, a policy engine in code assigns tiers T0 to T3, humans approve, and deterministic executors apply each proposal in one database transaction with an audit log and outbox.
- Emergency path: medical, safety, fire and harassment reports skip the agents and alert every lead and the public status page.
- Organizer console with the Live Stage agent graph, ripple view, glass box run traces, what-if sandbox, daily briefing and close-out report with every number taken from SQL.
- Voice Commander that answers from live state and turns requests into proposals, never approvals.
- Helpdesk with hybrid vector and full-text retrieval, citations or escalation, and a prompt-injection guard.
- Volunteer crew app with offline check-in of Ed25519 signed QR tickets, attendee portal and public event pages.
- Model router over Groq, Amazon Bedrock and Ollama with a rules-only fallback, token budgets and a daily spend cap.
- Delivery through WhatsApp and SMS (Twilio), Telegram, email and in-app notifications, with a recipient allowlist and mock drivers.
- Deterministic schedule and crew solvers, an eval harness, unit, database integration and Playwright end-to-end tests.
- Hosted showcase (`NEXT_PUBLIC_SHOWCASE=1`): every screen replays recorded, PII-scrubbed runs in the browser with no database, secrets or third-party calls, live at [offstage-live.vercel.app](https://offstage-live.vercel.app).
- Public repository files: README, architecture, agents, policy, showcase and local setup guides, contributing guide, code of conduct, security policy, issue and pull request templates, Dependabot and a CI workflow that needs no secrets.

[Unreleased]: https://github.com/vedant7007/offstage/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/vedant7007/offstage/releases/tag/v1.0.0
