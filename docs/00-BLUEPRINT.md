# SUTRADHAR: Product Blueprint (single source of truth, v2)

> Every teammate reads this file fully before writing code.
> Problem statement: **GENAI-25, Multi-Agent Event Management System** (AIML Hacks, KG Reddy College, 36-hour build).
> Team: **Vedant** (Commander, agent runtime, console), **Abhinav** (platform, data, security, channels, deploy), **Thanishka** (design system, public + attendee + crew surfaces, pitch).
> Working name: **Sutradhar** ("the one who holds the strings", the stage manager of Indian theatre). Codename in code: `sutradhar`.

---

## 1. What we are building

**An AI event operations team in a box.** The organizer tells the Commander what they know about their event. The Commander interviews them like a veteran event manager, understands the event completely, then lays out the team of specialised agents this event needs, each paired with one human lead. The agents plan, market, register, schedule, staff, inform, support, watch and close the event, collaborating through one shared source of truth. Humans steer and approve anything that touches people, money, or reputation. Everything else runs on its own with an undo.

**Works for any event type:** college fest, hackathon, workshop, conference, charity drive, marathon, commercial product launch, wedding or personal celebration, community meetup, school function. Event type is a template that picks default agents, checklists, FAQs and approval rules.

**One line pitch:** "Tell Sutradhar about your event. It builds the team, runs the show, and asks you only when it matters."

**The law of the system (goes on a slide):** Agents propose. Policy decides. Humans approve. Code executes.

---

## 2. Why this is needed (research, on the ground)

1. Events run on WhatsApp threads, spreadsheets and favours. One missed update snowballs.
2. The same 30 questions get answered 500 times by tired humans.
3. Cancellations and changes have cascades (rooms, volunteers, announcements, helpdesk answers, sponsor deliverables) and humans update half of them.
4. Volunteers get unclear shifts, no-shows go unnoticed, one person burns out.
5. Money is tracked in a notebook; overspend is discovered after the event.
6. Sponsor follow-ups are forgotten; marketing has no idea what worked.
7. Venue WiFi dies exactly at peak check-in.
8. Indian specifics no software handles: faculty/HOD approval, OD attendance letters, participation certificates that get faked.
9. The post-event report, sponsor report and "what went wrong" note never get written, so next year repeats it.

**Existing tools:** Cvent, Bizzabo, Whova, EventHex are enterprise priced (lakhs per event), corporate-conference shaped, and add AI to isolated workflows (a copilot here, matchmaking there), not a coordinated team acting on shared state. None handle Indian college realities. Generic chatbots hallucinate event facts.

---

## 3. How it works, start to finish (the user journey)

1. **Intake.** Organizer opens Sutradhar, picks an event type template (or "other"), and chats with the Commander: "2-day tech fest, ~1500 people, 24 October, college auditorium and 3 labs, budget 3 lakh, faculty must approve official notices."
2. **Interview.** Commander asks only what it needs, in order of importance: fixed dates? paid or free? parallel tracks? sponsors expected? food? accommodation for speakers? volunteers available? channels attendees use? It stops when it has enough.
3. **Event Plan.** Commander produces a plan: timeline with milestones, budget split by category, risk list, and the **agent org chart** for this event (which agents, what each owns, which human lead). Organizer edits and approves. Agents spin up.
4. **Run-up.** Agents work their domains. Human leads see their agent's proposals and a **daily briefing** each morning. The organizer sees the whole picture and can run **what-if** scenarios.
5. **Event day.** Agents handle load, check-ins, incidents, cancellations, and re-plan on the fly. Emergencies go straight to humans.
6. **Close.** Agents produce the report, sponsor report, certificates, OD lists, settlement list, feedback summary, and save lessons for the next event.

---

## 4. The agent team

Every agent runs on **one shared agent runtime** (Vedant builds it once). An agent is a config: name, purpose, system prompt, tool list, model tier, human lead role, risk defaults, triggers, fallback behaviour. Adding an agent is adding a config file plus its tools. This is how 14 agents are feasible in 36 hours.

