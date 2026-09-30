import { sql } from "drizzle-orm";
import { boolean, index, integer, jsonb, pgTable, real, text, vector } from "drizzle-orm/pg-core";
import type { BodyByChannel, Channel, Citation, Segment } from "@/contracts";
import { createdAt, pk, ts, tsvector, updatedAt, version } from "./_columns";
import { events, users } from "./core";

const eventRef = () =>
  text()
    .notNull()
    .references(() => events.id, { onDelete: "cascade" });

export const kbDocuments = pgTable(
  "kb_documents",
  {
    id: pk(),
    eventId: eventRef(),
    title: text().notNull(),
    kind: text().notNull(),
    mimeType: text().notNull(),
    /** Extracted text (markdown for md files). Uploads keep the original under uploads/. */
    content: text().notNull().default(""),
    sourcePath: text(),
    version: version(),
    status: text().$type<"processing" | "ready" | "failed">().notNull().default("processing"),
    public: boolean().notNull().default(false),
    chunkCount: integer().notNull().default(0),
    error: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId)],
);

export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: pk(),
    eventId: eventRef(),
    docId: text()
      .notNull()
      .references(() => kbDocuments.id, { onDelete: "cascade" }),
    docVersion: integer().notNull(),
    ordinal: integer().notNull(),
    section: text().notNull().default(""),
    text: text().notNull(),
    tokenCount: integer().notNull().default(0),
    /** bge-small-en-v1.5, 384 dims, normalised. */
    embedding: vector({ dimensions: 384 }),
    tsv: tsvector().generatedAlwaysAs(
      sql`to_tsvector('english'::regconfig, coalesce(section, '') || ' ' || coalesce(text, ''))`,
    ),
    createdAt: createdAt(),
  },
  (t) => [
    index().on(t.eventId),
    index().on(t.docId),
    index("kb_chunks_embedding_hnsw").using("hnsw", t.embedding.op("vector_cosine_ops")),
    index("kb_chunks_tsv_gin").using("gin", t.tsv),
  ],
);

export const conversations = pgTable(
  "conversations",
  {
    id: pk(),
    eventId: eventRef(),
    channel: text().$type<Channel>().notNull(),
    userId: text().references(() => users.id, { onDelete: "set null" }),
    askerRole: text().notNull(),
    /** Hash of the Telegram chat id or WhatsApp number for inbound threads. */
    externalRefHash: text(),
    status: text().notNull().default("open"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId), index().on(t.externalRefHash)],
);

export const messages = pgTable(
  "messages",
  {
    id: pk(),
    eventId: eventRef(),
    conversationId: text()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text().$type<"user" | "assistant" | "staff">().notNull(),
    body: text().notNull(),
    citations: jsonb().$type<Citation[]>().notNull().default([]),
    guard: text(),
    guardScore: real(),
    confidence: real(),
    escalationId: text(),
    language: text(),
    /** Cluster key for Confusion Radar, set by the helpdesk agent. */
    clusterKey: text(),
    at: createdAt(),
  },
  (t) => [index().on(t.conversationId, t.at), index().on(t.eventId, t.at)],
);

export const escalations = pgTable(
  "escalations",
  {
    id: pk(),
    eventId: eventRef(),
    conversationId: text()
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    summary: text().notNull(),
    suggestedReply: text(),
    priority: text().notNull().default("normal"),
    status: text().notNull().default("open"),
    version: version(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.eventId, t.status)],
);

export const announcements = pgTable(
  "announcements",
  {
    id: pk(),
    eventId: eventRef(),
    title: text().notNull(),
    body: text().notNull(),
    bodyByChannel: jsonb().$type<BodyByChannel>().notNull(),
    segment: jsonb().$type<Segment>().notNull(),
    channels: text().array().$type<Channel[]>().notNull(),
    category: text().notNull(),
    public: boolean().notNull().default(false),
    status: text().notNull().default("scheduled"),
    scheduledFor: ts(),
    sentAt: ts(),
    recipientCount: integer().notNull().default(0),
    approvedByRole: text(),
    draftedBy: text(),
    proposalId: text(),
    version: version(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.eventId, t.status)],
);

/** In-app notifications, one per user. */
export const notifications = pgTable(
  "notifications",
  {
    id: pk(),
    eventId: eventRef(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: text().notNull(),
    body: text().notNull(),
    category: text().notNull().default("info"),
    announcementId: text(),
    readAt: ts(),
    createdAt: createdAt(),
  },
  (t) => [index().on(t.userId, t.createdAt), index().on(t.eventId)],
);
