/**
 * Outbox delivery. Claims due rows (scheduled_for is already past quiet hours, and the hourly cap and
 * dedupe were applied when the rows were written), then sends each one for real only when its address
 * is on the allowlist and the channel has credentials. Everything else is marked delivered_mock.
 */
import { and, asc, eq, inArray, lte } from "drizzle-orm";
import type { Logger } from "pino";
import { db } from "@/db/client";
import * as t from "@/db/schema";
import { nowUtc } from "@/lib/time";
import { isAllowed, parseAllowlist } from "@/server/channels/allowlist";
import { sendEmail } from "@/server/channels/email";
import { driverFor } from "@/server/channels/registry";
import { linkedChatIds, sendTelegram } from "@/server/channels/telegram";
import { sendTwilio } from "@/server/channels/twilio";
import { decrypt } from "@/server/pii";

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
  const mockIds: string[] = [];
  for (const row of rows) {
    const to = decrypt(row.toEnc);
    const driver = driverFor(row.channel as never);
    if (driver === "mock" || !isAllowed(allow, row.channel, to, linked)) {
      mockIds.push(row.id);
      continue;
    }
    try {
      const { providerId } = await sendReal(row, to);
      await db
        .update(t.outbox)
        .set({ status: "sent", driver, providerId: providerId ?? null, attempts: row.attempts + 1, sentAt: nowUtc(), error: null })
        .where(eq(t.outbox.id, row.id));
      counts.real++;
      log.info({ outboxId: row.id, channel: row.channel, driver }, "outbox sent (real)");
    } catch (err) {
      const attempts = row.attempts + 1;
      const retry = attempts < MAX_ATTEMPTS;
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
  if (mockIds.length) {
    await db
      .update(t.outbox)
      .set({ status: "delivered_mock", driver: "mock", sentAt: nowUtc() })
      .where(inArray(t.outbox.id, mockIds));
    counts.mock = mockIds.length;
  }
  return counts;
}

/** Runs delivery every few seconds until stopped. Rows left in "sending" by a crash go back to pending. */
export async function startOutboxDelivery(log: Logger, everyMs = 3_000): Promise<() => void> {
  await db.update(t.outbox).set({ status: "pending" }).where(eq(t.outbox.status, "sending"));
  let stopped = false;
  let running = false;
  const timer = setInterval(() => {
    if (running || stopped) return;
    running = true;
    deliverDue(log)
      .then((c) => {
        if (c.real || c.mock || c.failed) log.info(c, "outbox delivery pass");
      })
      .catch((err: unknown) => log.error({ err }, "outbox delivery failed"))
      .finally(() => (running = false));
  }, everyMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
