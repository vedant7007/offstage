/**
 * The close-out report (Chronicler). Every number is a SQL count over this event's rows; the model only
 * writes a short summary on request, and a summary with a number that is not in the report is thrown away
 * for a rules sentence. The summary is kept in app_settings with a hash of the numbers it was written from,
 * so it disappears as soon as the numbers change.
 */
import { createHash, randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { CloseoutReport, UserActor } from "@/contracts";
import { db as defaultDb, type Db } from "@/db/client";
import * as t from "@/db/schema";
import {
  closeoutFactLines as factLines,
  closeoutRulesSummary as rulesSummary,
  type CloseoutFacts,
} from "@/agents/chronicler/logic";
import { draft, onlyGivenNumbers } from "@/agents/runtime/wording";
import { nowUtc } from "@/lib/time";
import { requirePermission } from "@/server/authz";
import { notFound } from "@/server/http";

type Facts = CloseoutFacts;
const n = (v: unknown) => Number(v ?? 0);
const rows = async <T>(client: Db, q: ReturnType<typeof sql>) => (await client.execute(q)) as unknown as T[];

export async function closeoutFacts(eventId: string, client: Db = defaultDb): Promise<Facts> {
  const [ev] = await client.select({ name: t.events.name }).from(t.events).where(eq(t.events.id, eventId));
  if (!ev) throw notFound("Event not found");
  const [
    [att],
    [ses],
    msgs,
    [inApp],
    [help],
    [inc],
    cats,
    [income],
    tiers,
    certs,
    [od],
    incidentLessons,
    playbook,
  ] = await Promise.all([
    rows<Record<string, number>>(
      client,
      sql`select
        count(*) filter (where status <> 'cancelled') as registered,
        count(*) filter (where status = 'confirmed') as confirmed,
        (select count(distinct registration_id) from ${t.checkins} where event_id = ${eventId} and not duplicate) as attended,
        count(*) filter (where status = 'confirmed' and not exists (
          select 1 from ${t.checkins} c where c.registration_id = ${t.registrations.id} and not c.duplicate)) as no_shows
      from ${t.registrations} where event_id = ${eventId}`,
    ),
    rows<Record<string, number>>(
      client,
      sql`select count(*) as total, count(*) filter (where status = 'cancelled') as cancelled,
        (select count(distinct payload->>'sessionId') from ${t.proposals}
          where event_id = ${eventId} and status = 'executed' and kind like 'schedule.%') as changed
      from ${t.sessions} where event_id = ${eventId}`,
    ),
    rows<{ channel: string; real: number; mock: number; failed: number; skipped: number }>(
      client,
      sql`select channel, count(*) filter (where status = 'sent') as real,
        count(*) filter (where status = 'delivered_mock') as mock,
        count(*) filter (where status = 'failed') as failed,
        count(*) filter (where status = 'skipped') as skipped
      from ${t.outbox} where event_id = ${eventId} group by channel order by channel`,
    ),
    rows<{ n: number }>(
      client,
      sql`select count(*) as n from ${t.notifications} where event_id = ${eventId}`,
    ),
    rows<Record<string, number>>(
      client,
      sql`select
        (select count(*) from ${t.messages} where event_id = ${eventId} and role = 'user') as questions,
        (select count(*) from ${t.auditLog} where event_id = ${eventId} and action in ('helpdesk.input_blocked', 'voice.input_blocked')) as blocked,
        (select count(*) from ${t.escalations} where event_id = ${eventId}) as escalations,
        (select count(*) from ${t.escalations} where event_id = ${eventId} and status = 'open') as open`,
    ),
    rows<Record<string, number>>(
      client,
      sql`select count(*) as total, count(*) filter (where status = 'resolved') as resolved,
        count(*) filter (where status not in ('resolved', 'closed')) as open,
        count(*) filter (where emergency) as emergencies
      from ${t.incidents} where event_id = ${eventId}`,
    ),
    rows<{ name: string; cap: number; spent: number }>(
      client,
      sql`select c.name, c.cap_inr as cap, coalesce(sum(l.amount_inr) filter (
          where l.type = 'expense' and l.status in ('paid', 'committed')), 0) as spent
      from ${t.budgetCategories} c left join ${t.ledgerEntries} l on l.category_id = c.id
      where c.event_id = ${eventId} group by c.id, c.name, c.cap_inr order by c.name`,
    ),
    rows<{ n: number }>(
      client,
      sql`select coalesce(sum(amount_inr), 0) as n from ${t.ledgerEntries}
      where event_id = ${eventId} and type = 'income' and status = 'received'`,
    ),
    rows<{
      tier: CloseoutReport["approvals"][number]["tier"];
      total: number;
      executed: number;
      rejected: number;
      pending: number;
    }>(
      client,
      sql`select risk_tier as tier, count(*) as total,
        count(*) filter (where status = 'executed') as executed,
        count(*) filter (where status = 'rejected') as rejected,
        count(*) filter (where status = 'pending') as pending
      from ${t.proposals} where event_id = ${eventId} and parent_id is null group by risk_tier order by risk_tier`,
    ),
    rows<{ kind: string; issued: number; revoked: number; sample: string | null }>(
      client,
      sql`select kind, count(*) filter (where not revoked) as issued, count(*) filter (where revoked) as revoked,
        min(id) filter (where not revoked) as sample
      from ${t.certificates} where event_id = ${eventId} group by kind order by kind`,
    ),
    rows<Record<string, number>>(
      client,
      sql`select count(*) as lists, coalesce(sum(jsonb_array_length(entries)), 0) as students
      from ${t.odLists} where event_id = ${eventId}`,
    ),
    client
      .select({
        title: t.incidents.title,
        createdAt: t.incidents.createdAt,
        resolvedAt: t.incidents.resolvedAt,
      })
      .from(t.incidents)
      .where(
        and(
          eq(t.incidents.eventId, eventId),
          eq(t.incidents.status, "resolved"),
          eq(t.incidents.emergency, false),
        ),
      )
      .orderBy(t.incidents.createdAt)
      .limit(10),
    client
      .select({ title: t.playbookLessons.title, lesson: t.playbookLessons.lesson })
      .from(t.playbookLessons)
      .where(eq(t.playbookLessons.sourceEventId, eventId))
      .limit(10),
  ]);

  const confirmed = n(att?.confirmed);
  const attended = n(att?.attended);
  const categories = cats.map((c) => ({ name: c.name, capInr: n(c.cap), spentInr: n(c.spent) }));
  return {
    eventId,
    eventName: ev.name,
    attendance: {
      registered: n(att?.registered),
      confirmed,
      attended,
      noShows: n(att?.no_shows),
      ratePct: confirmed ? Math.round((attended / confirmed) * 1000) / 10 : 0,
    },
    sessions: { total: n(ses?.total), changed: n(ses?.changed), cancelled: n(ses?.cancelled) },
    messages: msgs.map((m) => ({
      channel: m.channel,
      real: n(m.real),
      mock: n(m.mock),
      failed: n(m.failed),
      skipped: n(m.skipped),
    })),
    inAppNotifications: n(inApp?.n),
    helpdesk: {
      questions: n(help?.questions),
      blocked: n(help?.blocked),
      escalations: n(help?.escalations),
      escalationsOpen: n(help?.open),
    },
    incidents: {
      total: n(inc?.total),
      resolved: n(inc?.resolved),
      open: n(inc?.open),
      emergencies: n(inc?.emergencies),
    },
    budget: {
      capInr: categories.reduce((s, c) => s + c.capInr, 0),
      spentInr: categories.reduce((s, c) => s + c.spentInr, 0),
      incomeInr: n(income?.n),
      categories,
    },
    approvals: tiers.map((r) => ({
      tier: r.tier,
      total: n(r.total),
      executed: n(r.executed),
      rejected: n(r.rejected),
      pending: n(r.pending),
      other: n(r.total) - n(r.executed) - n(r.rejected) - n(r.pending),
    })),
    certificates: {
      issued: certs.reduce((s, c) => s + n(c.issued), 0),
      revoked: certs.reduce((s, c) => s + n(c.revoked), 0),
      byKind: certs.map((c) => ({ kind: c.kind, count: n(c.issued) })),
      ...(certs.find((c) => c.sample)?.sample ? { sampleId: certs.find((c) => c.sample)!.sample! } : {}),
    },
    odLetters: { lists: n(od?.lists), students: n(od?.students) },
    lessons: [
      ...incidentLessons.map((i) => {
        const mins = i.resolvedAt ? Math.max(0, Math.round((+i.resolvedAt - +i.createdAt) / 60_000)) : null;
        return {
          title: i.title,
          detail: mins === null ? "Resolved." : `Resolved in ${mins} minutes. Plan for it next time.`,
          source: "incident" as const,
        };
      }),
      ...playbook.map((l) => ({ title: l.title, detail: l.lesson, source: "playbook" as const })),
    ],
  };
}

const hashOf = (f: Facts) => createHash("sha256").update(factLines(f)).digest("hex").slice(0, 16);
const summaryKey = (eventId: string) => `closeout-summary:${eventId}`;
type Stored = { hash: string; text: string; by: "model" | "rules"; generatedAt: string };

async function withSummary(f: Facts, client: Db): Promise<CloseoutReport> {
  const [row] = await client
    .select()
    .from(t.appSettings)
    .where(eq(t.appSettings.key, summaryKey(f.eventId)));
  const s = row?.value as Stored | undefined;
  return {
    ...f,
    generatedAt: nowUtc().toISOString(),
    summary: s && s.hash === hashOf(f) ? { text: s.text, by: s.by, generatedAt: s.generatedAt } : null,
  };
}

export async function getCloseout(actor: UserActor, client: Db = defaultDb): Promise<CloseoutReport> {
  requirePermission(actor, "event.read", { eventId: actor.eventId });
  return withSummary(await closeoutFacts(actor.eventId, client), client);
}

const Summary = z.object({ summary: z.string().max(1200) });

/** The model's summary of the numbers, or the rules sentence when it adds a number of its own. */
export async function writeCloseoutSummary(
  actor: UserActor,
  client: Db = defaultDb,
): Promise<CloseoutReport> {
  requirePermission(actor, "agents.command", { eventId: actor.eventId });
  const f = await closeoutFacts(actor.eventId, client);
  const facts = factLines(f);
  const out = await draft(
    { runId: `closeout:${randomUUID()}`, onAttempt: () => {}, critical: false },
    {
      schema: Summary,
      instructions:
        "Write the close-out summary of this event for the organising team: three or four plain sentences on attendance, changes, the helpdesk and incidents. Quote numbers exactly as given, and add no number that is not in the facts.",
      facts,
    },
  );
  const ok = !!out && onlyGivenNumbers(out.summary, `${facts}\n${facts.replace(/,/g, "")}`);
  const stored: Stored = {
    hash: hashOf(f),
    text: ok ? out!.summary : rulesSummary(f),
    by: ok ? "model" : "rules",
    generatedAt: nowUtc().toISOString(),
  };
  await client
    .insert(t.appSettings)
    .values({ key: summaryKey(f.eventId), value: stored })
    .onConflictDoUpdate({ target: t.appSettings.key, set: { value: stored, updatedAt: new Date() } });
  return withSummary(f, client);
}
