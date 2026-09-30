import "@/server/load-env";
import { and, asc, eq, inArray, isNull, sql as dsql } from "drizzle-orm";
import { DomainEventPayloads, type Actor } from "@/contracts";
import { DemoScenario } from "@/contracts/api";
import { HACKNOVA_SLUG } from "@/contracts/fixtures";
import { db, sql, type Db } from "@/db/client";
import * as t from "@/db/schema";
import { bumpVersion } from "@/db/versioning";
import { logger } from "@/lib/logger";
import { addMinutes, formatTime, nowUtc } from "@/lib/time";
import { syncDemoClock } from "@/server/clock";
import { audit, publish } from "@/server/events/bus";

const log = logger.child({ module: "demo.trigger" });

/** Scripted demo disruptions (blueprint Section 11). */
export const Scenario = DemoScenario;
export type Scenario = DemoScenario;

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
interface Ctx {
  tx: Tx;
  eventId: string;
  actor: Actor;
  now: Date;
}

function actorFor(eventId: string, scenario: Scenario): Actor {
  return { kind: "system", eventId, reason: `demo trigger ${scenario}` };
}

async function one<T>(rows: Promise<T[]>, what: string): Promise<T> {
  const r = (await rows)[0];
  if (!r) throw new Error(`Seeded ${what} not found. Run pnpm demo:reset first.`);
  return r;
}

// ---------------------------------------------------------------- scenarios

/** The keynote speaker cancels: session cancelled, speaker declined, session.cancelled published. */
async function speakerCancel({ tx, eventId, actor }: Ctx): Promise<string> {
  const session = await one(
    tx
      .select()
      .from(t.sessions)
      .where(and(eq(t.sessions.eventId, eventId), eq(t.sessions.title, "Keynote: Open source careers"))),
    "keynote session",
  );
  if (session.status === "cancelled")
    return `"${session.title}" is already cancelled; run pnpm demo:reset to replay.`;
  const links = await tx.select().from(t.sessionSpeakers).where(eq(t.sessionSpeakers.sessionId, session.id));
  const speakerIds = links.map((l) => l.speakerId);
  const [{ n: registered } = { n: 0 }] = await tx
    .select({ n: dsql<number>`count(*)::int` })
    .from(t.sessionChoices)
    .innerJoin(t.registrations, eq(t.registrations.id, t.sessionChoices.registrationId))
    .where(and(eq(t.sessionChoices.sessionId, session.id), eq(t.registrations.status, "confirmed")));

  await tx
    .update(t.sessions)
    .set({ status: "cancelled", version: bumpVersion(t.sessions) })
    .where(eq(t.sessions.id, session.id));
  if (speakerIds.length) {
    await tx
      .update(t.speakers)
      .set({ status: "declined", version: bumpVersion(t.speakers) })
      .where(inArray(t.speakers.id, speakerIds));
  }
  await audit(tx, {
    eventId,
    actor,
    action: "session.cancel",
    entity: "sessions",
    entityId: session.id,
    before: { status: session.status },
    after: { status: "cancelled" },
  });
  const payload = DomainEventPayloads["session.cancelled"].parse({
    sessionId: session.id,
    reason: "Speaker cancelled: flight cancelled, cannot reach Hyderabad today",
    speakerIds,
    registeredCount: registered,
  });
  const ev = await publish(tx, {
    eventId,
    type: "session.cancelled",
    entity: "sessions",
    entityId: session.id,
    actor,
    payload,
  });
  return `Cancelled "${session.title}" (${formatTime(session.startsAt)}, ${registered} registered). Published session.cancelled ${ev.id}.`;
}

/** Twelve people ask where lunch is within ten minutes. */
async function lunchConfusion({ tx, eventId, actor, now }: Ctx): Promise<string> {
  const questions = [
    "Where is lunch today?",
    "lunch kahan milega?",
    "What time is lunch and where?",
    "Is lunch in the auditorium?",
    "bhai khana kidhar hai",
    "Where do we collect lunch?",
    "Lunch kab hai aur kahan?",
    "Is the food court open for lunch?",
    "Where is the food court?",
    "Lunch coupon kahan dikhana hai?",
    "Are they serving lunch in Block B?",
    "Where is the lunch counter?",
  ];
  const attendees = await tx
    .select({ id: t.registrations.id, userId: t.registrations.userId })
    .from(t.registrations)
    .where(and(eq(t.registrations.eventId, eventId), eq(t.registrations.status, "confirmed")))
    .orderBy(asc(t.registrations.createdAt))
    .limit(40);
  let i = 0;
  for (const text of questions) {
    const at = addMinutes(now, -10 + Math.round((i * 10) / questions.length));
    const channel = i % 4 === 1 ? "telegram" : i % 4 === 3 ? "whatsapp" : "in_app";
    const [conv] = await tx
      .insert(t.conversations)
      .values({
        eventId,
        channel,
        userId: attendees[20 + i]?.userId ?? null,
        askerRole: "attendee",
        status: "open",
        createdAt: at,
      })
      .returning({ id: t.conversations.id });
    const [msg] = await tx
      .insert(t.messages)
      .values({ eventId, conversationId: conv!.id, role: "user", body: text, at })
      .returning({ id: t.messages.id });
    const payload = DomainEventPayloads["helpdesk.message"].parse({
      conversationId: conv!.id,
      messageId: msg!.id,
      channel,
      askerRole: "attendee",
      text,
    });
    await publish(tx, {
      eventId,
      type: "helpdesk.message",
      entity: "messages",
      entityId: msg!.id,
      actor,
      payload,
      at,
    });
    i++;
  }
  return `Inserted ${questions.length} lunch questions between ${formatTime(addMinutes(now, -10))} and ${formatTime(now)} IST, one helpdesk.message event each.`;
}

