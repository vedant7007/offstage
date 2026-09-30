"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { Minus, Plus } from "lucide-react";
import type { DiffEntry } from "@/contracts";
import { useT } from "@/lib/i18n/provider";
import { formatDayShort, formatTime } from "@/lib/time";

export type { DiffEntry };

type FieldChange = { field: string; before: unknown; after: unknown; kind: "added" | "removed" | "changed" };

const ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const isEmpty = (v: unknown) => v === undefined || v === null || v === "";

function changesOf(entry: DiffEntry): FieldChange[] {
  const before = entry.before ?? {};
  const after = entry.after ?? {};
  const fields = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  return fields.flatMap((field): FieldChange[] => {
    const b = before[field];
    const a = after[field];
    if (JSON.stringify(b) === JSON.stringify(a)) return [];
    const kind = isEmpty(b) ? "added" : isEmpty(a) ? "removed" : "changed";
    return [{ field, before: b, after: a, kind }];
  });
}

const humanise = (key: string) =>
  key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_.]/g, " ")
    .replace(/^\w/, (c) => c.toUpperCase());

type DiffViewProps = {
  diff: DiffEntry[];
  /** Friendly names for fields, such as { startsAt: "Start time" }. Falls back to a humanised key. */
  labels?: Record<string, string>;
  /** Friendly names for entities, such as { session: "Session" }. */
  entityLabels?: Record<string, string>;
  /** Custom rendering for a value. Timestamps are already shown in IST. */
  formatValue?: (field: string, value: unknown) => React.ReactNode;
  className?: string;
};

/**
 * Before and after, per field. Removed values are struck through with a minus, added values
 * carry a plus, and each side is labelled for screen readers, so colour is never the only cue.
 * Stacks on phones; three columns from md.
 */
function DiffView({ diff, labels = {}, entityLabels = {}, formatValue, className }: DiffViewProps) {
  const t = useT();

  const show = (field: string, value: unknown): React.ReactNode => {
    if (isEmpty(value)) return <span className="italic text-fg-muted">{t("diff.empty")}</span>;
    const custom = formatValue?.(field, value);
    if (custom !== undefined) return custom;
    if (typeof value === "string" && ISO_INSTANT.test(value)) {
      return `${formatDayShort(value)}, ${formatTime(value)} ${t("time.ist")}`;
    }
    if (typeof value === "object")
      return <code className="font-mono text-sm break-all">{JSON.stringify(value)}</code>;
    return String(value);
  };

  const groups = diff.map((entry) => ({ entry, changes: changesOf(entry) })).filter((g) => g.changes.length);
  if (!groups.length) return <p className={cn("text-sm text-fg-muted", className)}>{t("diff.none")}</p>;

  return (
    <div data-slot="diff-view" className={cn("flex flex-col gap-4", className)}>
      {groups.map(({ entry, changes }) => (
        <div
          key={`${entry.entity}:${entry.id}`}
          className="overflow-hidden rounded-control border border-border"
        >
          <p className="border-b border-border bg-surface-sunken px-3 py-2 text-sm font-semibold">
            {entityLabels[entry.entity] ?? humanise(entry.entity)}
          </p>
          <div
            aria-hidden
            className="hidden border-b border-border px-3 py-1.5 text-xs font-semibold text-fg-muted md:grid md:grid-cols-[10rem_1fr_1fr] md:gap-3"
          >
            <span>{t("diff.field")}</span>
            <span>{t("diff.before")}</span>
            <span>{t("diff.after")}</span>
          </div>
          <ul>
            {changes.map((c) => (
              <li
                key={c.field}
                className="grid grid-cols-1 gap-1.5 border-b border-border px-3 py-2.5 last:border-b-0 md:grid-cols-[10rem_1fr_1fr] md:gap-3"
              >
                <p className="text-sm font-medium">
                  {labels[c.field] ?? humanise(c.field)}
                  <span className="sr-only">, {t(`diff.${c.kind}`)}</span>
                </p>
                <div
                  className={cn(
                    "flex items-start gap-1.5 rounded-sm px-2 py-1 text-sm",
                    c.kind === "added" ? "text-fg-muted" : "bg-danger-soft text-danger-soft-fg",
                  )}
                >
                  {c.kind !== "added" ? <Minus aria-hidden className="mt-0.5 size-3.5 shrink-0" /> : null}
                  <span className="text-xs font-semibold md:hidden">{t("diff.before")}:</span>
                  <span className="sr-only max-md:hidden">{t("diff.before")}: </span>
                  <span className={cn("min-w-0", c.kind !== "added" && "line-through decoration-2")}>
                    {show(c.field, c.before)}
                  </span>
                </div>
                <div
                  className={cn(
                    "flex items-start gap-1.5 rounded-sm px-2 py-1 text-sm",
                    c.kind === "removed"
                      ? "text-fg-muted"
                      : "bg-approved-soft font-medium text-approved-soft-fg",
                  )}
                >
                  {c.kind !== "removed" ? <Plus aria-hidden className="mt-0.5 size-3.5 shrink-0" /> : null}
                  <span className="text-xs font-semibold md:hidden">{t("diff.after")}:</span>
                  <span className="sr-only max-md:hidden">{t("diff.after")}: </span>
                  <span className="min-w-0">{show(c.field, c.after)}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export { DiffView };
