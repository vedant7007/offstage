"use client";

import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { Sheet, SheetContent, SheetTrigger } from "./sheet";

type CitationChipProps = {
  /** Document title, such as "Rulebook". */
  document: string;
  /** Section reference, such as "4.2 Team size". Optional for citations that only have a label. */
  section?: string;
  /** The exact passage the answer relied on. Rendered as plain text, never as HTML. Optional: without it the sheet says the preview is not available. */
  snippet?: string;
  className?: string;
};

/** Where an answer came from. Opens the source passage in a sheet so people can check it. */
function CitationChip({ document, section, snippet, className }: CitationChipProps) {
  const t = useT();
  return (
    <Sheet>
      <SheetTrigger
        aria-label={
          section ? t("citation.open", { document, section }) : t("citationExtra.openDoc", { document })
        }
        className={cn(
          "inline-flex min-h-11 max-w-full items-center gap-1.5 rounded-[1.375rem] border border-agent bg-agent-soft px-3.5 py-1.5 text-left font-mono text-xs font-medium text-agent-soft-fg md:min-h-9",
          "transition-[background-color,transform] duration-(--duration-slow) ease-out hover:bg-surface-sunken motion-safe:hover:-translate-y-0.5",
          className,
        )}
      >
        <FileText aria-hidden className="size-4 shrink-0" />
        <span className="min-w-0">{section ? `${document}, ${section}` : document}</span>
      </SheetTrigger>
      <SheetContent title={document} description={section ? t("citation.section", { section }) : undefined}>
        <p className="kicker mb-3 text-fg-muted">{t("citation.title")}</p>
        {snippet ? (
          <blockquote className="rounded-r-[0.75rem] border-l-4 border-agent bg-surface py-3 pr-4 pl-4 text-base leading-relaxed whitespace-pre-line">
            {snippet}
          </blockquote>
        ) : (
          <p className="text-fg-muted">{t("citationExtra.noSnippet")}</p>
        )}
      </SheetContent>
    </Sheet>
  );
}

export { CitationChip };
