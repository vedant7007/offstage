import * as React from "react";
import { cn } from "@/lib/utils";

export type Column<Row> = {
  key: string;
  header: React.ReactNode;
  cell: (row: Row) => React.ReactNode;
  /** Shown as the card title on phones. Exactly one column should set this. */
  primary?: boolean;
  align?: "start" | "end";
  className?: string;
};

type DataTableProps<Row> = {
  caption: React.ReactNode;
  /** Hide the caption visually; it stays as the table's accessible name. */
  hideCaption?: boolean;
  columns: Column<Row>[];
  rows: Row[];
  rowKey: (row: Row) => string;
  /** Shown instead of the table when there are no rows. Pass an EmptyState. */
  empty?: React.ReactNode;
  className?: string;
};

/**
 * A real table from md up, and a list of cards on phones, from the same column definitions.
 * Server-safe: no hooks, so cell renderers can be passed from server components.
 */
function DataTable<Row>({
  caption,
  hideCaption,
  columns,
  rows,
  rowKey,
  empty,
  className,
}: DataTableProps<Row>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  const primary = columns.find((c) => c.primary) ?? columns[0];
  if (!primary) return null;
  const rest = columns.filter((c) => c !== primary);

  return (
    <div className={cn("w-full", className)}>
      <table className="hidden w-full border-collapse text-left md:table">
        <caption className={cn("pb-3 text-left text-base font-medium", hideCaption && "sr-only")}>
          {caption}
        </caption>
        <thead>
          <tr className="border-b border-border-strong">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "px-3 py-2.5 font-mono text-xs font-medium tracking-[0.08em] text-fg-muted uppercase",
                  c.align === "end" && "text-right",
                  c.className,
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-border transition-colors duration-(--duration-fast) ease-out last:border-b-0 hover:bg-surface-raised">
              {columns.map((c) =>
                c === primary ? (
                  <th key={c.key} scope="row" className={cn("px-3 py-3 font-medium", c.className)}>
                    {c.cell(row)}
                  </th>
                ) : (
                  <td
                    key={c.key}
                    className={cn("px-3 py-3", c.align === "end" && "text-right tabular-nums", c.className)}
                  >
                    {c.cell(row)}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>

      <div className="md:hidden">
        <p className={cn("pb-3 text-base font-medium", hideCaption && "sr-only")}>{caption}</p>
        <ul className="flex flex-col gap-3">
          {rows.map((row) => (
            <li key={rowKey(row)} className="rounded-card border border-border bg-surface p-4 shadow-card">
              <p className="font-medium">{primary.cell(row)}</p>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
                {rest.map((c) => (
                  <React.Fragment key={c.key}>
                    <dt className="text-fg-muted">{c.header}</dt>
                    <dd className={cn("min-w-0", c.align === "end" && "tabular-nums")}>{c.cell(row)}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export { DataTable };