| # | Agent | Human lead | Owns | Key tools | Fallback if models fail |
|---|---|---|---|---|---|
| 1 | **Commander** | Event head | Intake interview, event plan, agent org chart, daily briefing, what-if simulation, conflict resolution between agents, replanning on any big change, organizer command bar | plan.*, read everything, wake any agent | Rules-based briefing from metrics; intake falls back to a structured form |
| 2 | **Planner** | Event head | Timeline, milestones, dependencies, overdue and at-risk items | plan.milestone.* | Static checklist from template |
| 3 | **Finance** | Treasurer | Budget by category, expense and income ledger, quote comparison, overspend warnings, sponsor money tracking, settlement list. **Never pays; records and warns** | finance.* | Ledger still works manually; warnings are rule-based |
| 4 | **Sponsorship** | Sponsorship lead | Sponsor prospect list, pitch mail drafts, follow-up tracking, deliverables checklist, post-event sponsor report | sponsor.* (draft only) | Manual CRM table |
| 5 | **Marketing** | Marketing lead | Content calendar, post drafts per platform, registration funnel vs target, push suggestions ("40% behind, push these 3 colleges") | marketing.* (draft only) | Funnel numbers still shown from SQL |
| 6 | **Registrar** | Registrations lead | Forms, OTP, tickets, capacity, waitlist, duplicates, teams, refund list, live numbers | registration.* | All registration flows are deterministic code; agent only handles judgement (duplicates, waitlist promotion order) |
| 7 | **Scheduler** | Program lead | Sessions, rooms, speakers, clash detection, replanning after cancellations, running-late shifts. **Deterministic solver validates; LLM chooses and explains** | schedule.* + solver | Solver alone proposes options |
| 8 | **Speaker Liaison** | Program lead | Speaker confirmations, requirements (AV, travel, stay), session details, reminders, day-of coordination | speaker.* | Reminder schedule runs as cron |
| 9 | **Crew Chief** | Volunteer lead | Recruitment forms, shifts by skill and availability, fairness, no-shows, breaks, briefings, thank-yous, hours certificates | crew.* + solver | Solver alone assigns |
| 10 | **Logistics** | Logistics lead | Venue and room readiness checklists, AV, food counts (from registrations and food prefs), vendor timings, inventory (badges, kits, swag) | logistics.* | Checklists are template driven |
| 11 | **Herald** | Comms lead | Announcements to the right segment on the right channel, reminder schedule (T-7, T-1, morning-of, 15 min before session), quiet hours, dedupe. Drafts only; sends after approval | comms.* | Pre-written templates sent by cron after approval |
| 12 | **Helpdesk** | Comms lead | Answers attendee, volunteer and speaker questions from event documents and live state with citations; escalates when unsure; in-app, Telegram, WhatsApp, email | helpdesk.escalate | Cached top-FAQ answers + escalation |
| 13 | **Radar** | Ops lead | Watches check-in rate, question spikes (Confusion Radar), missed shifts, incidents, voice-note reports; raises incidents with proposed fixes | incident.*, suggests to Commander | Threshold rules without LLM summaries |
| 14 | **Chronicler** | Event head | Final report, sponsor report, feedback summary, OD lists, certificates, settlement list, honest retro, lessons saved to playbook | certificates.*, od.*, playbook.* | Report from SQL templates without narrative |

### The core loop

```
Trigger (domain event, schedule tick, organizer command)
  -> Commander decides which agents to wake (or a single agent wakes on its own trigger)
  -> Agent reads state through READ tools, calls solvers, returns Action Proposals
  -> Commander merges related proposals into one Plan, detects conflicts, computes Ripple (impact)
  -> Policy engine (code, not prompt) assigns risk tier and required approvals
  -> T0/T1 auto-execute (T1 with undo window); T2/T3 wait in the Approval Queue of the agent's human lead
  -> Deterministic executor applies the change in a DB transaction, emits new domain events
  -> Downstream agents react (KB re-index, Herald drafts comms, Radar updates)
  -> Every step traced: agent, model, tool calls, tokens, cost, latency, approver
```

### Risk tiers

| Tier | Meaning | Examples | Approval |
|---|---|---|---|
| T0 | Internal record only, nobody notified | Flag duplicate, log incident, update milestone status | Auto |
| T1 | One person affected, reversible, not public | Assign one shift, reply to one helpdesk escalation, add a task | Auto with 10-minute undo, visible in timeline |
| T2 | Many people, or public, or any money record | Move a session, send to a segment, promote 10 from waitlist, record an expense | The agent's human lead (or any organizer) |
| T3 | Irreversible, official, bulk, sensitive data, large money | Broadcast to all, cancel a session with 50+ attendees, issue certificates, OD list, export or delete personal data, expense above a configured threshold | 2 approvals; owner or faculty approver required when configured |

Emergency category (medical, safety, fire, harassment): agents never act. Loud alert to all leads, agents only help draft.

