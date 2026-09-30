import { sql } from "drizzle-orm";
import { boolean, date, index, integer, jsonb, numeric, pgTable, text } from "drizzle-orm/pg-core";
import type { Briefing, WhatIfResult } from "@/contracts";
import { createdAt, pk, ts, updatedAt, version } from "./_columns";
import { events, orgs, users } from "./core";
import { registrations } from "./registrations";
import { volunteers } from "./crew";

const eventRef = () =>
  text()
    .notNull()
    .references(() => events.id, { onDelete: "cascade" });

// ---------------------------------------------------------------- planning

export const milestones = pgTable(
  "milestones",
  {
    id: pk(),
    eventId: eventRef(),
    title: text().notNull(),
    domain: text().notNull(),
    dueOn: date({ mode: "string" }).notNull(),
    status: text().notNull().default("not_started"),
    ownerRole: text().notNull(),
    dependsOn: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    critical: boolean().notNull().default(false),
    notes: text(),
    completedAt: ts(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId, t.dueOn)],
);

// ---------------------------------------------------------------- logistics

export const checklists = pgTable(
  "checklists",
  {
    id: pk(),
    eventId: eventRef(),
    title: text().notNull(),
    scopeType: text().$type<"room" | "vendor" | "event">().notNull(),
    scopeRef: text(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId)],
);

export const checklistItems = pgTable(
  "checklist_items",
  {
    id: pk(),
    eventId: eventRef(),
    checklistId: text()
      .notNull()
      .references(() => checklists.id, { onDelete: "cascade" }),
    ordinal: integer().notNull().default(0),
    label: text().notNull(),
    status: text().notNull().default("todo"),
    notes: text(),
    version: version(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.checklistId)],
);

export const inventoryItems = pgTable(
  "inventory_items",
  {
    id: pk(),
    eventId: eventRef(),
    name: text().notNull(),
    count: integer().notNull().default(0),
    unit: text(),
    version: version(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId)],
);

// ---------------------------------------------------------------- commander outputs

export const briefings = pgTable(
  "briefings",
  {
    id: pk(),
    eventId: eventRef(),
    date: date({ mode: "string" }).notNull(),
    scope: jsonb().$type<Briefing["scope"]>().notNull(),
    sections: jsonb().$type<Briefing["sections"]>().notNull(),
    facts: jsonb().$type<Briefing["facts"]>().notNull(),
    generatedBy: text().$type<"model" | "rules">().notNull(),
    generatedAt: createdAt(),
  },
  (t) => [index().on(t.eventId, t.date)],
);

export const whatifRuns = pgTable(
  "whatif_runs",
  {
    id: pk(),
    eventId: eventRef(),
    scenario: text().notNull(),
    result: jsonb().$type<WhatIfResult>().notNull(),
    createdByUserId: text().references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.eventId, t.createdAt)],
);

// ---------------------------------------------------------------- post-event

export const certificates = pgTable(
  "certificates",
  {
    id: pk(),
    eventId: eventRef(),
    kind: text().notNull(),
    recipientName: text().notNull(),
    title: text().notNull(),
    registrationId: text().references(() => registrations.id, { onDelete: "set null" }),
    volunteerId: text().references(() => volunteers.id, { onDelete: "set null" }),
    hours: numeric({ precision: 5, scale: 1, mode: "number" }),
    issuedBy: text().notNull(),
    filePath: text(),
    revoked: boolean().notNull().default(false),
    revokedAt: ts(),
    proposalId: text(),
    issuedAt: createdAt(),
  },
  (t) => [index().on(t.eventId), index().on(t.registrationId)],
);

export const odLists = pgTable(
  "od_lists",
  {
    id: pk(),
    eventId: eventRef(),
    department: text().notNull(),
    year: integer().notNull(),
    section: text(),
    date: date({ mode: "string" }).notNull(),
    timeFrom: ts().notNull(),
    timeTo: ts().notNull(),
    entries: jsonb().$type<{ name: string; rollNo: string; year: number; section: string }[]>().notNull(),
    status: text().notNull().default("draft"),
    filePath: text(),
    proposalId: text(),
    generatedAt: createdAt(),
  },
  (t) => [index().on(t.eventId)],
);

export const feedback = pgTable(
  "feedback",
  {
    id: pk(),
    eventId: eventRef(),
    registrationId: text().references(() => registrations.id, { onDelete: "set null" }),
    rating: integer().notNull(),
    answers: jsonb().$type<Record<string, string>>().notNull().default({}),
    comment: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.eventId)],
);

/** Lessons outlive events: scoped to the org and the event type, not one event. */
export const playbookLessons = pgTable(
  "playbook_lessons",
  {
    id: pk(),
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    eventType: text().notNull(),
    title: text().notNull(),
    lesson: text().notNull(),
    tags: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    evidenceRefs: text()
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sourceEventId: text().references(() => events.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.orgId, t.eventType)],
);
