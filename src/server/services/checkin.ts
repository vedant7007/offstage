/**
 * Ticket check-in, online (one scan) and offline sync (a batch from a scanner that lost WiFi).
 *
 * - The signature, expiry and event are checked before anything in the token is trusted.
 * - First scan wins: the registration row is locked, so two scanners at once cannot both win.
 *   Later scans are stored with duplicate=true and answer "already checked in at 10:42 by Ravi".
 * - A repeated clientId returns the stored result, so a scanner can resend a batch safely.
 * - Gate check-in (no sessionId) and each session's check-in are counted separately.
 */
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import type { Checkin, UserActor } from "@/contracts";
import type { CheckinRequest, CheckinResult } from "@/contracts/api";
import { db, type Db } from "@/db/client";
import { checkins, registrations, sessions, tickets, users } from "@/db/schema";
import { nowUtc } from "@/lib/time";
import { requirePermission } from "@/server/authz";
import { verifyTicket } from "@/server/checkin/ticket";
import { audit, publish } from "@/server/events/bus";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Row = typeof checkins.$inferSelect;

function toCheckin(r: Row, scannerName?: string): Checkin {
  return {
    id: r.id,
    eventId: r.eventId,
    ticketId: r.ticketId,
    registrationId: r.registrationId,
    sessionId: r.sessionId ?? undefined,
    scannerUserId: r.scannerUserId,
    scannerName,
    clientId: r.clientId,
    deviceTime: r.deviceTime.toISOString(),
    serverTime: r.serverTime.toISOString(),
    duplicate: r.duplicate,
    originalCheckinId: r.originalCheckinId ?? undefined,
  };
}

async function scannerName(client: Pick<Db, "select">, userId: string): Promise<string | undefined> {
  const [u] = await client.select({ name: users.name }).from(users).where(eq(users.id, userId)).limit(1);
  // First name only on the scanner screen: "already checked in by Ravi".
  return u?.name.split(" ")[0];
}

/** Build the answer for a stored check-in row (new, duplicate, or a resent clientId). */
async function resultFor(client: Tx, row: Row): Promise<CheckinResult> {
  const [reg] = await client
    .select({ id: registrations.id, name: registrations.name, college: registrations.college })
    .from(registrations)
    .where(eq(registrations.id, row.registrationId));
  const checkin = toCheckin(row, await scannerName(client, row.scannerUserId));
  if (!row.duplicate) return { clientId: row.clientId, status: "checked_in", registration: reg, checkin };
  const [orig] = row.originalCheckinId
    ? await client.select().from(checkins).where(eq(checkins.id, row.originalCheckinId))
    : [];
  return {
    clientId: row.clientId,
    status: "duplicate",
    registration: reg,
    checkin,
    original: orig
      ? {
          at: orig.serverTime.toISOString(),
          scannerName: (await scannerName(client, orig.scannerUserId)) ?? "staff",
        }
      : undefined,
  };
}

async function scanOne(actor: UserActor, scan: CheckinRequest, offline: boolean): Promise<CheckinResult> {
  const eventId = actor.eventId;
  const fail = (status: CheckinResult["status"]): CheckinResult => ({ clientId: scan.clientId, status });

  const check = verifyTicket(
    { payload: scan.ticketPayload, signature: scan.signature },
    { eventId, now: nowUtc() },
  );
  if (!check.ok)
    return fail(
      check.reason === "expired" ? "expired" : check.reason === "wrong_event" ? "wrong_event" : "invalid",
    );
  const { ticketId, registrationId } = check.claims;

  return db.transaction(async (tx) => {
    // Serialise scans of one person: whoever takes this lock first is the first scan. It also
    // makes a resent clientId wait for the original insert and find it below.
    const [reg] = await tx.execute<{ status: string }>(
      sql`select status from ${registrations} where id = ${registrationId} and event_id = ${eventId} for update`,
    );
    if (!reg) return fail("invalid");

    const [seen] = await tx
      .select()
      .from(checkins)
      .where(and(eq(checkins.eventId, eventId), eq(checkins.clientId, scan.clientId)));
    if (seen) return resultFor(tx, seen);

    const [ticket] = await tx
      .select({ id: tickets.id, revoked: tickets.revoked, registrationId: tickets.registrationId })
      .from(tickets)
      .where(and(eq(tickets.id, ticketId), eq(tickets.eventId, eventId)));
    if (!ticket || ticket.registrationId !== registrationId) return fail("invalid");
    if (ticket.revoked) return fail("revoked");

    if (scan.sessionId) {
      const [s] = await tx
        .select({ id: sessions.id })
        .from(sessions)
        .where(and(eq(sessions.id, scan.sessionId), eq(sessions.eventId, eventId)));
      if (!s) return fail("invalid");
    }
    if (reg.status !== "confirmed") return fail("revoked");

    const [original] = await tx
      .select()
      .from(checkins)
      .where(
        and(
          eq(checkins.registrationId, registrationId),
          eq(checkins.duplicate, false),
          scan.sessionId ? eq(checkins.sessionId, scan.sessionId) : isNull(checkins.sessionId),
        ),
      )
      .orderBy(asc(checkins.serverTime))
      .limit(1);

    const [row] = await tx
      .insert(checkins)
      .values({
        eventId,
        ticketId,
        registrationId,
        sessionId: scan.sessionId ?? null,
        scannerUserId: actor.userId,
        clientId: scan.clientId,
        deviceTime: new Date(scan.deviceTime),
        serverTime: nowUtc(),
        duplicate: !!original,
        originalCheckinId: original?.id ?? null,
      })
      .returning();
    if (!row) throw new Error("checkin insert returned nothing");

    if (!original) {
      if (!scan.sessionId)
        await tx
          .update(registrations)
          .set({ checkedInAt: row.serverTime, version: sql`${registrations.version} + 1` })
          .where(eq(registrations.id, registrationId));
      await publish(tx, {
        eventId,
        type: "registration.checked_in",
        entity: "registration",
        entityId: registrationId,
        actor,
        payload: {
          registrationId,
          ticketId,
          checkinId: row.id,
          sessionId: scan.sessionId,
          scannerUserId: actor.userId,
          deviceTime: row.deviceTime.toISOString(),
          offline,
        },
      });
    }
    await audit(tx, {
      eventId,
      actor,
      action: original ? "checkin.duplicate" : "checkin.create",
      entity: "checkin",
      entityId: row.id,
      after: { registrationId, sessionId: scan.sessionId ?? null, offline, duplicate: !!original },
    });
    return resultFor(tx, row);
  });
}

export async function checkIn(actor: UserActor, scan: CheckinRequest): Promise<CheckinResult> {
  requirePermission(actor, "checkin.scan", { eventId: actor.eventId });
  return scanOne(actor, scan, false);
}

/**
 * Offline batch. Scans are applied in device-time order, so within one scanner's batch the
 * earlier scan wins.
 * ponytail: a scan that happened offline before another scanner's online scan still loses if it
 * syncs later; re-ranking stored check-ins by device time is the upgrade if that matters.
 */
export async function syncCheckins(actor: UserActor, scans: CheckinRequest[]): Promise<CheckinResult[]> {
  requirePermission(actor, "checkin.scan", { eventId: actor.eventId });
  const ordered = [...scans].sort((a, b) => a.deviceTime.localeCompare(b.deviceTime));
  const byClient = new Map<string, CheckinResult>();
  for (const scan of ordered) byClient.set(scan.clientId, await scanOne(actor, scan, true));
  // Answer in the order the scanner sent them.
  return scans.map((s) => byClient.get(s.clientId)!);
}
