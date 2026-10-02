# Policy: who decides what

The policy engine is code, not a prompt. It is one pure function, `assignTier()` in [`src/server/policy/tiers.ts`](../src/server/policy/tiers.ts), and every rule is unit tested in [`tests/unit/tiers.test.ts`](../tests/unit/tiers.test.ts). Agents cannot choose their own tier: the server computes the impact of each proposal and the policy engine assigns the tier from that.

## The four tiers

| Tier | Meaning | Approvals | What happens |
|---|---|---|---|
| T0 | Internal record only, nobody notified | 0 | Executes at once |
| T1 | One person affected, reversible, not public | 0 | Executes at once (when `autoApproveT1` is on, the default), with a 10 minute undo |
| T2 | Many people, public, or any money record | 1 | Waits for the agent's domain lead or an organizer |
| T3 | Irreversible, official, bulk, sensitive or large money | 2 | Two different people, and the proposer cannot approve it; owner or faculty must be one of them when the event requires it |

## How a tier is assigned

Each action kind starts at a base tier. Rules can only raise it, never lower it. Every rule that fires adds a plain-language reason, and the approval card shows them all.

**Base tiers** (`BASE_TIER`):

- **T0**:
  - `plan.bundle`, `plan.milestone.*`
  - `sponsor.prospect.add`, `sponsor.followup.schedule`, `sponsor.deliverable.update`
  - `marketing.post.draft`, `marketing.push.suggest`
  - `registration.flag_duplicate`
  - `speaker.requirement.record`
  - `crew.briefing.draft`
  - `logistics.checklist.update`, `logistics.inventory.update`
  - `helpdesk.escalate`
  - `incident.create`, `incident.update`
- **T1**:
  - `finance.quote.compare`
  - `sponsor.outreach.draft`
  - `marketing.calendar.set`
  - `speaker.confirm`, `speaker.reminder.schedule`
  - `crew.create_shift`, `crew.assign_shift`, `crew.unassign_shift`, `crew.create_task`
  - `logistics.food_count.set`
  - `helpdesk.reply`
  - `report.generate`, `playbook.add_lesson`
- **T2**:
  - `plan.create`, `plan.agent_team.set`
  - every `finance.*` record
  - `registration.promote_waitlist`, `registration.set_status`, `registration.merge`, `registration.capacity.set`
  - every `schedule.*` kind
  - every `comms.*` kind
  - `kb.publish_update`
- **T3**:
  - `certificates.issue_batch`
  - `od.generate_list`

**Escalation rules**, in order:

1. **Bundles.** A `plan.bundle` takes the highest tier among its children.
2. **Money.**
   - Any expense, income or budget record is at least T2.
   - Above the event's `t3MoneyThresholdInr` (default 10,000 INR) it is T3.
3. **Messages** (`comms.send_announcement`, `comms.send_direct`, `comms.reminder.schedule`):
   - `official` category: T3.
   - `emergency` category: T3.
   - Sent to segment `all`: at least T2.
   - More than `broadcastT3Recipients` people (default 200): T3.
4. **Cancellations.** Cancelling a session with 50 or more attendees is T3.
5. **Bulk waitlist promotion.** Promoting more than `broadcastT3Recipients` people is T3.
6. **Irreversible output.** Certificates and OD lists are always T3.
7. **Catch-all.** Anything that affects more than one person, or cannot be undone and affects anyone, is at least T2.
8. **Faculty.** When `facultyApproverRequired` is on, every T3 needs an owner or faculty approver.

## Examples from the tests

| Proposal | Tier | Why |
|---|---|---|
| `incident.create`, no one affected | T0 | Base tier |
| `crew.assign_shift` to one volunteer | T1 | Base tier, auto with undo |
| `crew.create_task` for 3 people | T2 | Affects 3 people |
| `helpdesk.reply` that cannot be undone | T2 | Cannot be undone |
| `schedule.move_session` | T2 | Base tier |
| Expense of 10,000 INR | T2 | Money record, not above the threshold |
| Announcement to `all`, 200 people | T2 | Sent to everyone, not over 200 |
| `comms.send_direct` to 1 person | T2 | Every message kind starts at T2 |
| Cancel a session with 49 attendees | T2 | Under 50 |
| Expense of 10,001 INR | T3 | Above the 10,000 INR threshold |
| Broadcast to 201 people | T3 | Over the broadcast limit |
| Emergency message to 3 people | T3 | Humans decide, agents only draft |
| Official notice | T3, needs faculty when configured | Official category |
| Cancel a session with 50 attendees | T3 | 50 or more attendees |
| Promote 250 people from the waitlist | T3 | Bulk move |
| `certificates.issue_batch` | T3 | Irreversible and official |
| Bundle with children T3 and T1 | T3 | Highest child |

## Approval rules

These are enforced in `src/server/actions/decide.ts` and `src/server/authz/permissions.ts`.

- **Who can approve.**
  - Staff roles can approve any proposal.
  - A `lead` can approve proposals in their own domain.
  - A `faculty_approver` can approve only T3.
- **Two-person rule on T3.** The proposer cannot approve, and nobody can approve twice.
- **No stale approvals.**
  - Each approval carries a hash of the diff the approver saw. If the proposal was edited since, the approval is refused.
  - Editing a proposal clears its approvals.
- **Expiry.** Proposals expire after `proposalTtlMinutes` (default 30). At execution, precondition versions are checked again and a mismatch marks the proposal `stale`.
- **Undo.** An executed T1 proposal whose executor has an inverse can be undone for 10 minutes.

## Messages after approval

Approval is not the last check. The comms executor and the outbox apply these rules to every message (`src/server/actions/executors/comms.ts`):

- **Quiet hours** 22:00 to 07:00 IST push messages to the morning. Only an emergency message that a human approved skips them.
- **Hourly cap** of 4 messages per person per hour by default. Emergencies are exempt.
- **24 hour dedupe** on a hash of recipient, channel and body.
- **Skipped messages are still recorded**, with a reason such as `hourly_cap`, `duplicate_24h` or `telegram_not_linked`.
- **Real delivery** happens only to allowlisted recipients (`DEMO_REAL_RECIPIENTS`) while `REAL_SENDS` is on. Everything else is marked `delivered_mock`.

## Emergencies

Medical, safety, fire and harassment reports never become agent actions.

- **Radar.** When a voice note reports an emergency, Radar creates only a critical incident and assigns nobody.
- **Alerts.** The console shows an emergency banner to every lead, and the public status page shows the alert.
- **Messages.** Any message in the `emergency` category is T3, so two humans approve it.

## Kill switches

- **Per event.** `events.agentsEnabled` stops every agent of that event from waking. Humans can still approve and execute.
- **Per agent.** `agent_configs.enabled` turns off one agent.
- **Real sends.** `REAL_SENDS`, together with its console toggle, stops all real delivery. Every change to it is audited.
- **Spend.** A per-day spend cap (`AI_DAILY_CAP_USD`) pauses non-critical agents.