/** A Lab 204 support volunteer has not checked in ten minutes after the shift started. */
async function volunteerNoshow({ tx, eventId, actor }: Ctx): Promise<string> {
  const shift = await one(
    tx
      .select()
      .from(t.shifts)
      .where(and(eq(t.shifts.eventId, eventId), eq(t.shifts.role, "Lab support, Lab 204"))),
    "Lab 204 support shift",
  );
  const assignment = await one(
    tx
      .select({ a: t.shiftAssignments, name: t.volunteers.name })
      .from(t.shiftAssignments)
      .innerJoin(t.volunteers, eq(t.volunteers.id, t.shiftAssignments.volunteerId))
      .where(and(eq(t.shiftAssignments.shiftId, shift.id), eq(t.shiftAssignments.status, "assigned")))
      .orderBy(asc(t.shiftAssignments.id))
      .limit(1),
    "assigned volunteer on the Lab 204 shift (already missed? run pnpm demo:reset)",
  );
  await tx
    .update(t.shiftAssignments)
    .set({ status: "missed", version: bumpVersion(t.shiftAssignments) })
    .where(eq(t.shiftAssignments.id, assignment.a.id));
  await audit(tx, {
    eventId,
    actor,
    action: "shift.missed",
    entity: "shift_assignments",
    entityId: assignment.a.id,
    before: { status: "assigned" },
    after: { status: "missed" },
  });
  const payload = DomainEventPayloads["shift.missed"].parse({
    shiftId: shift.id,
    assignmentId: assignment.a.id,
    volunteerId: assignment.a.volunteerId,
    startsAt: shift.startsAt.toISOString(),
    minutesLate: 10,
  });
  await publish(tx, {
    eventId,
    type: "shift.missed",
    entity: "shift_assignments",
    entityId: assignment.a.id,
    actor,
    payload,
  });
  return `Marked ${assignment.name.split(" ")[0]} as a no-show on "${shift.role}" (starts ${formatTime(shift.startsAt)}). Published shift.missed.`;
}

/** Forty check-ins land in five minutes at the registration desk. */
async function queueSpike({ tx, eventId, actor, now }: Ctx): Promise<string> {
  const waiting = await tx
    .select({ reg: t.registrations.id, ticket: t.tickets.id })
    .from(t.registrations)
    .innerJoin(t.tickets, eq(t.tickets.registrationId, t.registrations.id))
    .where(
      and(
        eq(t.registrations.eventId, eventId),
        eq(t.registrations.status, "confirmed"),
        isNull(t.registrations.checkedInAt),
      ),
    )
    .orderBy(asc(t.registrations.createdAt))
    .limit(40);
  if (waiting.length === 0) return "Everyone is already checked in; run pnpm demo:reset to replay.";
  const scanner = await one(
    tx.select({ userId: t.users.id }).from(t.users).where(eq(t.users.email, "ravi@sutradhar.test")),
    "volunteer persona",
  );
  let i = 0;
  for (const w of waiting) {
    const at = addMinutes(now, -5 + (i * 5) / waiting.length);
    const clientId = `spike-${now.getTime()}-${i}`;
    const [c] = await tx
      .insert(t.checkins)
      .values({
        eventId,
        ticketId: w.ticket,
        registrationId: w.reg,
        scannerUserId: scanner.userId,
        clientId,
        deviceTime: at,
        serverTime: at,
      })
      .returning({ id: t.checkins.id });
    await tx
      .update(t.registrations)
      .set({ checkedInAt: at, version: bumpVersion(t.registrations) })
      .where(eq(t.registrations.id, w.reg));
    const payload = DomainEventPayloads["registration.checked_in"].parse({
      registrationId: w.reg,
      ticketId: w.ticket,
      checkinId: c!.id,
      scannerUserId: scanner.userId,
      deviceTime: at.toISOString(),
      offline: false,
    });
    await publish(tx, {
      eventId,
      type: "registration.checked_in",
      entity: "checkins",
      entityId: c!.id,
      actor,
      payload,
      at,
    });
    i++;
  }
  return `Inserted ${waiting.length} check-ins in the last 5 minutes (registration desk), one registration.checked_in event each.`;
}

