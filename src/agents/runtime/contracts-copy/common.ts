// Verbatim copy of src/contracts/common.ts from abhinav/contracts @ b3e2fa7 (PR #5). Delete this folder when PR #5 merges.
import { z } from "zod";

/** Opaque identifier. UUIDs in the database; a few seeded rows use readable ids such as `kb-faq`. */
export const Id = z.string().min(1).max(64).describe("Opaque id. Never parse meaning out of it.");
export type Id = z.infer<typeof Id>;

/** An instant, always UTC with a trailing Z. Display in IST through src/lib/time.ts. */
export const IsoDateTime = z.iso.datetime().describe("UTC instant, ISO 8601 with Z suffix");
export type IsoDateTime = z.infer<typeof IsoDateTime>;

/** A calendar date as seen in IST, for things that are day-based (milestones, meals, briefings). */
export const IsoDate = z.iso.date().describe("Calendar date YYYY-MM-DD in IST");
export type IsoDate = z.infer<typeof IsoDate>;

export const MoneyInr = z
  .number()
  .nonnegative()
  .max(1_000_000_000)
  .describe(
    "Amount in Indian rupees, up to two decimals. Never negative; direction comes from the entry type.",
  );
export type MoneyInr = z.infer<typeof MoneyInr>;

export const Percent = z.number().min(0).describe("Ratio where 1 means 100%. May exceed 1 when over budget.");

export const NonEmpty = z.string().trim().min(1);

/** Short human text such as a title or label. */
export const Title = z.string().trim().min(1).max(160);

/** Longer free text. Treated as untrusted when it comes from attendees, sponsors or uploads. */
export const LongText = z.string().max(10_000);

export const Version = z.int().min(1).describe("Row version, bumped on every update. Used for stale checks.");

/** Cursor pagination shared by list endpoints. */
export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional().describe("Opaque cursor from the previous page's nextCursor"),
});
export type PageQuery = z.infer<typeof PageQuery>;

export function page<T extends z.ZodType>(item: T) {
  return z.object({
    items: z.array(item),
    nextCursor: z
      .string()
      .nullable()
      .describe("Pass as cursor to fetch the next page; null on the last page"),
  });
}
