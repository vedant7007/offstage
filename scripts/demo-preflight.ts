/**
 * pnpm demo:preflight: one table of everything a live demo depends on. Exits 1 on any FAIL.
 * WARN means it works now but needs a look (for example a sandbox join close to expiring).
 *
 *   laptop:  pnpm demo:preflight
 *   server:  sudo docker compose --profile cloud exec app pnpm demo:preflight
 */
import "../src/server/load-env";
import { createHash, createHmac } from "node:crypto";
import { count, eq, inArray, isNotNull } from "drizzle-orm";
import { generate } from "@/ai/router";
import { available, configuredChain, probeOllama, type Provider } from "@/ai/router/tiers";
import { db, sql as rawSql } from "@/db/client";
import * as t from "@/db/schema";
import { demoModeOn } from "@/server/auth/personas";
import { parseAllowlist } from "@/server/channels/allowlist";
import {
  lastWhatsAppDelivery,
  twilioAccountType,
  twilioCapResetsAt,
  twilioSentLast24h,
} from "@/server/channels/twilio";
import { HEARTBEAT_KEY, readSetting, TELEGRAM_CONFLICT_KEY } from "@/server/heartbeat";
import { maskPhone } from "@/server/pii";
import { getRealSends } from "@/server/real-sends";

type Status = "PASS" | "WARN" | "FAIL";
const rows: { check: string; status: Status; detail: string }[] = [];
const add = (check: string, status: Status, detail: string): void => {
  rows.push({ check, status, detail });
};

/** Run one check; an exception is a FAIL with its message, never a crash of the whole preflight. */
async function check(name: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    add(name, "FAIL", String(err instanceof Error ? err.message : err).slice(0, 120));
  }
}

const appUrl = (process.env.PREFLIGHT_URL ?? process.env.APP_URL ?? "http://localhost:3000").replace(
  /\/$/,
  "",
);
const span = (ms: number) => {
  const m = Math.round(Math.abs(ms) / 60_000);
  return m < 90 ? `${m} min` : `${Math.round(m / 60)} h`;
};
const ago = (d: Date) => `${span(Date.now() - d.getTime())} ago`;
const fromNow = (d: Date) => `in ${span(d.getTime() - Date.now())}`;
const TRIAL_CAP = 50;

// ---------------------------------------------------------------- platform

await check("app health", async () => {
  const t0 = Date.now();
  const res = await fetch(`${appUrl}/api/health`, { signal: AbortSignal.timeout(10_000) });
  const body = (await res.json()) as { ok?: boolean; db?: { ok?: boolean } };
  const ok = res.ok && body.ok && body.db?.ok;
  add(
    "app health",
    ok ? "PASS" : "FAIL",
    `${appUrl} ${res.status} in ${Date.now() - t0} ms, db ${body.db?.ok ? "ok" : "down"}`,
  );
});

await check("worker running", async () => {
  const hb = await readSetting<{ at: string; telegramPolling: boolean }>(db, HEARTBEAT_KEY);
  if (!hb) return add("worker running", "FAIL", "no heartbeat yet (start the worker)");
  const age = Date.now() - new Date(hb.at).getTime();
  add("worker running", age < 90_000 ? "PASS" : "FAIL", `last heartbeat ${Math.round(age / 1000)} s ago`);
});

await check("one Telegram poller", async () => {
  const hb = await readSetting<{ telegramPolling: boolean }>(db, HEARTBEAT_KEY);
  const conflict = await readSetting<{ at: string }>(db, TELEGRAM_CONFLICT_KEY);
  const since = conflict ? Date.now() - new Date(conflict.at).getTime() : Infinity;
  if (!process.env.TELEGRAM_BOT_TOKEN) return add("one Telegram poller", "WARN", "no bot token here");
  if (!hb?.telegramPolling)
    return add("one Telegram poller", "WARN", "this worker does not poll (TELEGRAM_POLLING is off)");
  add(
    "one Telegram poller",
    since > 60_000 ? "PASS" : "FAIL",
    since === Infinity ? "polling, never refused" : `polling, last 409 ${Math.round(since / 1000)} s ago`,
  );
});

// ---------------------------------------------------------------- channels

await check("real sends", async () => {
  const r = await getRealSends();
  add(
    "real sends",
    r.on ? "WARN" : "PASS",
    `${r.on ? "ON: allowlisted phones get real messages" : "off (switch on just before the demo)"}, from ${r.source}`,
  );
});

const twilioOn = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN);

