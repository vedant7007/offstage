# Gate 2 demo: speaker cancels, the team approves, phones buzz

What the audience sees: a keynote speaker cancels, the Commander proposes a full recovery plan within seconds, two people approve it in the console, real WhatsApp and Telegram messages arrive on team phones, and the helpdesk already knows the new time.

## One-time setup (per laptop)

1. `.env` has, besides the usual database and AI keys:
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM` (the sandbox number; with or without the `whatsapp:` prefix)
   - `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`
   - `DEMO_REAL_RECIPIENTS`: the team's phones in E.164 (for example `+9198xxxxxxxx`), comma separated. Emails and Telegram chat ids can go here too.
   - `DEMO_MODE=true` (persona switching in the console)
2. `docker compose up -d db mailpit`, `pnpm db:migrate`
3. Every phone in `DEMO_REAL_RECIPIENTS` joins the Twilio WhatsApp sandbox once: send the phrase in `WHATSAPP_SANDBOX_JOIN` to the sandbox number on WhatsApp. Without this Twilio accepts the message but never delivers it (error 63015). The sandbox join lasts 72 hours, so redo it on demo morning.
4. Run `pnpm demo:reset` once (step 1 below) so the team phones are in the database, then each team member opens `t.me/<TELEGRAM_BOT_USERNAME>` with `pnpm worker` running, sends `/start`, and taps "Share my phone number". The bot replies "You're linked." Links survive `pnpm demo:reset`, so this is needed only once.

Only numbers in `DEMO_REAL_RECIPIENTS` (and Telegram chats linked to them) ever get a real message. Every other outbox row goes to the mock driver and shows as "Mock" in the console. The per-person hourly cap and quiet hours apply to real sends too.

## The run (about 3 minutes, all clicks)

Before the audience arrives:

1. `pnpm demo:reset`. It wipes and reseeds, indexes the knowledge base, and sets the clock to 10:30 IST on HackNova day 1. Each team phone becomes an attendee of "Evaluating LLM apps", the session the plan moves.
2. Start `pnpm dev` and `pnpm worker` in two terminals. The worker log shows `worker started`.
3. Open `http://localhost:3000/login` and click "Event head" under Demo personas. The console opens on Approvals.

On stage:

4. Under "Demo scenarios" (bottom of Approvals), click "Keynote speaker cancels". "Keynote: Open source careers" is cancelled (240 registered).
5. Within about 10 seconds a T3 plan from the Commander appears under "Needs two approvals": fill the slot and move "Evaluating LLM apps" to 4:00 PM in the Main Auditorium. Click "Review the plan".
6. Walk through the plan: the solver's option, then Ripple (2 sessions, 265 attendees, 2 volunteers, 2 announcements, the helpdesk note), then the 8 steps.
7. Click Approve. The plan waits for the second approver (1 of 2).
8. Top right, "Switch persona", choose "Faculty approver". The page reloads as faculty. Click Approve. The plan runs and shows Done.
9. Within a few seconds:
   - WhatsApp on each team phone: "Cancelled: Keynote: Open source careers" and "Moved: Evaluating LLM apps" with the new time and room.
   - Telegram: the same messages from the bot on each linked phone.
   - Console, Approvals, "Message delivery": the team's messages as Real, everyone else as Mock or Skipped (fake attendees have no phone or Telegram). A message Twilio accepts but cannot deliver moves to Failed within about 15 seconds, with its error code.
10. Ask the helpdesk "When is the Evaluating LLM apps session now?". It answers 4:00 PM in the Main Auditorium and cites the "Schedule changes" note.

The CLI still works for rehearsals: `pnpm demo:trigger speaker_cancel` does the same as the button.

## If something goes wrong

- No plan after 30 seconds: check the worker terminal for `agents woken`. If it is missing, restart `pnpm worker`. If a model ends without choosing, the Commander still proposes the rules-based option ("Chosen by rules").
- WhatsApp shows Failed with error 63015: that phone has not joined the sandbox (step 3 of setup).
- Telegram rows show Skipped: that team member has not linked (step 4 of setup), or shared a number that is not in `DEMO_REAL_RECIPIENTS` (the bot then says it found no registration).
- Helpdesk escalates instead of answering: run `pnpm kb:index` after the plan executes (the worker normally indexes the schedule note on its own).
- Replay: `pnpm demo:reset` and start from step 1.
