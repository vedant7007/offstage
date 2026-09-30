// Re-indexes a KB document when it is added or updated. Abhinav's event bus calls onKbEvent() for
// kb.document_added and kb.updated; the document's current version replaces its old chunks.

import type { Db } from "@/db/client";
import type { DomainEvent } from "@/contracts";
import { indexDocumentPg } from "@/ai/rag/pg";

export const KB_EVENTS = new Set(["kb.document_added", "kb.updated"]);

export async function onKbEvent(db: Db, event: DomainEvent): Promise<number | undefined> {
  if (!KB_EVENTS.has(event.type) || event.entity !== "kb_documents") return undefined;
  return indexDocumentPg(db, event.entityId);
}