---

## 5. Features and use cases (plain language)

### Templates (multi-event-type support)
- Templates: `hackathon`, `tech_fest`, `workshop`, `conference`, `cultural_night`, `charity_drive`, `marathon`, `product_launch`, `wedding`, `community_meetup`, `school_function`, `other`.
- A template sets: default agents on/off, checklist milestones, FAQ seeds, comms tone, approval thresholds (e.g. wedding: no OD lists, faculty tier off; charity: donation ledger on; commercial: sponsor deliverables on).
- Templates are JSON in `src/templates/`. Lessons from past events attach to a template.

### Before the event
- Describe the event in a paragraph, answer the Commander's questions, get a full plan, budget split and agent team.
- Dated checklist that shifts when a date slips; overdue and at-risk items surfaced in the daily briefing.
- Budget by category with live spend; warning before any category crosses 80% and block-until-approved at 100%.
- Paste vendor quotes; Finance builds a comparison table.
- Sponsor prospect list with fit reasons, pitch mail drafts in your voice, follow-up reminders, deliverables tracker.
- Content calendar with post drafts per platform; daily registrations vs target with push suggestions.
- Registration page with OTP verification, capacity, waitlist, team formation, food and accessibility preferences, consent notice.
- Schedule builder with instant clash detection (room, speaker, capacity, attendee overlap).
- Speaker confirmations and requirement collection through a form link; reminders automatically.
- Volunteer recruitment form, skill tagging, fair auto-assignment, briefing documents per role.
- Logistics checklists per room and vendor; food counts from registrations.
- Upload rulebook, FAQ, venue notes, menu; helpdesk answers from them with citations.
- Public event page (no login): schedule, venue, FAQ, live updates, registration button.

### During the event
- Offline-first QR check-in on volunteers' phones; syncs when back online; duplicates flagged.
- Speaker cancels: Ripple view shows everything affected; Scheduler offers solver-verified options; lead approves; everyone affected is told on their channel; helpdesk answers update themselves.
- Session running late: host taps "running 15 min late"; downstream proposals appear.
- Volunteer no-show: replacement proposed within a minute; burnout guard prevents over-assignment.
- Confusion Radar: 12 people ask where lunch is within 10 minutes; incident created; announcement and signage task proposed.
- Hinglish voice note from a volunteer ("Lab 204 ka projector kaam nahi kar raha"): transcribed, incident created, tech volunteer assigned.
- Crowd at registration desk: Radar proposes opening a second desk and reassigning two volunteers.
- Emergency: straight to humans with a loud alert.
- Organizer command bar: "Move Priya's workshop to 3pm and inform everyone" becomes a plan.
- Reminders: 15 minutes before a session to its attendees, shift reminders to volunteers, speaker "you're on in 30".
- Live public status page: delays, room changes, announcements.

### After the event
- Report with numbers only from the database: attendance, sessions, helpdesk stats, incidents, volunteer hours, money in and out.
- Sponsor deliverables report.
- OD attendance letters per department, year and section, ready for faculty signature.
- Verifiable certificates (attendee, winner, volunteer with hours) with a public verify page.
- Feedback collection and summary with quotes linked to responses.
- Settlement list: who is owed, who owes, refunds.
- Honest retro from incidents and escalations; lessons saved and shown by the Commander at the next similar event.

### Commander extras
- **Daily briefing** every morning (and on demand): what happened yesterday, what is due today, what is at risk, decisions waiting, money status. Sent to each lead scoped to their domain, full version to the head.
- **What-if simulator**: "what if 30% more people show up", "what if it rains", "what if the main speaker cancels", "what if budget drops by 50k". Commander asks the relevant agents to re-plan in a sandbox and shows impact and recommended changes without touching real state.
- **Agent org chart** view: each agent, its human lead, health, last activity, pending approvals, cost.

### Channels (how we demonstrate outreach)
All channels behind one adapter interface. Every outbound message goes through approval, per-person hourly cap, dedupe and quiet hours.
- **In-app** (attendee portal and crew PWA), always on.
- **Email**: Mailpit locally (see every mail in a web inbox), Amazon SES in cloud (on credits, sandbox needs verified recipients; verify team emails) or Resend free tier. Used for OTP, tickets, reminders, sponsor drafts.
- **Telegram** via grammY: helpdesk chat, volunteer bot (shift reminders, voice-note incidents), announcements to a channel. Free and instant; primary live-demo channel.
- **WhatsApp** via Twilio Sandbox for WhatsApp: judges' phones join the sandbox with the join code, then receive an announcement live. Sandbox limits: only joined numbers, session rules; fine for demo. Adapter is real so production senders plug in later.
- **SMS** via Twilio trial: only verified numbers; used for one demo reminder.
- **Public status page**: no login, cached, survives load.

