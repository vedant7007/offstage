/**
 * Tickets: issue a signed token for a confirmed registration, and render it as a QR code.
 * The QR encodes the token itself, so scanners can verify it offline with the event key.
 */
import { and, eq } from "drizzle-orm";
import QRCode from "qrcode";
import type { UserActor } from "@/contracts";
import type { MyTicketResponse } from "@/contracts/api";
import { db, type Db } from "@/db/client";
import { events, registrations, tickets } from "@/db/schema";
import { signTicket } from "@/server/checkin/ticket";
import { notFound } from "@/server/http";

/** Tickets stay valid until a day after the event ends. */
const GRACE_MS = 24 * 60 * 60 * 1000;

type Tx = Pick<Db, "select" | "insert">;

export async function issueTicket(tx: Tx, input: { eventId: string; registrationId: string }) {
  const [ev] = await tx.select({ endsAt: events.endsAt }).from(events).where(eq(events.id, input.eventId));
  if (!ev) throw notFound("Event not found");
  const id = globalThis.crypto.randomUUID();
  const expiresAt = new Date(ev.endsAt.getTime() + GRACE_MS);
  const token = signTicket({
    ticketId: id,
    registrationId: input.registrationId,
    eventId: input.eventId,
    exp: Math.floor(expiresAt.getTime() / 1000),
  });
  const [row] = await tx
    .insert(tickets)
    .values({ id, eventId: input.eventId, registrationId: input.registrationId, token, expiresAt })
    .returning();
  if (!row) throw new Error("ticket insert returned nothing");
  return row;
}

export async function myTicketFor(registrationId: string): Promise<MyTicketResponse> {
  const [found] = await db
    .select({ row: tickets, checkedInAt: registrations.checkedInAt })
    .from(tickets)
    .innerJoin(registrations, eq(registrations.id, tickets.registrationId))
    .where(eq(tickets.registrationId, registrationId))
    .limit(1);
  if (!found) throw notFound("No ticket yet");
  const { row, checkedInAt } = found;
  return {
    ticket: {
      id: row.id,
      eventId: row.eventId,
      registrationId: row.registrationId,
      token: row.token,
      issuedAt: row.issuedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
      revoked: row.revoked,
    },
    // Medium error correction: survives a cracked phone screen, still scans at arm's length.
    qrPngDataUrl: await QRCode.toDataURL(row.token, { errorCorrectionLevel: "M", margin: 2, width: 320 }),
    checkedInAt: checkedInAt?.toISOString(),
  };
}

/** The caller's ticket for their active event. 404 until they have a confirmed registration. */
export async function getMyTicket(actor: UserActor): Promise<MyTicketResponse> {
  const [reg] = await db
    .select({ id: registrations.id, status: registrations.status })
    .from(registrations)
    .where(and(eq(registrations.eventId, actor.eventId), eq(registrations.userId, actor.userId)))
    .limit(1);
  if (!reg || reg.status !== "confirmed") throw notFound("You do not have a ticket for this event yet");
  return myTicketFor(reg.id);
}
