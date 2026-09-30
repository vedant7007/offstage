import { boolean, index, integer, pgTable, primaryKey, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, pk, ts, updatedAt, version } from "./_columns";
import { events, users } from "./core";
import { sessions } from "./program";

const eventRef = () =>
  text()
    .notNull()
    .references(() => events.id, { onDelete: "cascade" });

export const teams = pgTable(
  "teams",
  {
    id: pk(),
    eventId: eventRef(),
    name: text().notNull(),
    version: version(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.eventId)],
);

export const registrations = pgTable(
  "registrations",
  {
    id: pk(),
    eventId: eventRef(),
    userId: text().references(() => users.id, { onDelete: "set null" }),
    name: text().notNull(),
    /** AES-256-GCM, see src/server/pii.ts. */
    emailEnc: text().notNull(),
    /** Keyed hash of the normalised email, for uniqueness and lookup. */
    emailHash: text().notNull(),
    phoneEnc: text(),
    phoneHash: text(),
    college: text().notNull(),
    department: text().notNull(),
    year: integer().notNull(),
    section: text().notNull(),
    rollNo: text(),
    status: text().notNull().default("pending"),
    waitlistPosition: integer(),
    teamId: text().references(() => teams.id, { onDelete: "set null" }),
    foodPref: text().notNull(),
    accessibility: text(),
    adultConfirmed: boolean().notNull(),
    guardianConsent: boolean().notNull().default(false),
    consentVersion: text().notNull(),
    duplicateOfId: text(),
    checkedInAt: ts(),
    /** Set when personal data was removed (retention purge or delete request). */
    anonymisedAt: ts(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex().on(t.eventId, t.emailHash),
    index().on(t.eventId, t.status),
    index().on(t.eventId, t.phoneHash),
    index().on(t.userId),
  ],
);

export const sessionChoices = pgTable(
  "session_choices",
  {
    registrationId: text()
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    sessionId: text()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    eventId: eventRef(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.registrationId, t.sessionId] }), index().on(t.sessionId)],
);

export const tickets = pgTable(
  "tickets",
  {
    id: pk(),
    eventId: eventRef(),
    registrationId: text()
      .notNull()
      .unique()
      .references(() => registrations.id, { onDelete: "cascade" }),
    /** Compact signed token 'payload.signature'. */
    token: text().notNull(),
    issuedAt: createdAt(),
    expiresAt: ts().notNull(),
    revoked: boolean().notNull().default(false),
    revokedAt: ts(),
    version: version(),
  },
  (t) => [index().on(t.eventId, t.revoked)],
);

export const checkins = pgTable(
  "checkins",
  {
    id: pk(),
    eventId: eventRef(),
    ticketId: text()
      .notNull()
      .references(() => tickets.id, { onDelete: "cascade" }),
    registrationId: text()
      .notNull()
      .references(() => registrations.id, { onDelete: "cascade" }),
    sessionId: text().references(() => sessions.id, { onDelete: "set null" }),
    scannerUserId: text()
      .notNull()
      .references(() => users.id),
    clientId: text().notNull(),
    deviceTime: ts().notNull(),
    serverTime: createdAt(),
    duplicate: boolean().notNull().default(false),
    originalCheckinId: text(),
  },
  (t) => [
    uniqueIndex().on(t.eventId, t.clientId),
    index().on(t.registrationId),
    index().on(t.eventId, t.serverTime),
  ],
);
