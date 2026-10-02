# The 14 agents

Every agent is a config on one shared runtime: name, purpose, system prompt, tools, model tier, human lead role, triggers and fallback. They are registered in [`src/agents/index.ts`](../src/agents/index.ts) and live in `src/agents/<name>/`.

How agents run:

- **Triggers.** `worker/jobs/agents/dispatcher.ts` wires two kinds of trigger:
  - **Domain events** are dispatched from the `domain-event` queue.
  - **Cron schedules** each get their own pg-boss queue `agent.<name>.<trigger>`, run in Asia/Kolkata time, once per active event.
- **Untrusted events.** `helpdesk.message`, `voice_note.received` and `sponsor.reply_received` are passed to agents as untrusted text: screened by the guard, then wrapped.
- **Two styles of agent.**
  - Four agents call tools through the model: Commander, Scheduler, Crew Chief and Herald.
  - The other ten run a code pipeline and use the model only to word their text. `onlyGivenNumbers` rejects any draft that introduces a number not present in the input, and falls back to a template.
- **Output.** Every agent ends in `actions.propose()`. The tier is assigned by the [policy engine](policy.md), not by the agent.
- **Kill switches.** A per-event switch (`events.agentsEnabled`) and a per-agent switch (`agent_configs.enabled`) are checked on every wake.
- **Human leads.** In code, `humanLeadRole` is `owner` (the event head) or `lead`. A `lead` approves proposals in their own domain. The domain names below (Treasurer, Program lead and so on) come from the product blueprint.

Tiers below are the base tiers from `BASE_TIER` in `src/server/policy/tiers.ts`, before escalation. A proposal that reaches more than one person is always at least T2.

## Summary

| Agent | Trigger | Tools | Proposes (base tier) | Human lead | Model tier |
|---|---|---|---|---|---|
| Commander | event `session.cancelled` | `get_options`, `choose_option` | `plan.bundle` (highest child tier) | Event head (owner) | smart |
| Planner | cron 09:00 | none (pipeline) | `plan.milestone.update` T0, `incident.create` T0 | Event head (owner) | fast |
| Finance | event `finance.threshold_crossed` | none (pipeline) | `finance.budget.set` T2, `incident.create` T0 | Treasurer | fast |
| Sponsorship | cron 10:00 | none (pipeline) | `sponsor.outreach.draft` T1 | Sponsorship lead | fast |
| Marketing | cron 11:00 | none (pipeline) | `marketing.push.suggest` T0, `marketing.post.draft` T0 | Marketing lead | fast |
| Registrar | event `registration.created`, cron every 30 min | none (rules only) | `registration.flag_duplicate` T0, `registration.promote_waitlist` T2 | Registrations lead | none |
| Scheduler | events `session.updated`, `session.running_late` | `get_options`, `choose_option` | `plan.bundle` of `schedule.*` T2 | Program lead | smart |
| Speaker Liaison | cron hourly | none (rules only) | `speaker.reminder.schedule` T1 | Program lead | none |
| Crew Chief | event `shift.missed` | `get_replacements`, `assign_replacement` | `crew.assign_shift` T1, `comms.send_direct` T2, `incident.create` T0 | Volunteer lead | fast |
| Logistics | event `session.updated`, cron hourly at :15 | none (rules only) | `logistics.food_count.set` T1, `logistics.checklist.update` T0 | Logistics lead | none |
| Herald | events `session.updated`, `session.room_changed` | `get_change`, `propose_announcement` | `comms.send_announcement` T2 | Comms lead | fast |
| Helpdesk | event `helpdesk.message` | retrieval (`answerQuestion`) | answers directly; `helpdesk.escalate` T0 | Comms lead | fast (critical) |
| Radar | events `helpdesk.message`, `registration.checked_in`, `voice_note.received` | none (pipeline) | `incident.create` T0, `crew.create_task` T1, `comms.send_announcement` T2 | Ops lead | fast |
| Chronicler | cron 21:00 | none (pipeline) | `report.generate` T1, `playbook.add_lesson` T1 | Event head (owner) | fast |

## Commander

- **Job:** turns a disruption into one plan. It is the event's stage manager.
- **Trigger:** `session.cancelled`.
- **Tools:**
  - `get_options` runs the deterministic schedule solver.
  - `choose_option` builds a `plan.bundle`.
- **What the bundle can hold:** `schedule.move_session` or `schedule.cancel_session`, `crew.assign_shift` or `crew.unassign_shift`, `comms.send_announcement` or `comms.send_direct`, and `kb.publish_update`. Building it is `src/agents/commander/compose.ts`.
- **Tier:** the highest of its children. In practice that is T2, or T3 when it cancels a session with 50 or more attendees or a message reaches more than the broadcast limit.
- **Separate modules, not part of the agent config:**
  - intake interview (`intake.ts`): proposes `plan.create`, T2
  - daily briefing (`briefing.ts`): cron 07:00 IST
  - what-if (`whatif.ts`): runs in simulation mode; the executor refuses simulated proposals
  - voice Commander (`src/components/console/voice/`)
- **Example:** a speaker cancels. The Commander moves another session into the gap, reassigns the crew, announces the change and updates the helpdesk knowledge. All of it lands in one approval card.

## Planner

- **Job:** flags overdue and at-risk milestones.
- **Trigger:** cron `0 9 * * *`.
- **How:** rules only. Each note is proposed once, deduplicated by milestone, state and due date.
- **Example:** "Overdue: venue booking confirmed" as `plan.milestone.update`, T0. A critical milestone also gets an `incident.create`, T0.

