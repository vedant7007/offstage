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

/** Raw postgres.js client. Connects lazily on first query. */
export const sql: Sql =
  globalForDb.__sutradharSql ??
  postgres(databaseUrl(), {
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idle_timeout: 20,
    connect_timeout: 10,
    onnotice: () => {},
  });

export const db: Db = globalForDb.__sutradharDb ?? drizzle(sql, { schema, casing: "snake_case" });

// Reuse one pool across hot reloads in dev.
if (process.env.NODE_ENV !== "production") {
  globalForDb.__sutradharSql = sql;
  globalForDb.__sutradharDb = db;
}

export { schema };
