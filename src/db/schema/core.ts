import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { Actor, Domain, EventBrief, EventSettings, Role, Venue } from "@/contracts";
import { createdAt, pk, ts, updatedAt, version } from "./_columns";

export const orgs = pgTable("orgs", {
  id: pk(),
  name: text().notNull(),
  slug: text().notNull().unique(),
  createdAt: createdAt(),
});

/** Shape matches Better Auth's user table (id, name, email, emailVerified, image, createdAt, updatedAt). */
export const users = pgTable("users", {
  id: pk(),
  name: text().notNull(),
  email: text().notNull().unique().$type<string>(),
  emailVerified: boolean().notNull().default(false),
  image: text(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const events = pgTable(
  "events",
  {
    id: pk(),
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    slug: text().notNull().unique(),
    name: text().notNull(),
    type: text().notNull(),
    tagline: text(),
    description: text().notNull().default(""),
    startsAt: ts().notNull(),
    endsAt: ts().notNull(),
    timezone: text().notNull().default("Asia/Kolkata"),
    venue: jsonb().$type<Venue>().notNull(),
    capacity: integer().notNull().default(0),
    status: text().notNull().default("draft"),
    settings: jsonb().$type<EventSettings>().notNull(),
    brief: jsonb().$type<EventBrief>(),
    /** Global agent kill switch for this event. Humans can still approve and execute. */
    agentsEnabled: boolean().notNull().default(true),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.orgId)],
);

export const memberships = pgTable(
  "memberships",
  {
    id: pk(),
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    eventId: text()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text().$type<Role>().notNull(),
    domains: text()
      .array()
      .$type<Domain[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex().on(t.eventId, t.userId), index().on(t.userId)],
);

export const agentConfigs = pgTable(
  "agent_configs",
  {
    id: pk(),
    eventId: text()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    agent: text().notNull(),
    enabled: boolean().notNull().default(true),
    autoApproveT1: boolean().notNull().default(true),
    humanLeadRole: text().$type<Role>().notNull(),
    humanLeadUserId: text().references(() => users.id, { onDelete: "set null" }),
    mandate: text(),
    modelTier: text().notNull().default("fast"),
    version: version(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex().on(t.eventId, t.agent)],
);

/** Shared daily model spend, so the web app and the worker count against one cap (issue #14). */
export const usageBudget = pgTable(
  "usage_budget",
  {
    id: pk(),
    orgId: text()
      .notNull()
      .references(() => orgs.id, { onDelete: "cascade" }),
    eventId: text().references(() => events.id, { onDelete: "cascade" }),
    /** Calendar day in IST, the unit the cap resets on. */
    day: date({ mode: "string" }).notNull(),
    spentUsd: numeric({ precision: 12, scale: 6, mode: "number" }).notNull().default(0),
    capUsd: numeric({ precision: 12, scale: 6, mode: "number" }).notNull(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("usage_budget_scope_day").on(t.orgId, sql`coalesce(${t.eventId}, '')`, t.day)],
);

export const consents = pgTable(
  "consents",
  {
    id: pk(),
    eventId: text()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    registrationId: text(),
    volunteerId: text(),
    userId: text().references(() => users.id, { onDelete: "set null" }),
    consentVersion: text().notNull(),
    purposes: text().array().notNull(),
    adultConfirmed: boolean().notNull(),
    guardianConsent: boolean().notNull().default(false),
    givenAt: createdAt(),
    withdrawnAt: ts(),
  },
  (t) => [index().on(t.eventId), index().on(t.registrationId)],
);

export const dataRequests = pgTable(
  "data_requests",
  {
    id: pk(),
    eventId: text()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    userId: text().references(() => users.id, { onDelete: "set null" }),
    registrationId: text(),
    type: text().$type<"export" | "delete">().notNull(),
    status: text().$type<"received" | "approved" | "completed" | "rejected">().notNull().default("received"),
    note: text(),
    resolvedBy: text(),
    createdAt: createdAt(),
    resolvedAt: ts(),
  },
  (t) => [index().on(t.eventId, t.status)],
);

/** Append-only. The app role has no UPDATE or DELETE here and a trigger rejects both. */
export const auditLog = pgTable(
  "audit_log",
  {
    seq: bigserial({ mode: "number" }).primaryKey(),
    eventId: text().references(() => events.id, { onDelete: "cascade" }),
    actor: jsonb().$type<Actor>().notNull(),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    before: jsonb().$type<Record<string, unknown>>(),
    after: jsonb().$type<Record<string, unknown>>(),
    proposalId: text(),
    at: createdAt(),
  },
  (t) => [index().on(t.eventId, t.at), index().on(t.entity, t.entityId)],
);

/** Append-only. `seq` orders the stream and lets SSE clients resume. */
export const domainEvents = pgTable(
  "domain_events",
  {
    seq: bigserial({ mode: "number" }).primaryKey(),
    id: text()
      .notNull()
      .unique()
      .default(sql`gen_random_uuid()::text`),
    eventId: text()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    type: text().notNull(),
    entity: text().notNull(),
    entityId: text().notNull(),
    actor: jsonb().$type<Actor>().notNull(),
    payload: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    at: createdAt(),
  },
  (t) => [index().on(t.eventId, t.seq), index().on(t.eventId, t.type)],
);

/** One row per recipient per channel. The channel worker delivers pending rows. */
export const outbox = pgTable(
  "outbox",
  {
    id: pk(),
    eventId: text()
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    channel: text().notNull(),
    driver: text().notNull(),
    /** Encrypted address (email, phone, chat id). */
    toEnc: text().notNull(),
    recipientType: text().notNull(),
    recipientId: text(),
    subject: text(),
    body: text().notNull(),
    meta: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    /** sha256 of recipient + body; blocks repeats within 24 hours. */
    dedupeKey: text().notNull(),
    status: text()
      .$type<"pending" | "sending" | "sent" | "failed" | "skipped">()
      .notNull()
      .default("pending"),
    attempts: integer().notNull().default(0),
    providerId: text(),
    error: text(),
    announcementId: text(),
    proposalId: text(),
    scheduledFor: ts().notNull().defaultNow(),
    sentAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.status, t.scheduledFor),
    index().on(t.eventId),
    index().on(t.recipientId, t.createdAt),
    index().on(t.dedupeKey),
  ],
);

/** Small key-value store for process-wide settings, such as the demo clock offset. */
export const appSettings = pgTable("app_settings", {
  key: text().primaryKey(),
  value: jsonb().$type<unknown>().notNull(),
  updatedAt: updatedAt(),
});
