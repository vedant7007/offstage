import { sql } from "drizzle-orm";
import { customType, integer, text, timestamp } from "drizzle-orm/pg-core";

/** Text primary key. UUIDs from the database by default; seeded rows pass stable ids from the fixture worlds. */
export const pk = () =>
  text()
    .primaryKey()
    .default(sql`gen_random_uuid()::text`);

/** timestamptz, read and written as Date. Always UTC; format for display with src/lib/time.ts. */
export const ts = () => timestamp({ withTimezone: true, mode: "date" });

export const createdAt = () => ts().notNull().defaultNow();
export const updatedAt = () =>
  ts()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/** Optimistic concurrency. Bump with bumpVersion() in src/db/versioning.ts on every update. */
export const version = () => integer().notNull().default(1);

/** Postgres tsvector, used for the generated full-text column on kb_chunks. */
export const tsvector = customType<{ data: string }>({
  dataType() {
    return "tsvector";
  },
});
