import { sql } from "drizzle-orm";
import { boolean, index, integer, numeric, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core";
import { createdAt, pk, ts, updatedAt, version } from "./_columns";
import { events, users } from "./core";
import { rooms, sessions } from "./program";

const eventRef = () =>
  text()
    .notNull()
    .references(() => events.id, { onDelete: "cascade" });

export const volunteers = pgTable(
  "volunteers",
  {
    id: pk(),
    eventId: eventRef(),
    userId: text().references(() => users.id, { onDelete: "set null" }),
    name: text().notNull(),
    phoneEnc: text(),
    phoneHash: text(),
    skills: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    maxHours: numeric({ precision: 4, scale: 1, mode: "number" }).notNull().default(8),
    active: boolean().notNull().default(true),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId), uniqueIndex().on(t.eventId, t.userId)],
);

export const availability = pgTable(
  "availability",
  {
    id: pk(),
    eventId: eventRef(),
    volunteerId: text()
      .notNull()
      .references(() => volunteers.id, { onDelete: "cascade" }),
    start: ts().notNull(),
    end: ts().notNull(),
  },
  (t) => [index().on(t.eventId), index().on(t.volunteerId)],
);

export const shifts = pgTable(
  "shifts",
  {
    id: pk(),
    eventId: eventRef(),
    role: text().notNull(),
    roomId: text().references(() => rooms.id, { onDelete: "set null" }),
    sessionId: text().references(() => sessions.id, { onDelete: "set null" }),
    startsAt: ts().notNull(),
    endsAt: ts().notNull(),
    requiredCount: integer().notNull().default(1),
    skills: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    briefingMarkdown: text(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId, t.startsAt)],
);

export const shiftAssignments = pgTable(
  "shift_assignments",
  {
    id: pk(),
    eventId: eventRef(),
    shiftId: text()
      .notNull()
      .references(() => shifts.id, { onDelete: "cascade" }),
    volunteerId: text()
      .notNull()
      .references(() => volunteers.id, { onDelete: "cascade" }),
    status: text().notNull().default("assigned"),
    checkedInAt: ts(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex().on(t.shiftId, t.volunteerId), index().on(t.eventId), index().on(t.volunteerId)],
);

export const tasks = pgTable(
  "tasks",
  {
    id: pk(),
    eventId: eventRef(),
    title: text().notNull(),
    description: text(),
    assigneeVolunteerId: text().references(() => volunteers.id, { onDelete: "set null" }),
    skill: text(),
    roomId: text().references(() => rooms.id, { onDelete: "set null" }),
    incidentId: text(),
    status: text().notNull().default("open"),
    priority: text().notNull().default("normal"),
    dueAt: ts(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId, t.status), index().on(t.assigneeVolunteerId)],
);

export const incidents = pgTable(
  "incidents",
  {
    id: pk(),
    eventId: eventRef(),
    title: text().notNull(),
    category: text().notNull(),
    severity: text().notNull(),
    status: text().notNull().default("open"),
    source: text().notNull(),
    description: text().notNull().default(""),
    roomId: text().references(() => rooms.id, { onDelete: "set null" }),
    emergency: boolean().notNull().default(false),
    reportedByUserId: text().references(() => users.id, { onDelete: "set null" }),
    assigneeUserId: text().references(() => users.id, { onDelete: "set null" }),
    evidenceRefs: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    resolvedAt: ts(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId, t.status)],
);
