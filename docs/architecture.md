# Architecture

OFFSTAGE is one Next.js app, one Node worker and one Postgres database. Agents never write to domain tables: they call `actions.propose()`, the policy engine assigns a risk tier, humans approve when the tier requires it, and a deterministic executor applies the change in a single transaction.

## System

```mermaid
flowchart TB
  subgraph Clients
    O["Organizer and leads: /console"]
    V["Volunteers: /crew (PWA, offline check-in)"]
    AT["Attendees: /me, /e/slug, /e/slug/status"]
  end

  subgraph Web["Next.js app"]
    R["Route handlers<br/>authz helper + zod on every input"]
    ACT["actions: propose, approve, reject, edit, undo"]
    POL["Policy engine: assignTier()"]
    EX["Executors"]
    SSE["SSE: console stream, public status stream"]
  end

  subgraph DB["Postgres 17 + pgvector"]
    DOM[("Domain tables")]
    PR[("proposals, proposal_approvals")]
    AUD[("audit_log, domain_events")]
    OB[("outbox, notifications")]
    KB[("kb_chunks: vector(384) HNSW + tsv")]
    PB[("pg-boss queues")]
    RUNS[("agent runs and steps")]
  end

  subgraph Worker["Worker"]
    DE["domain-event queue<br/>dispatcher + KB indexer"]
    CR["Agent cron queues (IST)<br/>daily-briefing 07:00"]
    RT["Agent runtime: 14 configs<br/>schedule and crew solvers"]
    DR["Outbox drain (every 3 s)"]
    TGP["Telegram long polling"]
  end

  subgraph Router["Model router: smart, fast, guard, stt"]
    G["Groq"]
    B["Bedrock Nova 2 Lite"]
    OL["Ollama qwen3:4b-instruct"]
    RU["Rules-only"]
  end

  subgraph Channels
    WA["WhatsApp: Twilio"]
    SMS["SMS: Twilio"]
    TG["Telegram Bot API"]
    EM["Email: SMTP (Mailpit, SES)"]
    IA["In-app"]
  end

  O & V & AT --> R --> ACT --> POL --> EX
  EX --> DOM & AUD & OB
  ACT --> PR
  AUD -- "pg_notify on commit" --> SSE
  AUD -- "pg_notify on commit" --> DE
  PB --> DE & CR
  DE & CR --> RT
  RT -- "proposals" --> ACT
  RT --> RUNS
  RT <--> Router
  RT --> KB
  OB --> DR --> WA & SMS & TG & EM
  EX -- "in-app rows" --> IA
  TGP -- "inbound questions" --> AUD
```

Key files:

| Piece | Where |
|---|---|
| Agent configs | `src/agents/<name>/config.ts`, registered in `src/agents/index.ts` |
| Agent runtime and wake | `src/agents/runtime/` |
| Proposal lifecycle | `src/server/actions/` (`propose.ts`, `decide.ts`, `execute.ts`, `preconditions.ts`) |
| Executors | `src/server/actions/executors/` |
| Policy engine | `src/server/policy/tiers.ts` |
| Event bus | `src/server/events/bus.ts` (`publish()`, `audit()`) |
| SSE helper | `src/server/sse.ts` |
| Channels | `src/server/channels/` |
| Model router | `src/ai/router/` |
| Guard | `src/ai/guard/` |
| Retrieval | `src/ai/rag/` |
| Worker | `worker/index.ts`, `worker/jobs/` |

## A proposal from agent to message

```mermaid
sequenceDiagram
  autonumber
  participant W as Worker (pg-boss)
  participant A as Agent runtime
  participant P as actions.propose
  participant T as Policy engine
  participant DB as Postgres
  participant H as Human lead
  participant X as Executor
  participant O as Outbox drain
  participant C as Channel

  W->>A: wake(agent) on a domain event or cron
  A->>A: read tools, solver, model via router
  A->>P: proposal (kind, payload, idempotency key)
  P->>P: zod validate, authz, idempotency check
  P->>X: describe(): diff, impact, preconditions
  P->>T: assignTier(kind, payload, impact, settings)
  T-->>P: tier, required approvals, reasons
  P->>DB: insert proposal, publish proposal.created
  alt T0, or T1 with auto-approve
    P->>X: execute now (T1 gets a 10 minute undo)
  else T2 or T3
    DB-->>H: approval card over SSE
    H->>DB: approve (row lock, diffHash check, two-person rule on T3)
    DB->>X: execute when approvals reach the requirement
  end
  X->>DB: one transaction: recheck preconditions, apply change, audit_log, outbox rows
  X->>DB: publish proposal.executed + domain events
  O->>DB: claim due rows (FOR UPDATE SKIP LOCKED)
  O->>C: send if allowlisted and real sends are on, else mark delivered_mock
```

