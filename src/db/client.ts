import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres, { type Sql } from "postgres";
import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

const globalForDb = globalThis as unknown as { __sutradharSql?: Sql; __sutradharDb?: Db };

function databaseUrl(): string {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. Copy .env.example to .env.");
  return url;
}

/**
 * The app and worker pool. When DATABASE_APP_ROLE is set (normally `sutradhar_app`), every
 * connection runs as that role: it cannot change the schema and cannot UPDATE, DELETE or
 * TRUNCATE the append-only tables (audit_log, domain_events).
 */
function createAppSql(): Sql {
  const role = process.env.DATABASE_APP_ROLE;
  return postgres(databaseUrl(), {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
    connection: role ? { role, application_name: "sutradhar" } : { application_name: "sutradhar" },
  });
}

/** Raw postgres.js client. Connects lazily on first query. */
export const sql: Sql = globalForDb.__sutradharSql ?? createAppSql();

export const db: Db = globalForDb.__sutradharDb ?? drizzle(sql, { schema, casing: "snake_case" });

// Reuse one pool across hot reloads in dev.
if (process.env.NODE_ENV !== "production") {
  globalForDb.__sutradharSql = sql;
  globalForDb.__sutradharDb = db;
}

/**
 * A connection as the database owner, for migrations and demo reset only (DDL and TRUNCATE).
 * Never use it from request handlers. Close it with `.end()` when done.
 */
export function ownerSql(): Sql {
  return postgres(databaseUrl(), {
    max: 2,
    onnotice: () => {},
    connection: { application_name: "sutradhar-owner" },
  });
}

export function ownerDb(client: Sql): Db {
  return drizzle(client, { schema, casing: "snake_case" });
}

export { schema };
