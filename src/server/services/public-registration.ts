/**
 * Public registration: OTP request and verify, then register.
 *
 *   otp/request   Turnstile, per-IP and per-email limits, then Better Auth sends the code.
 *   otp/verify    Better Auth checks the code and signs the person in (session cookie), and we
 *                 hand back a short-lived verificationToken bound to this email and event.
 *   register      Checks the token, then in one transaction (event row locked, so two people
 *                 cannot take the last seat): registration, session choices, consent, attendee
 *                 membership, ticket when confirmed, domain event and audit row.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { and, eq, inArray, sql } from "drizzle-orm";
import { APIError } from "better-auth/api";
import type { SystemActor } from "@/contracts";
import type {
  OtpRequest,
  OtpVerifyRequest,
  PublicRegisterRequest,
  PublicRegisterResponse,
} from "@/contracts/api";
import { db } from "@/db/client";
import * as t from "@/db/schema";
import { logger } from "@/lib/logger";
import { auth } from "@/server/auth";
import { sendEmail } from "@/server/channels/email";
import { ticketEmail } from "@/server/channels/templates";
import { audit, publish } from "@/server/events/bus";
import { badRequest, HttpError } from "@/server/http";
import { emailHash, encrypt, encryptOptional, normalisePhone, phoneHash } from "@/server/pii";
import { enforce, OTP_LIMITS } from "@/server/rate-limit";
import { verifyTurnstile } from "@/server/turnstile";
import { eventBySlug, invalidatePublic } from "./public";
import { issueTicket, myTicketFor } from "./tickets";

const log = logger.child({ module: "public-registration" });

const RESEND_AFTER_SECONDS = 30;
const TOKEN_TTL_SECONDS = 30 * 60;
const CONSENT_PURPOSES = ["registration", "ticketing", "event_communication", "certificates"];
const SYSTEM: SystemActor = { kind: "system" };

// ---------------------------------------------------------------------------
// Verification token: HMAC over {email hash, event, expiry}. No personal data inside.
// ---------------------------------------------------------------------------

function tokenKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set");
  return createHmac("sha256", secret).update("sutradhar-registration-token-v1").digest();
}

const mac = (body: string) => createHmac("sha256", tokenKey()).update(body).digest("base64url");

export function signVerificationToken(email: string, eventId: string, now = Date.now()): string {
  const body = Buffer.from(
    JSON.stringify({ h: emailHash(email), e: eventId, x: Math.floor(now / 1000) + TOKEN_TTL_SECONDS }),
  ).toString("base64url");
  return `${body}.${mac(body)}`;
}

export function checkVerificationToken(token: string, email: string, eventId: string, now = Date.now()) {
  const [body, sig] = token.split(".");
  const expected = body ? mac(body) : "";
  const ok =
    !!body &&
    !!sig &&
    sig.length === expected.length &&
    timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  if (!ok) return false;
  try {
    const c = JSON.parse(Buffer.from(body!, "base64url").toString("utf8")) as {
      h: string;
      e: string;
      x: number;
    };
    return c.h === emailHash(email) && c.e === eventId && c.x * 1000 > now;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// OTP
// ---------------------------------------------------------------------------

export async function requestOtp(slug: string, input: OtpRequest, ip: string, headerToken: string | null) {
  await eventBySlug(slug);
  await verifyTurnstile(input.turnstileToken ?? headerToken, ip);
  await enforce(
    `otp:ip:${ip}`,
    OTP_LIMITS.perIp.limit,
    OTP_LIMITS.perIp.windowSeconds,
    "Too many code requests from this network. Try again later.",
  );
  await enforce(
    `otp:email:${emailHash(input.email)}`,
    OTP_LIMITS.perEmail.limit,
    OTP_LIMITS.perEmail.windowSeconds,
    "Too many codes for this email. Wait a few minutes and try again.",
  );
  await auth.api.sendVerificationOTP({ body: { email: input.email, type: "sign-in" } });
  return { sent: true as const, resendAfterSeconds: RESEND_AFTER_SECONDS };
}

/** Check the code (Better Auth counts attempts) and sign the person in. Returns the cookie headers. */
export async function verifyOtp(slug: string, input: OtpVerifyRequest, headers: Headers) {
  const ev = await eventBySlug(slug);
  let setCookie: Headers;
  try {
    const r = await auth.api.signInEmailOTP({
      body: { email: input.email, otp: input.code },
      headers,
      returnHeaders: true,
    });
    setCookie = r.headers;
  } catch (err) {
    if (err instanceof APIError) throw new HttpError("otp_invalid", "That code is wrong or has expired");
    throw err;
  }
  return {
    body: { verified: true as const, verificationToken: signVerificationToken(input.email, ev.id) },
    headers: setCookie,
  };
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export async function register(
  slug: string,
  input: PublicRegisterRequest,
  ip: string,
  headerToken: string | null,
): Promise<PublicRegisterResponse> {
  const ev = await eventBySlug(slug);
  await verifyTurnstile(input.turnstileToken ?? headerToken, ip);
  if (!checkVerificationToken(input.verificationToken, input.email, ev.id))
    throw new HttpError("otp_invalid", "Verify your email again; the check has expired");

  const eHash = emailHash(input.email);
  const pHash = input.phone ? phoneHash(input.phone) : null;
  if (input.phone && !pHash) throw badRequest("That phone number does not look right");

  const result = await db.transaction(async (tx) => {
    // The lock that closes the last-seat race: one registration at a time per event.
    const [event] = await tx.execute<{ capacity: number; org_id: string }>(
      sql`select capacity, org_id from ${t.events} where id = ${ev.id} for update`,
    );
    if (!event) throw new HttpError("not_found", "Event not found");

    const [existing] = await tx
      .select({ id: t.registrations.id })
      .from(t.registrations)
      .where(and(eq(t.registrations.eventId, ev.id), eq(t.registrations.emailHash, eHash)))
      .limit(1);
    if (existing) throw new HttpError("conflict", "This email is already registered for this event");

    if (input.sessionChoices.length) {
      const found = await tx
        .select({ id: t.sessions.id })
        .from(t.sessions)
        .where(and(eq(t.sessions.eventId, ev.id), inArray(t.sessions.id, input.sessionChoices)));
      if (found.length !== new Set(input.sessionChoices).size) throw badRequest("Unknown session choice");
    }

    // Better Auth created the user when the code was verified.
    const [user] = await tx
      .select({ id: t.users.id })
      .from(t.users)
      .where(eq(t.users.email, input.email.trim().toLowerCase()))
      .limit(1);

    const [{ confirmed = 0, lastWait = 0 } = {}] = await tx
      .select({
        confirmed: sql<number>`count(*) filter (where ${t.registrations.status} = 'confirmed')::int`,
        lastWait: sql<number>`coalesce(max(${t.registrations.waitlistPosition}), 0)::int`,
      })
      .from(t.registrations)
      .where(eq(t.registrations.eventId, ev.id));
    const status = confirmed < event.capacity ? "confirmed" : "waitlisted";

    const suspects = await duplicateSuspects(tx, ev.id, pHash, input.name, input.college);

    const [reg] = await tx
      .insert(t.registrations)
      .values({
        eventId: ev.id,
        userId: user?.id ?? null,
        name: input.name,
        emailEnc: encrypt(input.email.trim()),
        emailHash: eHash,
        phoneEnc: encryptOptional(input.phone ? normalisePhone(input.phone) : null),
        phoneHash: pHash,
        college: input.college,
        department: input.department,
        year: input.year,
        section: input.section,
        rollNo: input.rollNo ?? null,
        status,
        waitlistPosition: status === "waitlisted" ? lastWait + 1 : null,
        foodPref: input.foodPref,
        accessibility: input.accessibility ?? null,
        adultConfirmed: input.adultConfirmed,
        guardianConsent: input.guardianConsent,
        consentVersion: input.consentVersion,
        duplicateOfId: suspects[0]?.registrationId ?? null,
      })
      .returning();
    if (!reg) throw new Error("registration insert returned nothing");

    if (input.sessionChoices.length)
      await tx.insert(t.sessionChoices).values(
        [...new Set(input.sessionChoices)].map((sessionId) => ({
          registrationId: reg.id,
          sessionId,
          eventId: ev.id,
        })),
      );

    await tx.insert(t.consents).values({
      eventId: ev.id,
      registrationId: reg.id,
      userId: user?.id ?? null,
      consentVersion: input.consentVersion,
      purposes: CONSENT_PURPOSES,
      adultConfirmed: input.adultConfirmed,
      guardianConsent: input.guardianConsent,
    });

    if (user)
      await tx
        .insert(t.memberships)
        .values({ orgId: event.org_id, eventId: ev.id, userId: user.id, role: "attendee" })
        .onConflictDoNothing();

    if (status === "confirmed") await issueTicket(tx, { eventId: ev.id, registrationId: reg.id });

    await publish(tx, {
      eventId: ev.id,
      type: "registration.created",
      entity: "registration",
      entityId: reg.id,
      actor: SYSTEM,
      payload: {
        registrationId: reg.id,
        status,
        sessionIds: input.sessionChoices,
        duplicateSuspects: suspects,
      },
    });
    await audit(tx, {
      eventId: ev.id,
      actor: SYSTEM,
      action: "registration.create",
      entity: "registration",
      entityId: reg.id,
      after: { status, waitlistPosition: reg.waitlistPosition, duplicateOfId: reg.duplicateOfId },
    });
    return { reg, userId: user?.id ?? null, suspects };
  });

  invalidatePublic(ev.id);
  const ticket = result.reg.status === "confirmed" ? await myTicketFor(result.reg.id) : undefined;
  void sendRegistrationEmail(input.email, slug, result.reg.status, result.reg.waitlistPosition).catch(
    (err: unknown) => log.error({ err }, "failed to send registration email"),
  );
  return {
    registrationId: result.reg.id,
    status: result.reg.status as "confirmed" | "waitlisted",
    waitlistPosition: result.reg.waitlistPosition ?? undefined,
    ticket,
    duplicateSuspected: result.suspects.length > 0,
  };
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Same phone, or same name at the same college. Registrar and a human decide; we only flag. */
async function duplicateSuspects(
  tx: Tx,
  eventId: string,
  pHash: string | null,
  name: string,
  college: string,
) {
  const out: { registrationId: string; matchType: "phone" | "fuzzy_name_college" }[] = [];
  if (pHash) {
    const rows = await tx
      .select({ id: t.registrations.id })
      .from(t.registrations)
      .where(and(eq(t.registrations.eventId, eventId), eq(t.registrations.phoneHash, pHash)))
      .limit(3);
    out.push(...rows.map((r) => ({ registrationId: r.id, matchType: "phone" as const })));
  }
  // ponytail: exact case-insensitive name and college; add pg_trgm similarity if near-misses matter.
  const rows = await tx
    .select({ id: t.registrations.id })
    .from(t.registrations)
    .where(
      and(
        eq(t.registrations.eventId, eventId),
        sql`lower(${t.registrations.name}) = lower(${name.trim()})`,
        sql`lower(${t.registrations.college}) = lower(${college.trim()})`,
      ),
    )
    .limit(3);
  for (const r of rows)
    if (!out.some((o) => o.registrationId === r.id))
      out.push({ registrationId: r.id, matchType: "fuzzy_name_college" });
  return out;
}

async function sendRegistrationEmail(
  to: string,
  slug: string,
  status: string,
  waitlistPosition: number | null,
): Promise<void> {
  const [ev] = await db
    .select({ name: t.events.name })
    .from(t.events)
    .where(eq(t.events.slug, slug))
    .limit(1);
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  await sendEmail({
    to,
    ...ticketEmail({
      eventName: ev?.name ?? "the event",
      ticketUrl: `${appUrl}/me/ticket`,
      waitlistPosition: status === "waitlisted" ? (waitlistPosition ?? undefined) : undefined,
    }),
    kind: status === "confirmed" ? "ticket" : "waitlist",
  });
}