Guarantees along the way:

- **Idempotency.** `(eventId, idempotencyKey)` is unique; a repeat returns `duplicate`.
- **Impact cannot be understated.** The executor's `describe()` computes impact on the server. An agent may claim more impact, never less.
- **Stale approvals fail safe.** Proposals expire after 30 minutes by default. At execution, precondition versions are rechecked and a mismatch marks the proposal `stale`.
- **All or nothing.** A `plan.bundle` executes every child in the same transaction.
- **Messages are throttled at send time.** Quiet hours 22:00 to 07:00 IST (only a human-approved emergency skips them), a per-person hourly cap, and a 24 hour dedupe hash.
- **Retries.** The outbox drain retries up to 3 times with a growing backoff.

## Live updates over SSE

```mermaid
sequenceDiagram
  participant X as Executor or agent run
  participant DB as Postgres
  participant L as LISTEN connection (one per process)
  participant S as SSE route
  participant B as Browser

  B->>S: GET /api/events/{eventId}/stream (authz: event.read)
  S-->>B: retry 5000, metrics snapshot
  X->>DB: insert domain_events + pg_notify('sutradhar_events') in the same transaction
  DB-->>L: notification after commit
  L->>S: fan out by eventId
  S-->>B: domain_event, proposal, agent_run, agent_step, outbox messages
  loop every 25 s
    S-->>B: heartbeat
  end
  loop every 30 s
    S-->>B: metrics
  end
```

- Notification channels: `sutradhar_events` (domain events), `sutradhar_runs` (agent runs and steps), `sutradhar_outbox` (delivery updates).
- The public status page uses `GET /api/public/events/{slug}/status/stream`, with no login. It sends a debounced `status` message on session and announcement events, plus a tick every 60 seconds.
- If LISTEN is unavailable, pages fall back to polling the overview endpoint.
- In the showcase build, the same `StreamMessage` objects come from recorded fixtures instead (see [showcase-mode.md](showcase-mode.md)).

## Model router

```mermaid
flowchart LR
  subgraph demo["AI_PROFILE=demo"]
    S1["smart"] --> B1["Bedrock Nova 2 Lite"] --> G1["Groq gpt-oss-120b"] --> O1["Ollama"] --> R1["rules-only"]
    F1["fast"] --> G2["Groq gpt-oss-20b"] --> B2["Bedrock Nova 2 Lite"] --> O2["Ollama"] --> R2["rules-only"]
  end
  subgraph dev["AI_PROFILE=dev (default)"]
    S2["smart and fast"] --> O3["Ollama qwen3:4b-instruct"] --> G3["Groq"] --> R3["rules-only"]
  end
```

- **Tiers.** `smart` and `fast` for agents. `guard` is Groq Prompt Guard 2, with regex heuristics first. `stt` is Groq Whisper large v3 turbo.
- **Overrides.** Any tier's chain can be overridden with `AI_CHAIN_<TIER>`. A provider is skipped when it has no credentials, or when Ollama does not answer its probe.
- **Fallback.** A 429, 5xx or timeout opens a 60 second circuit for that provider and the router moves on. A schema failure is retried once with the error, then moves on.
- **Groq rate limits.** A token bucket per model tracks RPM, TPM and tokens per day, so Groq is skipped before it would return a 429.
- **Budgets.** 30,000 tokens per agent run, USD 3 per IST day, and 2 concurrent runs per agent (all configurable). When the daily cap is reached, non-critical agents pause and critical ones continue on Ollama.
- **Untrusted text.** It is screened by the guard, wrapped in randomised `<untrusted-...>` tags, and only ever placed in messages, never in instructions.