---

## 6. Loopholes and how each is closed

| # | Loophole | Fix | Owner |
|---|---|---|---|
| 1 | Fake or bot registrations | Email OTP, rate limits per IP and email, Cloudflare Turnstile on public forms | Abhinav |
| 2 | Duplicate registrations | Normalised email and phone, fuzzy name+college; Registrar flags, human merges | Abhinav + Vedant |
| 3 | Waitlist seat race | Transactional promotion with row lock on capacity | Abhinav |
| 4 | Two agents editing the same thing | All writes via proposals; version checks; Commander merges conflicting proposals | Abhinav + Vedant |
| 5 | Approving stale proposals | Expiry (30 min) + precondition re-check at execution; stale -> re-plan | Abhinav |
| 6 | Prompt injection via chat, uploaded docs, voice notes, sponsor replies | Guard classifier + heuristics; untrusted text wrapped as data; attendee-path tools read-only on public data + own record; structured outputs | Vedant |
| 7 | Hallucinated facts and numbers | Citations or refusal; report numbers only from SQL; agents cite evidence ids in every proposal | Vedant |
| 8 | Money mistakes | Finance never pays; every expense record is T2, above threshold T3; category caps | Abhinav (ledger) + Vedant (agent) |
| 9 | Unapproved outbound messages or posts | Herald, Sponsorship, Marketing draft only; send needs approval; no social posting API in scope | Vedant + Abhinav |
| 10 | Notification spam | Per-person hourly cap, dedupe hash, quiet hours 22:00 to 07:00 IST unless human-flagged emergency | Abhinav |
| 11 | PII leaking to models or logs | Minimal fields and IDs in prompts, masked phone/email, pino redaction, attendee sees only own record | Vedant + Abhinav |
| 12 | PII at rest and consent (DPDP Act 2023, Rules 2025) | Plain-language notice with purposes, consent record, delete-my-data flow, retention purge 90 days after event unless certificate requested, phone/email encrypted at app level | Abhinav + Thanishka (copy) |
| 13 | Minors | "I am 18 or older" or guardian consent confirmation; no DOB collected | Abhinav + Thanishka |
| 14 | Forged tickets | Ed25519 signed QR, event key, revocation list synced to scanners | Abhinav |
| 15 | Shared QR screenshots | First scan wins; second shows "already checked in at 10:42 by Ravi" | Abhinav |
| 16 | Fake certificates | Public verify page by ID, revocation | Abhinav |
| 17 | Runaway agents, cost blowup | Max steps per run, per-run and per-day token budgets, per-agent concurrency, idempotency keys, kill switch | Vedant |
| 18 | Model provider down or rate limited | Router fallback chain Groq -> Bedrock -> Ollama -> rules-only; circuit breaker; cached FAQs | Vedant |
| 19 | Venue WiFi down | Offline scanner, offline schedule and shifts in PWA, local model on laptop | Abhinav + Thanishka + Vedant |
| 20 | Wrong or offensive outputs in broadcasts | Output moderation pass; human approval on all broadcasts; Telugu not claimed | Vedant |
| 21 | Account takeover, privilege escalation | OTP login, httpOnly secure cookies, CSRF, single authz helper on every route with role and event scoping, tests per role | Abhinav |
| 22 | Upload abuse | Type allowlist, 10 MB cap, extraction in worker | Abhinav |
| 23 | Accessibility | WCAG 2.2 AA | Thanishka |
| 24 | Demo fragility | Seeded world, `pnpm demo:reset` in under 30s, scripted triggers, backup video | All |
| 25 | Timezones and clock skew | UTC stored, IST displayed via one helper; scanner records device time, server reconciles | Abhinav + Thanishka |
| 26 | Judges pressing destructive buttons | `viewer` role read-only; persona switcher only in DEMO_MODE | Abhinav |
| 27 | Agent acts on the wrong event or org | Every query scoped by eventId from the actor, never from input text | Abhinav |
| 28 | What-if leaking into real state | What-if runs against a forked in-memory snapshot; proposals tagged `simulation`; executor refuses them | Vedant |

---

## 7. Security and responsible AI (OWASP LLM Top 10 mapped)

