# Security policy

## Supported versions

| Version | Supported |
| ------- | --------- |
| 1.x     | Yes       |
| < 1.0   | No        |

## Reporting a vulnerability

Please report security problems privately by email to [vedantidlgave16@gmail.com](mailto:vedantidlgave16@gmail.com?subject=OFFSTAGE%20security). Do not open a public issue or pull request for them.

Include what you found, the steps to reproduce it, the affected version or commit, and the impact you expect. We aim to acknowledge a report within 3 days and to share a fix plan within 14 days. We will credit you in the changelog unless you ask us not to.

## Scope

In scope:

- Authorization bypass: reaching another role's or another event's data, or skipping the authz helper on a route.
- Policy bypass: an agent or request that executes an action without the approvals its tier requires, or writes to domain tables outside the executors.
- Prompt injection that makes an agent leak data, act outside its tools, or get past the guard.
- Ticket forgery or replay against the Ed25519 signed QR check-in.
- Exposure of personal data (attendee email or phone) in logs, API responses or the showcase fixtures.
- Spoofed requests to the Twilio inbound webhook (it checks the request signature).
- The showcase build making network calls to any third-party host or serving server data.

Out of scope:

- The hosted showcase at offstage-live.vercel.app being a static demo with no real data or accounts.
- Findings that need a compromised machine, a malicious `.env`, or `DEMO_MODE=true` (demo personas are a documented development feature and must never run for a real event).
- Denial of service by volume, missing hardening headers with no demonstrated impact, and vulnerabilities in third-party services themselves.
