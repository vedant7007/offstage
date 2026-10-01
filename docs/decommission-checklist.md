# Decommission checklist

The AWS server was removed on 2026-10-01 (see [deploy.md](deploy.md#decommissioned-on-2026-10-01)).
These steps need a human signed in to each account. Console labels shift over time, so the clicks
are a guide; the goal of each step is in bold.

Tick each box as you go. When every box is ticked, delete the local `.env` values for the
services you revoked so a stray `pnpm dev` cannot call them.

## AWS

- [ ] **Delete the deploy user's key.** IAM console, Users, `offstage-deploy`, Security credentials,
      Access keys, Actions, Deactivate, then Delete. Then delete the user itself: Users, tick
      `offstage-deploy`, Delete. It was created only for this project and its key pair and server
      are already gone.
- [ ] **Delete the app user's key.** Same steps for `offstage-app` (Bedrock and SES for the app).
      Check first that the Student Community Day project does not use this user: Users,
      `offstage-app`, Access Advisor, and look at the last-accessed services. Also remove any
      "API keys for Amazon Bedrock" listed under its Security credentials.
- [ ] **Do not touch** the SES identity `example.org`, its DNS records, the `Outbound...`
      configuration sets, or the Amplify and CDK buckets. They belong to Student Community Day.
- [ ] **Remove the local CLI profile.** Delete the `[offstage-deploy]` block from
      `%USERPROFILE%\.aws\credentials` and `%USERPROFILE%\.aws\config`, and delete
      `%USERPROFILE%\.ssh\offstage-deploy.pem`.
- [ ] **Confirm spend.** Billing and Cost Management, Bills, current month: EC2 and EC2-Other should
      stop growing after 2026-10-01. Cost Explorer, last 7 days, group by Service, to see the tail.
      The deploy profile had no billing access, so this check is manual.
- [ ] **Optional guard.** Billing and Cost Management, Budgets, Create budget, "Zero spend budget"
      template, your email. It mails you if anything ever bills again.

## Twilio

- [ ] **Clear the inbound webhook.** Console, Messaging, Try it out, Send a WhatsApp message,
      Sandbox settings. Empty "When a message comes in", Save. The old server URL no longer answers.
- [ ] **Rotate the auth token.** Console, Account (top right), API keys and tokens, Auth tokens.
      Create a secondary token, Promote to primary. The old token stops working.
- [ ] **Turn off auto-recharge.** Console, Admin, Account billing, Payment methods or Billing
      overview, Auto recharge, Off.
- [ ] **Optional.** Close the upgraded account (Admin, Account management, Close account) if you will
      not use the balance. Twilio does not usually refund a remaining balance.

## Telegram

- [ ] **Revoke the bot token.** In Telegram, open @BotFather, send `/mybots`, pick the OFFSTAGE bot,
      API Token, Revoke current token. Or delete the bot with `/deletebot`.

## Model and voice providers

- [ ] **Groq.** console.groq.com, API Keys, delete the key used for OFFSTAGE.
- [ ] **Murf.** Murf API dashboard, API keys, delete the OFFSTAGE key.
- [ ] **Deepgram.** console.deepgram.com, your project, API Keys, delete the OFFSTAGE key.

## Cloudflare Turnstile

- [ ] **Remove the widget.** Cloudflare dashboard, Turnstile, the OFFSTAGE widget, Settings,
      Delete (or Rotate secret key if you want to keep it). The server used Cloudflare's public test
      keys; a real widget only matters if you made one for local use.

## Code side (done)

- [x] Secret scan of every branch and tag with gitleaks 8 on 2026-10-01: 215 commits, no findings.
      `.env` and `.env.cloud` were never committed.