- Prompt injection: untrusted text always wrapped and labelled; guard before any model call on untrusted input; scoped tools per caller; no tool accepts another person's ID from free text.
- Sensitive info disclosure: PII minimisation; no cross-attendee data in answers; log redaction.
- Improper output handling: model output never executed or rendered as HTML; all tool args and proposals zod-validated.
- Excessive agency: no direct writes; risk tiers; approvals; kill switch per agent and global.
- Misinformation: citations or refusal; SQL-only numbers.
- Unbounded consumption: step, token, spend limits; rate limits.

Product-visible ethics page ("About our AI"): AI suggests, people decide what affects people; every automated message is labelled as drafted by the assistant and approved by a named role; minimum data, stated purpose, deleted after the event; the helpdesk says "I don't know" rather than guess; emergencies go to humans.

---

## 8. Architecture and stack

```
Attendee/Public ---> Next.js app (App Router, Node runtime, self-hosted)
Volunteer (PWA) --->   /e/[slug] public page | /me attendee | /crew PWA | /console command center | /verify
Organizer/Leads --->   route handlers + server actions -> authz -> services
                       SSE stream per event (Postgres LISTEN/NOTIFY)
                                   |
                     Postgres 17 + pgvector (domain, proposals, traces, events, pg-boss queue)
                                   |
                     Worker (Node): domain-event dispatcher -> agent runtime (14 agent configs)
                                   KB ingestion + embeddings | Radar ticks | reminder scheduler
                                   channel senders: email, telegram, whatsapp (twilio), sms (twilio)
                                   |
                     Model router (Vercel AI SDK 6): Groq gpt-oss-120b / 20b, Prompt Guard 2, Whisper turbo
                                   -> Amazon Bedrock Nova 2 Lite (fallback) -> Ollama Qwen3 on laptop (offline) -> rules-only
```

| Layer | Choice |
|---|---|
| Language | TypeScript strict, pnpm |
| Web | Next.js latest stable, React, Tailwind v4, shadcn/ui, lucide-react, Motion |
| Contracts | zod schemas in `src/contracts/` |
| DB | PostgreSQL 17 + pgvector (`pgvector/pgvector:pg17`), Drizzle ORM |
| Auth | Better Auth with email OTP (verify plugin names in docs) |
| Jobs | pg-boss (same Postgres) |
| Realtime | SSE + LISTEN/NOTIFY |
| AI | `ai` v6, `@ai-sdk/groq`, `@ai-sdk/amazon-bedrock`, `ai-sdk-ollama` |
| Embeddings | `bge-small-en-v1.5` (384 dims) via `@huggingface/transformers`, local |
| Search | Hybrid full-text + vector, reciprocal rank fusion |
| Solvers | Deterministic TS (schedule, crew assignment) |
| Channels | grammY (Telegram), Twilio SDK (WhatsApp sandbox, SMS trial), nodemailer (Mailpit local, SES or Resend cloud) |
| STT | Groq `whisper-large-v3-turbo` |
| QR / signing | `qrcode`, BarcodeDetector with zxing fallback, Ed25519 (`node:crypto`, `@noble/ed25519`) |
| PWA | Serwist |
| PDF | `@react-pdf/renderer` or `pdf-lib` |
| Tests | Vitest, Playwright, custom eval harness |
| Logs | pino with redaction |
| Deploy | Docker Compose on one AWS EC2 (Ubuntu, t3.medium or better on credits) behind Caddy; same compose on a laptop |

**Verify every version and API name from official docs or `npm view` at setup. The blueprint names tools; it does not guarantee their current API.**

### Model router tiers and budget
- `smart`: Groq `openai/gpt-oss-120b` -> Bedrock Nova 2 Lite -> Ollama Qwen3 (largest that fits 6 GB with tool calling) -> rules-only. Used by Commander, Scheduler, Chronicler, Finance.
- `fast`: Groq `openai/gpt-oss-20b` -> Nova 2 Lite -> Ollama small Qwen3. Used by the rest.
- `guard`: Groq `meta-llama/llama-prompt-guard-2-86m` (preview, may vanish) -> heuristics + fast classifier prompt.
- `stt`: Groq `whisper-large-v3-turbo`.
- Groq free tier is 30 RPM / 8K TPM / 200K TPD per org. **Upgrade the team org to Developer pay-as-you-go with a hard spend cap of $5.** Do not create multiple accounts.
- Bedrock on AWS credits: use Amazon Nova (first party). Use the correct inference profile for the region; verify in console.
- Per-day spend cap in code; when hit, non-critical agents pause, critical (Helpdesk, Radar, Registrar) continue on Ollama.

