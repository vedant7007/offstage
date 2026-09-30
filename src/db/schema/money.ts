import {
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createdAt, pk, ts, updatedAt, version } from "./_columns";
import { events } from "./core";

const eventRef = () =>
  text()
    .notNull()
    .references(() => events.id, { onDelete: "cascade" });
const inr = () => numeric({ precision: 12, scale: 2, mode: "number" });

// ---------------------------------------------------------------- finance

export const budgetCategories = pgTable(
  "budget_categories",
  {
    id: pk(),
    eventId: eventRef(),
    key: text().notNull(),
    name: text().notNull(),
    capInr: inr().notNull(),
    version: version(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex().on(t.eventId, t.key)],
);

export const ledgerEntries = pgTable(
  "ledger_entries",
  {
    id: pk(),
    eventId: eventRef(),
    type: text().$type<"expense" | "income" | "refund">().notNull(),
    categoryId: text().references(() => budgetCategories.id, { onDelete: "set null" }),
    amountInr: inr().notNull(),
    status: text().notNull(),
    vendor: text(),
    source: text(),
    sponsorId: text(),
    note: text().notNull(),
    evidenceRef: text(),
    occurredOn: date({ mode: "string" }).notNull(),
    proposalId: text(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId, t.type), index().on(t.categoryId)],
);

export const quotes = pgTable(
  "quotes",
  {
    id: pk(),
    eventId: eventRef(),
    title: text().notNull(),
    categoryId: text().references(() => budgetCategories.id, { onDelete: "set null" }),
    rows: jsonb()
      .$type<{ vendor: string; amountInr: number; items?: string; notes?: string; validUntil?: string }[]>()
      .notNull(),
    recommendedVendor: text(),
    proposalId: text(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.eventId)],
);

// ---------------------------------------------------------------- sponsors

export const sponsorProspects = pgTable(
  "sponsor_prospects",
  {
    id: pk(),
    eventId: eventRef(),
    name: text().notNull(),
    stage: text().notNull().default("prospect"),
    tier: text(),
    fitReason: text().notNull().default(""),
    contactName: text(),
    contactEmailEnc: text(),
    askInr: inr(),
    committedInr: inr(),
    lastTouchAt: ts(),
    nextFollowUpAt: ts(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId, t.stage)],
);

export const sponsorTouchpoints = pgTable(
  "sponsor_touchpoints",
  {
    id: pk(),
    eventId: eventRef(),
    prospectId: text()
      .notNull()
      .references(() => sponsorProspects.id, { onDelete: "cascade" }),
    kind: text().$type<"email" | "call" | "meeting" | "reply" | "note">().notNull(),
    direction: text().$type<"out" | "in">().notNull(),
    summary: text().notNull(),
    /** Draft body awaiting review, for outreach drafts. */
    draftBody: text(),
    at: createdAt(),
  },
  (t) => [index().on(t.prospectId, t.at)],
);

export const sponsorDeliverables = pgTable(
  "sponsor_deliverables",
  {
    id: pk(),
    eventId: eventRef(),
    prospectId: text()
      .notNull()
      .references(() => sponsorProspects.id, { onDelete: "cascade" }),
    title: text().notNull(),
    status: text().notNull().default("pending"),
    dueOn: date({ mode: "string" }),
    evidenceRef: text(),
    version: version(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.prospectId)],
);

// ---------------------------------------------------------------- marketing

export const marketingPosts = pgTable(
  "marketing_posts",
  {
    id: pk(),
    eventId: eventRef(),
    platform: text().notNull(),
    body: text().notNull(),
    hashtags: text().array().notNull().default([]),
    posterBrief: text(),
    status: text().notNull().default("draft"),
    scheduledFor: ts(),
    postedAt: ts(),
    proposalId: text(),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId, t.status)],
);

export const funnelSnapshots = pgTable(
  "funnel_snapshots",
  {
    eventId: eventRef(),
    date: date({ mode: "string" }).notNull(),
    registrations: integer().notNull(),
    target: integer().notNull(),
  },
  (t) => [primaryKey({ columns: [t.eventId, t.date] })],
);
