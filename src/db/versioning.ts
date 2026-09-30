import { and, eq, sql, type SQL } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Db } from "./client";

/** A table with an `id` and a `version` column, which is every mutable domain table. */
export type VersionedTable = PgTable & { id: AnyPgColumn; version: AnyPgColumn };

/** `version = version + 1`, for use inside `.set({...})`. */
export function bumpVersion(table: VersionedTable): SQL {
  return sql`${table.version} + 1`;
}

export class StaleVersionError extends Error {
  constructor(
    readonly entity: string,
    readonly id: string,
    readonly expectedVersion: number,
  ) {
    super(`${entity} ${id} changed since version ${expectedVersion}`);
    this.name = "StaleVersionError";
  }
}

/**
 * Update one row only if it is still at `expectedVersion`, bumping the version.
 * Throws StaleVersionError when someone else changed it first. Returns the new version.
 */
export async function updateVersioned(
  db: Pick<Db, "update">,
  table: VersionedTable,
  entity: string,
  id: string,
  expectedVersion: number,
  values: Record<string, unknown>,
): Promise<number> {
  const rows = (await db
    .update(table)
    .set({ ...values, version: bumpVersion(table) } as never)
    .where(and(eq(table.id, id), eq(table.version, expectedVersion)))
    .returning({ version: table.version })) as { version: number }[];
  const row = rows[0];
  if (!row) throw new StaleVersionError(entity, id, expectedVersion);
  return row.version;
}