> **Update 2026-09-30:** Groq is refusing paid upgrades for now, so we stay on the free tier. Provider order is set by `AI_PROFILE` (`dev` / `demo`) and the router gets a per-provider token bucket. See `docs/decisions/ADR-001-model-access.md`. The plan above applies again once the upgrade is possible.
>
> **Update 2026-09-30 (versions):** the AI SDK is now v7 (`ai@7`), not v6. `generateObject` is deprecated in favour of `generateText` with `Output.object`. Nova 2 Lite is reached from ap-south-1 through `global.amazon.nova-2-lite-v1:0`. The local model is `qwen3:4b-instruct`, the largest Qwen3 that fits fully on the 6 GB GPU at 8k context. See `docs/decisions/ADR-003-ai-stack-versions.md`.

---

## 9. Repository layout and ownership

Repo: `github.com/vedant7007/sutradhar`. Change the name here if you rename.

```
sutradhar/
  README.md
  docs/00-BLUEPRINT.md  docs/decisions/  docs/demo-script.md
  docker-compose.yml  Caddyfile  .env.example  package.json  tsconfig.json  drizzle.config.ts
  src/
    contracts/            zod schemas, shared types, fixtures            [Abhinav; changes reviewed by consumer]
    templates/            event type templates (JSON)                    [Vedant, Thanishka writes copy]
    db/                   schema, migrations, seed, demo reset           [Abhinav]
    server/
      auth/ authz/ policy/ services/ actions/ events/ channels/ checkin/ certificates/ od/ finance/ [Abhinav]
    ai/                   router, guard, rag, budget, evals, prompts     [Vedant]
    agents/               runtime + one folder per agent                 [Vedant]
    solvers/              schedule, crew                                 [Vedant]
    app/
      (public)/ (attendee)/ (crew)/                                      [Thanishka]
      (console)/                                                          [Vedant, Thanishka's components]
      api/                                                                [Abhinav; agent endpoints Vedant]
    components/ui/ attendee/ crew/ public/                                [Thanishka]
    components/console/                                                   [Vedant]
    lib/                  time, format, api-client, i18n                  [Abhinav; i18n strings Thanishka]
  worker/                 index, jobs (agents by Vedant, rest Abhinav)
  tests/unit  tests/e2e  tests/evals
  pitch/                                                                  [Thanishka]
```

Read anything; edit only what you own; request changes elsewhere via COORDINATION.md.

---

## 10. Shared contracts (Abhinav creates first; exact names)

