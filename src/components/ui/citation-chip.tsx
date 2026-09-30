"use client";

import { cn } from "cn";
import { FileText } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Sheet, SheetContent, SheetTrigger } from "./sheet";

type CitationChipProps = {
  /** Document title, such as "Rulebook". */
  document: string;
  /** Section reference, such as "4.2 Team size". */
  section: string;
  /** The exact passage the answer relied on. Rendered as plain text, never as HTML. */
  snippet: string;
  className?: string;
};

/** Where an answer came from. Opens the source passage in a sheet so people can check it. */
function CitationChip({ document, section, snippet, className }: CitationChipProps) {
  const t = useT();
  return (
    <Sheet>
      <SheetTrigger
        aria-label={t("citation.open", { document, section })}
        className={cn(
          "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-full border border-agent bg-agent-soft px-3 text-sm font-medium text-agent-soft-fg md:min-h-9",
          "transition-colors duration-(--duration-fast) ease-out hover:bg-surface-sunken",
          className,
        )}
      >
        <FileText aria-hidden className="size-4 shrink-0" />
        <span className="truncate">
          {document}, {section}
        </span>
      </SheetTrigger>
      <SheetContent title={document} description={t("citation.section", { section })}>
        <p className="mb-2 text-xs font-semibold tracking-wide text-fg-muted uppercase">{t("citation.title")}</p>
        <blockquote className="border-l-4 border-agent pl-4 text-base leading-relaxed whitespace-pre-line">{snippet}</blockquote>
      </SheetContent>
    </Sheet>
  );
}

export { CitationChip };