await check("Twilio cap", async () => {
  if (!twilioOn) return add("Twilio cap", "WARN", "Twilio not configured");
  const type = await twilioAccountType();
  if (type !== "Trial") return add("Twilio cap", "PASS", `${type} account, no trial cap`);
  const sent = await twilioSentLast24h();
  const left = Math.max(0, TRIAL_CAP - sent);
  const reset = left === 0 ? await twilioCapResetsAt() : null;
  const team = parseAllowlist().phones.size;
  // speaker_cancel sends two WhatsApp messages to every team phone.
  const need = team * 2;
  add(
    "Twilio cap",
    left === 0 ? "FAIL" : left < need ? "WARN" : "PASS",
    `about ${left} of ${TRIAL_CAP} left (${sent} sent in 24 h), one speaker_cancel needs ${need}` +
      (reset ? `, next slot ${fromNow(reset)}` : ""),
  );
});

for (const phone of parseAllowlist().phones) {
  const label = `sandbox ${maskPhone(phone)}`;
  await check(label, async () => {
    if (!twilioOn) return add(label, "WARN", "Twilio not configured");
    const last = await lastWhatsAppDelivery(phone);
    if (!last) return add(label, "WARN", "no delivered WhatsApp yet: send the join phrase to the sandbox");
    const hours = (Date.now() - last.getTime()) / 3_600_000;
    add(
      label,
      hours > 72 ? "WARN" : "PASS",
      `last delivery ${ago(last)}${hours > 72 ? ": rejoin the sandbox (joins last 72 h)" : ""}`,
    );
  });
}

await check("WhatsApp webhook", async () => {
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!token) return add("WhatsApp webhook", "WARN", "no TWILIO_AUTH_TOKEN, cannot sign a test");
  // Signed like Twilio, from a number that is not allowlisted: the route checks the signature and
  // answers empty TwiML without asking the helpdesk or replying.
  const url = `${(process.env.APP_URL ?? appUrl).replace(/\/$/, "")}/api/channels/twilio/whatsapp`;
  const params = new URLSearchParams({
    From: "whatsapp:+10000000000",
    To: "whatsapp:+14155238886",
    Body: "preflight",
  });
  const data = [...params.keys()].sort().reduce((a, k) => a + k + params.get(k), url);
  const sig = createHmac("sha1", token).update(data).digest("base64");
  const ok = await fetch(url, {
    method: "POST",
    headers: { "x-twilio-signature": sig, "content-type": "application/x-www-form-urlencoded" },
    body: params,
    signal: AbortSignal.timeout(30_000),
  });
  const bad = await fetch(url, {
    method: "POST",
    headers: { "x-twilio-signature": "forged", "content-type": "application/x-www-form-urlencoded" },
    body: params,
    signal: AbortSignal.timeout(10_000),
  });
  const pass = ok.status === 200 && (await ok.text()).includes("<Response") && bad.status === 403;
  add("WhatsApp webhook", pass ? "PASS" : "FAIL", `signed ${ok.status}, forged ${bad.status} at ${url}`);
});

// ---------------------------------------------------------------- demo data

await check("demo clock", async () => {
  const clock = await readSetting<{ anchor: string }>(db, "demo_clock");
  if (!demoModeOn()) return add("demo clock", "WARN", "DEMO_MODE is off");
  add(
    "demo clock",
    clock ? "PASS" : "FAIL",
    clock ? `anchored at ${clock.anchor}` : "not set (pnpm demo:reset)",
  );
});

await check("demo world", async () => {
  const evs = await db
    .select({ slug: t.events.slug, id: t.events.id })
    .from(t.events)
    .where(inArray(t.events.slug, ["hacknova-2026", "raktdaan-2026"]));
  const [regs] = await db.select({ n: count() }).from(t.registrations);
  add(
    "demo world",
    evs.length === 2 && (regs?.n ?? 0) > 300 ? "PASS" : "FAIL",
    `${evs.length} of 2 events, ${regs?.n ?? 0} registrations`,
  );
});

await check("knowledge base", async () => {
  const [docs] = await db.select({ n: count() }).from(t.kbDocuments);
  const [ready] = await db
    .select({ n: count() })
    .from(t.kbDocuments)
    .where(eq(t.kbDocuments.status, "ready"));
  const [chunks] = await db.select({ n: count() }).from(t.kbChunks).where(isNotNull(t.kbChunks.embedding));
  const pass = (docs?.n ?? 0) > 0 && ready?.n === docs?.n && (chunks?.n ?? 0) > 0;
  add(
    "knowledge base",
    pass ? "PASS" : "FAIL",
    `${ready?.n ?? 0} of ${docs?.n ?? 0} documents ready, ${chunks?.n ?? 0} chunks embedded`,
  );
});