```ts
Role = 'owner'|'organizer'|'lead'|'faculty_approver'|'volunteer'|'attendee'|'speaker'|'sponsor'|'viewer'
Domain = 'planning'|'finance'|'sponsorship'|'marketing'|'registrations'|'schedule'|'speakers'|'crew'|'logistics'|'comms'|'helpdesk'|'ops'|'post_event'
AgentName = 'commander'|'planner'|'finance'|'sponsorship'|'marketing'|'registrar'|'scheduler'|'speaker_liaison'|'crew_chief'|'logistics'|'herald'|'helpdesk'|'radar'|'chronicler'
Actor = {kind:'user', userId, role, eventId, domains?: Domain[]} | {kind:'agent', agent: AgentName, runId, simulation?: boolean} | {kind:'system'}
EventType = 'hackathon'|'tech_fest'|'workshop'|'conference'|'cultural_night'|'charity_drive'|'marathon'|'product_launch'|'wedding'|'community_meetup'|'school_function'|'other'
Channel = 'in_app'|'email'|'telegram'|'whatsapp'|'sms'

RiskTier = 'T0'|'T1'|'T2'|'T3'
ProposalStatus = 'draft'|'pending'|'approved'|'rejected'|'executing'|'executed'|'failed'|'stale'|'expired'|'undone'|'simulated'

ActionKind =
  'plan.create'|'plan.bundle'|'plan.milestone.create'|'plan.milestone.update'|'plan.agent_team.set'
| 'finance.budget.set'|'finance.expense.record'|'finance.income.record'|'finance.quote.compare'
| 'sponsor.prospect.add'|'sponsor.outreach.draft'|'sponsor.followup.schedule'|'sponsor.deliverable.update'
| 'marketing.post.draft'|'marketing.calendar.set'|'marketing.push.suggest'
| 'registration.promote_waitlist'|'registration.set_status'|'registration.flag_duplicate'|'registration.merge'|'registration.capacity.set'
| 'schedule.create_session'|'schedule.move_session'|'schedule.cancel_session'|'schedule.change_room'|'schedule.shift_downstream'
| 'speaker.confirm'|'speaker.requirement.record'|'speaker.reminder.schedule'
| 'crew.create_shift'|'crew.assign_shift'|'crew.unassign_shift'|'crew.create_task'|'crew.briefing.draft'
| 'logistics.checklist.update'|'logistics.inventory.update'|'logistics.food_count.set'
| 'comms.send_announcement'|'comms.send_direct'|'comms.reminder.schedule'
| 'helpdesk.escalate'|'helpdesk.reply'|'kb.publish_update'
| 'incident.create'|'incident.update'
| 'certificates.issue_batch'|'od.generate_list'|'report.generate'|'playbook.add_lesson'

ActionProposal = { id, eventId, kind, payload, proposedBy: Actor, planId?, parentId?,
  summary (<=120 chars), rationale (<=600 chars), evidence: {type:'kb'|'row'|'event'|'metric', ref, label}[],
  impact: {people, attendees, volunteers, sessions, moneyInr?, channels: Channel[], reversible},
  diff: {entity, id, before, after}[], riskTier, requiredApprovals, approvals: {userId, role, at, diffHash}[],
  status, idempotencyKey, preconditions: {entity, id, version}[], expiresAt, createdAt, executedAt?, undoUntil?, error? }

DomainEvent = { id, eventId, type, entity, entityId, actor, payload, at }
AgentRun / AgentStep as in v1 (trace with tokens, cost, latency, models, redacted io)

// Agent read tools (services.*): events.get, sessions.list, rooms.list, speakers.list, registrations.search (scoped), registrations.getMine, registrations.stats,
// crew.listVolunteers, crew.listShifts, logistics.checklists, finance.ledger, finance.budget, sponsors.list, marketing.funnel, incidents.list, metrics.snapshot, kb.get, playbook.lessons(eventType)
// The only write door: actions.propose(actor, input)
// Channels: channels.send(message) called only by the comms executor after approval
```

API surface (REST, `/api/...`, zod both ways): overview, stream (SSE), proposals list/approve/reject/edit/undo, agent-runs, command, kill-switch, briefing (get/generate), whatif (run), chat (attendee, streaming), me/registration, me/ticket, public register + otp, public event page data, crew shifts/checkin/incidents/sync, verify/:certId, finance ledger, sponsors, marketing, milestones.

Thanishka builds UI against fixtures generated from the zod schemas (`src/contracts/fixtures.ts`) until real endpoints land, then swaps `src/lib/api-client.ts`.

---

## 11. Seeded demo world

"**HackNova 2026**", a 2-day tech fest + 24h hackathon at a fictional Hyderabad engineering college. 4 rooms, 3 tracks, 16 sessions, 12 speakers, 320 attendees + 40 waitlist, 28 volunteers, budget 3,00,000 INR across 6 categories with 40% already spent, 6 sponsor prospects at various stages, marketing target 500 with 320 reached, KB (rulebook, FAQ, venue notes, menu). Pre-seeded tension: Lab 204 has 95 registrations for 60 seats; a speaker double-booked as a judge; catering category at 92% of budget.
Personas: Owner (Vedant), Leads (Abhinav as program lead, Thanishka as comms lead), Faculty approver (Dr. Rao), Volunteer (Ravi), Attendee (Sneha), Sponsor (Acme), Viewer (Judge).
A second seeded event, a small **charity blood-donation drive**, proves multi-type support (different agents on, different checklist).
`pnpm demo:reset` restores in under 30s; `pnpm demo:trigger <scenario>` fires: `speaker_cancel`, `lunch_confusion`, `volunteer_noshow`, `queue_spike`, `budget_breach`, `projector_voice_note`.

---

## 12. The demo (7 minutes)

