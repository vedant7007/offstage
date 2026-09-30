/** Outbox delivery counts for the console: what really went out versus what the mock driver took. */
import { and, eq, ne, sql } from "drizzle-orm";
import type { DeliveryStatsResponse, UserActor } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { requirePermission } from "@/server/authz";
import { twilioCapResetsAt } from "@/server/channels/twilio";

export async function deliveryStats(
  actor: UserActor,
  client: Db = defaultDb,
): Promise<DeliveryStatsResponse> {
  requirePermission(actor, "proposal.read", { eventId: actor.eventId });
  const rows = await client
    .select({
      channel: t.outbox.channel,
      status: t.outbox.status,
      // "twilio undelivered code 63015" and "twilio 400 code 21211" both give the code.
      code: sql<string | null>`substring(${t.outbox.error} from 'code ([0-9]+)')`,
      n: sql<number>`count(*)::int`,
    })
    .from(t.outbox)
    .where(and(eq(t.outbox.eventId, actor.eventId), ne(t.outbox.channel, "in_app")))
    .groupBy(t.outbox.channel, t.outbox.status, sql`3`);
  const by = new Map<string, DeliveryStatsResponse["channels"][number]>();
  for (const r of rows) {
    const c = by.get(r.channel) ?? {
      channel: r.channel as never,
      real: 0,
      mock: 0,
      pending: 0,
      failed: 0,
      skipped: 0,
      failureCodes: {},
      failureNotes: [],
    };
    if (r.status === "sent") c.real += r.n;
    else if (r.status === "delivered_mock") c.mock += r.n;
    else if (r.status === "failed") {
      c.failed += r.n;
      const code = r.code ?? "unknown";
      c.failureCodes[code] = (c.failureCodes[code] ?? 0) + r.n;
    } else if (r.status === "skipped") c.skipped += r.n;
    else c.pending += r.n;
    by.set(r.channel, c);
  }
  for (const c of by.values()) c.failureNotes = await failureNotes(c.failureCodes);
  return { channels: [...by.values()].sort((a, b) => a.channel.localeCompare(b.channel)) };
}

/** Provider codes in words for the console. */
async function failureNotes(codes: Record<string, number>): Promise<string[]> {
  const notes: string[] = [];
  for (const [code, n] of Object.entries(codes)) {
    if (code === "63038") {
      // Real time, not the demo clock: Twilio's window is real.
      const at = await twilioCapResetsAt();
      const hours = at ? Math.max(1, Math.ceil((at.getTime() - Date.now()) / 3_600_000)) : null;
      notes.push(
        hours
          ? `Twilio daily cap reached, resets in ${hours} ${hours === 1 ? "hour" : "hours"} (${n} not sent)`
          : `Twilio daily cap reached, resets within 24 hours (${n} not sent)`,
      );
    } else if (code === "63015") {
      notes.push(`${n} to phones that have not joined the WhatsApp sandbox`);
    } else {
      notes.push(`${n} failed with error ${code}`);
    }
  }
  return notes;
}