// ---------------------------------------------------------------- models

const inChain = new Set(configuredChain("fast").map((l) => l.provider));
for (const provider of ["groq", "bedrock", "ollama"] as Provider[]) {
  const label = `model ${provider}`;
  await check(label, async () => {
    if (provider === "ollama") await probeOllama().catch(() => undefined);
    const used = inChain.has(provider);
    if (!available(provider))
      return add(
        label,
        used ? "FAIL" : "WARN",
        `not reachable or not configured${used ? "" : " (not in this profile's chain)"}`,
      );
    const t0 = Date.now();
    const res = await generate({
      tier: "fast",
      only: provider,
      budget: { runId: `preflight-${provider}` },
      maxOutputTokens: 16,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    });
    const ms = Date.now() - t0;
    add(
      label,
      res.ok ? "PASS" : used ? "FAIL" : "WARN",
      res.ok ? `answered in ${ms} ms` : `no answer after ${ms} ms`,
    );
  });
}

// ---------------------------------------------------------------- email

await check("Mailpit", async () => {
  const url = process.env.MAILPIT_URL ?? "http://localhost:8025";
  const res = await fetch(`${url}/api/v1/info`, { signal: AbortSignal.timeout(5000) });
  add("Mailpit", res.ok ? "PASS" : "FAIL", `${url} ${res.status}`);
});

/** One SigV4-signed GET to SES v2, so no AWS SDK is needed for a status check. */
async function sesAccount(): Promise<{ ProductionAccessEnabled?: boolean; SendingEnabled?: boolean }> {
  const key = process.env.AWS_ACCESS_KEY_ID;
  const secret = process.env.AWS_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION ?? "ap-south-1";
  if (!key || !secret) throw new Error("no AWS keys");
  const host = `email.${region}.amazonaws.com`;
  const path = "/v2/email/account";
  const amz = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = amz.slice(0, 8);
  const sha = (s: string) => createHash("sha256").update(s).digest("hex");
  const hmac = (k: Buffer | string, s: string) => createHmac("sha256", k).update(s).digest();
  const headers = `host:${host}\nx-amz-date:${amz}\n`;
  const canonical = ["GET", path, "", headers, "host;x-amz-date", sha("")].join("\n");
  const scope = `${day}/${region}/ses/aws4_request`;
  const toSign = ["AWS4-HMAC-SHA256", amz, scope, sha(canonical)].join("\n");
  let k = hmac(`AWS4${secret}`, day);
  for (const part of [region, "ses", "aws4_request"]) k = hmac(k, part);
  const signature = createHmac("sha256", k).update(toSign).digest("hex");
  const res = await fetch(`https://${host}${path}`, {
    headers: {
      "x-amz-date": amz,
      authorization: `AWS4-HMAC-SHA256 Credential=${key}/${scope}, SignedHeaders=host;x-amz-date, Signature=${signature}`,
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`SES ${res.status}`);
  return (await res.json()) as { ProductionAccessEnabled?: boolean; SendingEnabled?: boolean };
}

await check("SES", async () => {
  const driver = process.env.EMAIL_DRIVER ?? "mailpit";
  if (driver !== "smtp") return add("SES", "PASS", `not used here (EMAIL_DRIVER=${driver})`);
  const a = await sesAccount();
  add(
    "SES",
    a.SendingEnabled ? (a.ProductionAccessEnabled ? "PASS" : "WARN") : "FAIL",
    `${a.ProductionAccessEnabled ? "production access" : "sandbox: only verified recipients"}, sending ${a.SendingEnabled ? "enabled" : "disabled"}`,
  );
});

// ---------------------------------------------------------------- report

const w = Math.max(...rows.map((r) => r.check.length));
console.log(`\nOFFSTAGE demo preflight, ${new Date().toISOString()}\n`);
for (const r of rows) console.log(`${r.status.padEnd(5)} ${r.check.padEnd(w)}  ${r.detail}`);
const fails = rows.filter((r) => r.status === "FAIL").length;
const warns = rows.filter((r) => r.status === "WARN").length;
console.log(`\n${rows.length} checks: ${rows.length - fails - warns} pass, ${warns} warn, ${fails} fail`);
await rawSql.end({ timeout: 5 });
process.exit(fails ? 1 : 0);