1. Hook (20s): the WhatsApp chaos slide.
2. Intake (60s): pick "tech fest", type a paragraph, Commander asks 3 questions, produces plan, budget split and agent org chart with human leads. Approve.
3. Daily briefing (20s): what is due, what is at risk, catering at 92%.
4. Attendee (45s): Sneha registers on phone (OTP, QR), asks "do I get an OD letter" (cited answer), tries an injection (blocked, shown in audit log).
5. The disruption (120s): `speaker_cancel`. Ripple view. 3 solver options. Lead approves, faculty approves T3 on phone. Announcement lands in Sneha's app, on Telegram, and on a judge's WhatsApp via sandbox. Helpdesk now answers with the new time.
6. What-if (30s): "what if 30% more turn up" shows room overflow and volunteer gap with recommendations; nothing changed in real state.
7. On-ground (45s): Hinglish voice note -> AV incident -> tech volunteer assigned. Confusion Radar lunch spike -> announcement proposed.
8. WiFi off (30s): scanner keeps working; reconnect; sync; duplicate flagged.
9. Close-out (30s): report with SQL numbers, OD list PDF, certificate verify page, settlement list, lesson saved. Show the charity drive event to prove templates.
10. Glass box (20s): any action -> agent, model, tokens, cost. Evals page.
11. Close: the law of the system, plus before/after slide ("speaker cancels: before 45 min and 6 groups, after 90 seconds and one tap").

---

## 13. Team workflow

### Build order (gates, not clocks; nobody has a personal deadline; quality first)
- **Gate 0 Foundations:** repo, Docker, DB, contracts + fixtures, auth, CI (Abhinav). Model router + guard + RAG + agent runtime skeleton in isolation (Vedant). Design tokens + core components + public page against fixtures (Thanishka). Passed when `docker compose up` gives login, contracts merged, CI green, one styled page renders.
- **Gate 1 Vertical slice:** register -> OTP -> ticket -> helpdesk cited answer -> online check-in. Helpdesk agent real end to end.
- **Gate 2 The team:** proposal engine + approval queue + Commander intake and plan + Scheduler + Crew Chief + Herald on `speaker_cancel`. Agent timeline live.
- **Gate 3 The rest of the team + differentiators:** Registrar, Finance, Sponsorship, Marketing, Speaker Liaison, Logistics, Planner as configs on the runtime with their tools; daily briefing; what-if; Ripple view; offline check-in sync; Radar + voice notes; WhatsApp/SMS adapters; Chronicler outputs; templates + second seeded event; evals page.
- **Gate 4 Polish and pitch:** demo reset, rehearsals, deck, backup video, deploy to AWS, red-team pass.

A gate passes only when its flows work in the running app, clicked through by someone other than the builder.

### Git rules
- `main` protected, PRs only, CI green. Branches `vedant/<topic>`, `abhinav/<topic>`, `thanishka/<topic>`. Small PRs, rebase before PR.
- Contract changes need a COORDINATION.md note and a reviewer from the consuming side. Migrations only by Abhinav.
- **No AI attribution anywhere in git.** No co-author trailers, no "generated with" lines, no AI mentions in commits, PRs, comments, README or credits. Verify before every push: `git log --format=%B | grep -i -E "generated with"` returns nothing.
- Conventional commits, human tone. No em dashes anywhere.

### COORDINATION.md protocol
Append-only. Entry format: `## <date time IST> | <name> | <area>` then bullets: what changed, who it affects, blockers. Read the last 50 lines before every work block; write after every merge.

### Sync ritual
Huddle at every gate: each person demos live, agree the next split. Blocked on someone? Mock against the contract and keep going.

---

## 14. Judging map

| Criterion | Where we show it |
|---|---|
| Feasibility (top priority) | Working deployed demo, one agent runtime powering 14 agents, deterministic core with AI on top, fallbacks at every layer, reset in 30s |
| Technical feasibility | Typed proposals, policy in code, solvers, hybrid RAG, model router with 4-level fallback, offline mode, evals |
| Economic feasibility | Runs on one small server or a laptop; open models; cost per event shown live on the console (target under 200 INR of model spend for a 1500-person event); no per-event licence |
| Uniqueness | Commander intake + agent org chart with human leads, Ripple view, what-if, Confusion Radar, offline check-in, OD and certificate verification, event memory |
| Makes the process easy | Before/after slide per task; every manual job in Section 5 mapped to an agent |
| Responsible AI | Tiers, approvals, citations, injection defence live, DPDP-aligned consent and deletion |

Touches GENAI-10, GENAI-22, GENAI-24 as features. Mention in one line only.

## 15. Honesty rules
- Every number on a slide is from the running system or labelled simulated.
- Telugu not claimed unless verified by a native speaker. Hindi/Hinglish yes.
- Say "designed against OWASP LLM Top 10, aligned with DPDP principles", never "compliant" or "certified".
- Anything thin goes on a "Next" slide as roadmap.
