import { sql } from "drizzle-orm";
import { boolean, index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { createdAt, pk, ts, updatedAt, version } from "./_columns";
import { events } from "./core";

const eventRef = () =>
  text()
    .notNull()
    .references(() => events.id, { onDelete: "cascade" });

export const rooms = pgTable(
  "rooms",
  {
    id: pk(),
    eventId: eventRef(),
    name: text().notNull(),
    building: text(),
    kind: text().notNull(),
    capacity: integer().notNull(),
    features: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    version: version(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId)],
);

export const tracks = pgTable(
  "tracks",
  {
    id: pk(),
    eventId: eventRef(),
    name: text().notNull(),
    description: text(),
    version: version(),
  },
  (t) => [index().on(t.eventId)],
);

export const speakers = pgTable(
  "speakers",
  {
    id: pk(),
    eventId: eventRef(),
    name: text().notNull(),
    title: text(),
    organization: text(),
    bio: text(),
    /** Encrypted. Staff only. */
    emailEnc: text(),
    phoneEnc: text(),
    status: text().notNull().default("invited"),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId)],
);

export const sessions = pgTable(
  "sessions",
  {
    id: pk(),
    eventId: eventRef(),
    trackId: text().references(() => tracks.id, { onDelete: "set null" }),
    roomId: text()
      .notNull()
      .references(() => rooms.id),
    title: text().notNull(),
    description: text(),
    kind: text().notNull(),
    startsAt: ts().notNull(),
    endsAt: ts().notNull(),
    capacity: integer().notNull(),
    status: text().notNull().default("scheduled"),
    delayMinutes: integer().notNull().default(0),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId, t.startsAt), index().on(t.roomId, t.startsAt)],
);

export const sessionSpeakers = pgTable(
  "session_speakers",
  {
    sessionId: text()
      .notNull()
      .references(() => sessions.id, { onDelete: "cascade" }),
    speakerId: text()
      .notNull()
      .references(() => speakers.id, { onDelete: "cascade" }),
    role: text().$type<"speaker" | "judge" | "moderator">().notNull().default("speaker"),
  },
  (t) => [primaryKey({ columns: [t.sessionId, t.speakerId] }), index().on(t.speakerId)],
);

export const speakerRequirements = pgTable("speaker_requirements", {
  speakerId: text()
    .primaryKey()
    .references(() => speakers.id, { onDelete: "cascade" }),
  eventId: eventRef(),
  av: text()
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  travel: text(),
  stay: text(),
  materials: text(),
  notes: text(),
  /** sha256 of the form token in the speaker's link; the token itself is never stored. */
  formTokenHash: text().unique(),
  submittedAt: ts(),
  bioConfirmed: boolean().notNull().default(false),
  version: version(),
  updatedAt: updatedAt(),
});
