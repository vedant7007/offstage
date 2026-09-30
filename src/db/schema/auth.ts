import { index, integer, pgTable, primaryKey, text } from "drizzle-orm/pg-core";
import { createdAt, ts, updatedAt } from "./_columns";
import { users } from "./core";

/**
 * Better Auth tables (shapes from `auth generate` for better-auth 1.7.6 with the email OTP plugin),
 * with timestamptz columns. `users` lives in core.ts.
 */
/** Sign-in sessions. Named auth_sessions because `sessions` holds event sessions (talks, workshops). */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: text().primaryKey(),
    expiresAt: ts().notNull(),
    token: text().notNull().unique(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    ipAddress: text(),
    userAgent: text(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    /** The event whose membership this session acts under (attendee and crew routes). */
    activeEventId: text(),
  },
  (t) => [index().on(t.userId)],
);

export const accounts = pgTable(
  "accounts",
  {
    id: text().primaryKey(),
    accountId: text().notNull(),
    providerId: text().notNull(),
    userId: text()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text(),
    refreshToken: text(),
    idToken: text(),
    accessTokenExpiresAt: ts(),
    refreshTokenExpiresAt: ts(),
    scope: text(),
    password: text(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.userId)],
);

export const verifications = pgTable(
  "verifications",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: ts().notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index().on(t.identifier)],
);

/** Fixed-window counters for our own limits (OTP per email, per IP). Keys never hold raw emails. */
export const rateLimits = pgTable(
  "rate_limits",
  {
    key: text().notNull(),
    windowStart: ts().notNull(),
    count: integer().notNull().default(0),
    expiresAt: ts().notNull(),
  },
  (t) => [primaryKey({ columns: [t.key, t.windowStart] }), index().on(t.expiresAt)],
);
