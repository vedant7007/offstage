// Postgres side of retrieval: index kb_documents into kb_chunks, and hybrid search over them.
// Same chunking, embeddings and RRF as the in-memory index; full text uses the generated tsv column.

import { and, asc, cosineDistance, desc, eq, sql } from "drizzle-orm";
import type { Db } from "@/db/client";
import { kbChunks, kbDocuments } from "@/db/schema";
import type { KbChunkRef } from "@/contracts";
import { chunkText } from "./ingest";
import { embed } from "./embed";
import { rrf } from "./index";

/** (Re)builds one document's chunks at its current version. Marks the document ready or failed. */
export async function indexDocumentPg(db: Db, docId: string): Promise<number> {
  const [doc] = await db.select().from(kbDocuments).where(eq(kbDocuments.id, docId)).limit(1);
  if (!doc) throw new Error(`kb document ${docId} not found`);
  try {
    const chunks = chunkText(doc.content, doc.title).filter((c) => c.text.trim());
    const vectors = await embed(chunks.map((c) => `${c.section}\n${c.text}`));
    await db.transaction(async (tx) => {
      await tx.delete(kbChunks).where(eq(kbChunks.docId, doc.id));
      if (chunks.length)
        await tx.insert(kbChunks).values(
          chunks.map((c, i) => ({
            eventId: doc.eventId,
            docId: doc.id,
            docVersion: doc.version,
            ordinal: i,
            section: c.section === doc.title ? "" : c.section,
            text: c.text,
            tokenCount: Math.ceil(c.text.length / 4),
            embedding: vectors[i]!,
          })),
        );
      await tx
        .update(kbDocuments)
        .set({ status: "ready", chunkCount: chunks.length, error: null })
        .where(eq(kbDocuments.id, doc.id));
    });
    return chunks.length;
  } catch (e) {
    await db
      .update(kbDocuments)
      .set({ status: "failed", error: (e as Error).message.slice(0, 500) })
      .where(eq(kbDocuments.id, doc.id));
    throw e;
  }
}

/** Every document of an event that has no chunks at its current version (after a seed or an upload). */
export async function indexPendingPg(db: Db, eventId?: string): Promise<{ docId: string; chunks: number }[]> {
  const docs = await db
    .select({ id: kbDocuments.id })
    .from(kbDocuments)
    .where(
      and(
        eventId ? eq(kbDocuments.eventId, eventId) : undefined,
        sql`not exists (select 1 from ${kbChunks} c where c.doc_id = ${kbDocuments.id} and c.doc_version = ${kbDocuments.version})`,
      ),
    );
  const done = [];
  for (const d of docs) done.push({ docId: d.id, chunks: await indexDocumentPg(db, d.id) });
  return done;
}

/** Hybrid search for one event. `score` is cosine similarity, 0 to 1. */
export async function searchKbPg(db: Db, eventId: string, query: string, k = 5): Promise<KbChunkRef[]> {
  const [qv] = await embed([query], { query: true });
  const distance = cosineDistance(kbChunks.embedding, qv!);
  const tsq = sql`websearch_to_tsquery('english', ${query})`;
  const cols = {
    id: kbChunks.id,
    docId: kbChunks.docId,
    docVersion: kbChunks.docVersion,
    section: kbChunks.section,
    text: kbChunks.text,
    docTitle: kbDocuments.title,
    distance: sql<number>`${distance}`,
  };
  const current = and(eq(kbChunks.eventId, eventId), eq(kbChunks.docVersion, kbDocuments.version));
  const [byVector, byText] = await Promise.all([
    db
      .select(cols)
      .from(kbChunks)
      .innerJoin(kbDocuments, eq(kbDocuments.id, kbChunks.docId))
      .where(current)
      .orderBy(asc(distance))
      .limit(20),
    db
      .select(cols)
      .from(kbChunks)
      .innerJoin(kbDocuments, eq(kbDocuments.id, kbChunks.docId))
      .where(and(current, sql`${kbChunks.tsv} @@ ${tsq}`))
      .orderBy(desc(sql`ts_rank(${kbChunks.tsv}, ${tsq})`))
      .limit(20),
  ]);
  const rows = new Map([...byVector, ...byText].map((r) => [r.id, r]));
  return [...rrf([byText.map((r) => r.id), byVector.map((r) => r.id)])]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k)
    .map(([id]) => {
      const r = rows.get(id)!;
      return {
        chunkId: r.id,
        docId: r.docId,
        docTitle: r.docTitle,
        section: r.section,
        snippet: r.text.slice(0, 2000),
        score: 1 - Number(r.distance),
        docVersion: r.docVersion,
      };
    });
}
