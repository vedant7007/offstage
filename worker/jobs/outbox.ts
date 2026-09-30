/**
 * Outbox delivery. Claims due rows (scheduled_for is already past quiet hours, and the hourly cap and
 * dedupe were applied when the rows were written), then sends each one for real only when its address
 * is on the allowlist, the channel has credentials and real sends are on (REAL_SENDS, or the console
 * switch). Everything else is marked delivered_mock.
 */
import { and, asc, eq, gt, inArray, isNotNull, like, lte, sql } from "drizzle-orm";
import type { Logger } from "pino";
import { db } from "@/db/client";
import * as t from "@/db/schema";
import { nowUtc } from "@/lib/time";
import { isAllowed, parseAllowlist } from "@/server/channels/allowlist";
import { sendEmail } from "@/server/channels/email";
import { driverFor } from "@/server/channels/registry";
import { linkedChatIds, sendTelegram } from "@/server/channels/telegram";
import { sendTwilio, twilioStatus } from "@/server/channels/twilio";
import { notifyOutbox } from "@/server/events/bus";
import { decrypt } from "@/server/pii";
import { getRealSends } from "@/server/real-sends";

const BATCH = 200;
const MAX_ATTEMPTS = 3;
type Row = typeof t.outbox.$inferSelect;

async function sendReal(row: Row, to: string): Promise<{ providerId?: string }> {
  switch (row.channel) {
    case "email":
      return sendEmail({ to, subject: row.subject ?? "Event update", text: row.body, kind: "announcement" });
    case "telegram":
      return sendTelegram(to, row.body);
    case "whatsapp":
    case "sms":
      return sendTwilio(row.channel, to, row.body);
    default:
      throw new Error(`no sender for ${row.channel}`);
  }
}

/** One pass over due rows. Returns how many were handled. */
export async function deliverDue(log: Logger): Promise<{ real: number; mock: number; failed: number }> {
  const now = nowUtc();
  const due = db
    .select({ id: t.outbox.id })
    .from(t.outbox)
    .where(and(eq(t.outbox.status, "pending"), lte(t.outbox.scheduledFor, now)))
    .orderBy(asc(t.outbox.scheduledFor))
    .limit(BATCH)
    .for("update", { skipLocked: true });
  const rows = await db
    .update(t.outbox)
    .set({ status: "sending" })
    .where(inArray(t.outbox.id, due))
    .returning();
  const counts = { real: 0, mock: 0, failed: 0 };
  if (!rows.length) return counts;

  const allow = parseAllowlist();
  const linked = await linkedChatIds(db);
  const { on: realOn } = await getRealSends();
  const mockIds: string[] = [];
  let heldBack = 0;
  for (const row of rows) {
    const to = decrypt(row.toEnc);
    const driver = driverFor(row.channel as never);
    if (driver === "mock" || !isAllowed(allow, row.channel, to, linked)) {
      mockIds.push(row.id);
      continue;
    }
    if (!realOn) {
      heldBack++;
      mockIds.push(row.id);
      continue;
    }
    try {
      const { providerId } = await sendReal(row, to);
      await db
        .update(t.outbox)
        .set({
          status: "sent",
          driver,
          providerId: providerId ?? null,
          attempts: row.attempts + 1,
          sentAt: nowUtc(),
          error: null,
        })
        .where(eq(t.outbox.id, row.id));
      counts.real++;
      log.info({ outboxId: row.id, channel: row.channel, driver }, "outbox sent (real)");
    } catch (err) {
      const attempts = row.attempts + 1;
      // Twilio's daily cap (63038) lasts a rolling 24 hours: retrying only spends attempts.
      const capped = /code 63038\b/.test(String(err));
      const retry = attempts < MAX_ATTEMPTS && !capped;
      await db
        .update(t.outbox)
        .set({
          status: retry ? "pending" : "failed",
          attempts,
          error: String(err instanceof Error ? err.message : err).slice(0, 200),
          scheduledFor: retry ? new Date(nowUtc().getTime() + 60_000 * attempts) : row.scheduledFor,
        })
        .where(eq(t.outbox.id, row.id));
      counts.failed++;
      log.warn({ outboxId: row.id, channel: row.channel, attempts, err: String(err) }, "outbox send failed");
    }
  }
  if (heldBack) log.info({ heldBack }, "real sends off: allowlisted messages delivered to the mock driver");
  if (mockIds.length) {
    await db
      .update(t.outbox)
      .set({ status: "delivered_mock", driver: "mock", sentAt: nowUtc() })
      .where(inArray(t.outbox.id, mockIds));
    counts.mock = mockIds.length;
  }
  await notifyOutbox(
    db,
    rows.map((r) => r.eventId),
  );
  return counts;
}

/**
 * Twilio accepts a message and only later says whether it arrived (a sandbox number that never joined fails
 * with 63015). Polls accepted messages from the last two hours until their status is final, and marks a late
 * failure as failed with Twilio's error code. Polling, not status callbacks, because a local demo has no public URL.
 */
export async function checkTwilioStatus(log: Logger): Promise<number> {
  const rows = await db
    .select({
      id: t.outbox.id,
      eventId: t.outbox.eventId,
      providerId: t.outbox.providerId,
      meta: t.outbox.meta,
    })
    .from(t.outbox)
    .where(
      and(
        eq(t.outbox.status, "sent"),
        like(t.outbox.driver, "twilio-%"),
        isNotNull(t.outbox.providerId),
        gt(t.outbox.createdAt, sql`now() - interval '2 hours'`),
        sql`coalesce(${t.outbox.meta}->>'providerStatus', '') not in ('delivered', 'read')`,
      ),
    )
    .limit(50);
  let failed = 0;
  for (const row of rows) {
    const s = await twilioStatus(row.providerId!).catch(() => null);
    if (!s || s.status === row.meta.providerStatus) continue;
    const late = s.status === "failed" || s.status === "undelivered";
    await db
      .update(t.outbox)
      .set({
        meta: { ...row.meta, providerStatus: s.status },
        ...(late
          ? { status: "failed" as const, error: `twilio ${s.status} code ${s.errorCode ?? "unknown"}` }
          : {}),
      })
      .where(eq(t.outbox.id, row.id));
    if (late) {
      failed++;
      await notifyOutbox(db, [row.eventId]);
      log.warn({ outboxId: row.id, code: s.errorCode }, "twilio reported a delivery failure");
    }
  }
  return failed;
}

/** Runs delivery every few seconds until stopped. Rows left in "sending" by a crash go back to pending. */
export async function startOutboxDelivery(log: Logger, everyMs = 3_000): Promise<() => void> {
  await db.update(t.outbox).set({ status: "pending" }).where(eq(t.outbox.status, "sending"));
  let stopped = false;
  let running = false;
  let tick = 0;
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = true;
    const checkStatus = tick++ % 5 === 0 && Boolean(process.env.TWILIO_ACCOUNT_SID);
    deliverDue(log)
      .then(async (c) => {
        if (c.real || c.mock || c.failed) log.info(c, "outbox delivery pass");
        if (checkStatus) await checkTwilioStatus(log);
      })
      .catch((err: unknown) => log.error({ err }, "outbox delivery failed"))
      .finally(() => (running = false));
  }, everyMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