## Finance

- **Job:** warns early and proposes how to cover an overspend. It never pays.
- **Trigger:** `finance.threshold_crossed`.
  - At 80 percent of a category it raises a low-severity incident.
  - At 100 percent it proposes moving budget from the categories with the most headroom. If they cannot cover it, it raises a high-severity incident instead.
- **Example:** move budget from Decor to Food as `finance.budget.set`. That is T2 as a money record, and T3 above the event's money threshold (10,000 INR by default).

## Sponsorship

- **Job:** drafts sponsor follow-ups. It never sends.
- **Trigger:** cron `0 10 * * *`. It picks prospects whose follow-up is due.
- **Example:** a follow-up mail draft as `sponsor.outreach.draft`, T1. If the model introduces a number that was not in the input, the template is used instead.

## Marketing

- **Job:** compares registrations with the day's target and suggests pushes.
- **Trigger:** cron `0 11 * * *`.
- **How:** when registrations are behind, it names the colleges and departments that are under-represented and drafts one post.
- **Example:** "25% behind target: push 3 groups" as `marketing.push.suggest`, T0. The post itself is `marketing.post.draft`, also T0.

## Registrar

- **Job:** flags duplicates and promotes the waitlist.
- **Triggers:** `registration.created`, and cron every 30 minutes.
- **How:** no model and no personal data. Email and phone matching happens on the server and reaches the agent only as `duplicateSuspects`.
- **Example:** "Promote 10 from the waitlist" as `registration.promote_waitlist`, T2. It becomes T3 above the broadcast limit. Flagging a duplicate is T0.

## Scheduler

- **Job:** keeps the schedule clash-free.
- **Triggers:** `session.updated` and `session.running_late`. Cancellations are left to the Commander.
- **How:** the solver (`src/solvers/schedule.ts`) validates every option and the model chooses and explains one. The fallback is the solver's first option, the one with the fewest moves.
- **Example:** a session runs late. A bundle of `schedule.shift_downstream` and `schedule.move_session`, T2, approved by the program lead.

## Speaker Liaison

- **Job:** reminds confirmed speakers to send their requirements.
- **Trigger:** cron hourly.
- **How:** it targets speakers whose session is within the next 48 hours. It works from the roster only, never from contact details.
- **Example:** "Remind Dr. Rao to send requirements" as `speaker.reminder.schedule`, T1.

## Crew Chief

- **Job:** covers missed shifts fairly.
- **Trigger:** `shift.missed`.
- **Tools:**
  - `get_replacements` uses the crew solver (`src/solvers/crew.ts`), which never puts a volunteer over their maximum hours and prefers whoever has worked least.
  - `assign_replacement` proposes the assignment and a direct note to the volunteer.
- **Example:** "Ravi covers the registration desk" as `crew.assign_shift`, T1. The note to Ravi is `comms.send_direct`, T2. If nobody qualifies, it raises a high-severity `incident.create` instead.

## Logistics

- **Job:** food counts and room readiness.
- **Triggers:** `session.updated`, and cron hourly at minute 15.
- **How:**
  - Every hour it recomputes food counts for upcoming meals from attendees' food preferences.
  - When a session changes room, it adds checklist items to the new room and a redirect sign to the old one.
- **Example:** "Lunch: 412 plates" as `logistics.food_count.set`, T1. A checklist item is T0.

## Herald

- **Job:** announces approved changes to the people affected.
- **Triggers:** `session.updated` and `session.room_changed`.
- **Tools:**
  - `get_change`
  - `propose_announcement`, which checks that the required facts are present and runs moderation before proposing.
- **Example:** "Moved: Intro to ML" to 120 attendees as `comms.send_announcement`, T2. It becomes T3 above the broadcast limit (200 people by default) or for an official notice.

## Helpdesk

- **Job:** answers attendee, volunteer and speaker questions with citations, or escalates.
- **Trigger:** `helpdesk.message`. Messages arrive from in-app chat, Telegram and WhatsApp.
- **How:**
  - It uses hybrid retrieval over the event's documents and live state (`src/agents/helpdesk/answer.ts`).
  - Answers go straight back to the asker.
  - When it cannot ground an answer, it escalates instead of guessing.
  - It is marked `critical`, so it keeps running on the local model when the daily spend cap is reached.
- **Example:** a question with no source in the documents becomes `helpdesk.escalate`, T0.

## Radar

- **Job:** spots confusion spikes, queues and floor problems.
- **Triggers:** `helpdesk.message`, `registration.checked_in` and `voice_note.received`.
- **How:**
  - **Confusion:** 8 or more questions on one topic within the window raise an incident, a signage task and an announcement.
  - **Queue:** check-ins over the threshold raise an incident and tasks for up to two free volunteers.
  - **Voice note:** a report creates an incident and an urgent task. An emergency category creates only a critical incident and assigns nobody, because humans handle emergencies.
- **Example:** "Tell everyone where lunch is" as `comms.send_announcement`, T2. The incident is T0 and the signage task is T1.

## Chronicler

- **Job:** writes the final report and saves lessons for the next event.
- **Trigger:** cron `0 21 * * *`. It acts only after the event ends, and writes the report once.
- **How:** report numbers come from SQL. It saves up to 10 lessons, one per resolved incident.
- **Example:** the final report as `report.generate`, T1. Each lesson is `playbook.add_lesson`, T1.