/** A late catering bill pushes the catering category over 100% of its cap. */
async function budgetBreach({ tx, eventId, actor, now }: Ctx): Promise<string> {
  const cat = await one(
    tx
      .select()
      .from(t.budgetCategories)
      .where(and(eq(t.budgetCategories.eventId, eventId), eq(t.budgetCategories.key, "catering"))),
    "catering category",
  );
  const [entry] = await tx
    .insert(t.ledgerEntries)
    .values({
      eventId,
      type: "expense",
      categoryId: cat.id,
      amountInr: 12_000,
      status: "committed",
      vendor: "Annapurna Caterers",
      note: "Extra dinner for 80 late hackathon registrations",
      occurredOn: now.toISOString().slice(0, 10),
    })
    .returning({ id: t.ledgerEntries.id });
  const [{ used } = { used: 0 }] = await tx
    .select({ used: dsql<number>`coalesce(sum(${t.ledgerEntries.amountInr}), 0)::float` })
    .from(t.ledgerEntries)
    .where(and(eq(t.ledgerEntries.categoryId, cat.id), eq(t.ledgerEntries.type, "expense")));
  const ratio = Math.round((used / cat.capInr) * 10_000) / 10_000;
  await audit(tx, {
    eventId,
    actor,
    action: "ledger.insert",
    entity: "ledger_entries",
    entityId: entry!.id,
    after: { amountInr: 12_000, categoryId: cat.id },
  });
  await publish(tx, {
    eventId,
    type: "finance.expense_recorded",
    entity: "ledger_entries",
    entityId: entry!.id,
    actor,
    payload: { categoryId: cat.id, amountInr: 12_000, status: "committed" },
  });
  if (ratio >= 1) {
    const payload = DomainEventPayloads["finance.threshold_crossed"].parse({
      categoryId: cat.id,
      threshold: "100",
      spentRatio: ratio,
    });
    await publish(tx, {
      eventId,
      type: "finance.threshold_crossed",
      entity: "budget_categories",
      entityId: cat.id,
      actor,
      payload,
    });
  }
  return `Recorded a 12,000 INR catering expense. Catering is now at ${Math.round(ratio * 100)}% of its cap${ratio >= 1 ? "; published finance.threshold_crossed" : ""}.`;
}

/** A volunteer's Hinglish voice note about the Lab 204 projector, already transcribed. */
async function projectorVoiceNote({ tx, eventId, actor }: Ctx): Promise<string> {
  const ravi = await one(
    tx
      .select({ userId: t.volunteers.userId, volunteerId: t.volunteers.id })
      .from(t.volunteers)
      .innerJoin(t.users, eq(t.users.id, t.volunteers.userId))
      .where(and(eq(t.volunteers.eventId, eventId), eq(t.users.email, "ravi@sutradhar.test"))),
    "volunteer persona",
  );
  const transcript =
    "Lab 204 ka projector kaam nahi kar raha, screen pe kuch nahi aa raha. Workshop 11 baje hai, jaldi kisi ko bhejo.";
  const payload = DomainEventPayloads["voice_note.received"].parse({
    uploadPath: "uploads/demo/projector-voice-note.ogg",
    mimeType: "audio/ogg",
    durationSeconds: 9,
    fromUserId: ravi.userId ?? undefined,
    fromVolunteerId: ravi.volunteerId,
    channel: "telegram",
    transcript,
  });
  const ev = await publish(tx, {
    eventId,
    type: "voice_note.received",
    entity: "volunteers",
    entityId: ravi.volunteerId,
    actor,
    payload,
  });
  return `Published voice_note.received ${ev.id} from Ravi (transcript included; the demo has no audio file).`;
}

const RUNNERS: Record<Scenario, (ctx: Ctx) => Promise<string>> = {
  speaker_cancel: speakerCancel,
  lunch_confusion: lunchConfusion,
  volunteer_noshow: volunteerNoshow,
  queue_spike: queueSpike,
  budget_breach: budgetBreach,
  projector_voice_note: projectorVoiceNote,
};

export async function runScenario(scenario: Scenario, client: Db = db): Promise<string> {
  await syncDemoClock(client);
  const now = nowUtc();
  return client.transaction(async (tx) => {
    const ev = await one(
      tx.select({ id: t.events.id }).from(t.events).where(eq(t.events.slug, HACKNOVA_SLUG)),
      "HackNova event",
    );
    return RUNNERS[scenario]({ tx, eventId: ev.id, actor: actorFor(ev.id, scenario), now });
  });
}

async function main() {
  const parsed = Scenario.safeParse(process.argv[2]);
  if (!parsed.success) {
    console.error(`Usage: pnpm demo:trigger <${Scenario.options.join("|")}>`);
    process.exitCode = 2;
    return;
  }
  const result = await runScenario(parsed.data);
  log.info({ scenario: parsed.data }, "demo trigger done");
  console.log(`${parsed.data}: ${result}`);
}

if (process.argv[1]?.replace(/\\/g, "/").endsWith("src/db/demo/trigger.ts")) {
  main()
    .catch((err: unknown) => {
      log.error({ err }, "demo trigger failed");
      process.exitCode = 1;
    })
    .finally(() => sql.end({ timeout: 5 }));
}
