# Showcase fixtures

Real recorded data for the zero-cost hosted showcase, replayed in the browser. Recorded by
`pnpm showcase:fixtures` (`scripts/export-showcase-fixtures.ts`) against a running app with the
worker, `DEMO_MODE=true`, real sends off and every external channel empty. Do not edit by hand:
re-record.

## Extensions to the shared format

The format (response keys, world.json, scenarios/\*.json, kb.json, recorded-runs.json, evals.json,
closeout.json, briefing.json) is followed as written, with these additions:

1. **`world.whatIfSamples`**: `[{ scenario, response }]`. The response key leaves out the body, so
   two What-if questions would share the key `whatIf`. `world.responses.whatIf` holds the first
   sample; the full list is here so the engine can match the question typed.
2. **`world.personas`** has every persona the console switcher offers (owner, program_lead,
   comms_lead, faculty, volunteer, attendee, sponsor, viewer). There is no `speaker` login: the
   speaker (Lakshmi Prasad) view is the `speaker` entry of the `personaFeed` responses.
3. **`approveProposal` responses** are stored in the approval phase under their normal key, and
   `demoTrigger` in the trigger phase, so the engine can answer those POSTs too.
4. **`closeout.json`** is `{ closeout, closeoutSummary }`, the two responses side by side.
5. **`recorded-runs.json`** is `{ runs: [...] }`; each run also carries `status`, `recorded: true`
   and `source` (`local run` or `server snapshot <db>`). `model` and `provider` list every model the
   run called, comma separated, or `null` for runs that made no model call (rule-based steps).
   Seeded runs are left out: only runs recorded during a scenario, plus the real speaker_cancel
   chain from the hackathon server snapshot (`source: server snapshot arch_015628z`).

## Not recorded

- `crewShifts`, `crewTasks`, `crewIncident`, `command`, `finance`, `sponsors`, `marketing`,
  `milestones`, `incidents`, `listRegistrations` and `killSwitch` have no route on main yet, so they
  have no recorded response. The engine should fall back to the contract fixtures for these.
- `emergency` has no demo trigger button. It is recorded through the real path: a volunteer voice
  note (`voice_note.received`) whose transcript Radar classifies as medical, the same path the
  `projector_voice_note` scenario uses.

## Privacy

Phones become `+91 90000 000NN`, emails `firstname@example.com`, Telegram chat ids `100000NN`,
consistent per person across all files (`src/showcase/pii.ts`). The recorder refuses to write a
file that still matches an Indian mobile number or a non-example email, and
`tests/unit/showcase/fixtures.test.ts` checks the same on every file.
