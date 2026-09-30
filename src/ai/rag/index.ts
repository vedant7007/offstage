// Hybrid retrieval over event documents: full text (BM25) + vector (cosine), fused with reciprocal rank fusion.
// ponytail: chunks live in process memory until Abhinav's kb_chunks table lands; then the two searches become
// SQL (tsv GIN + HNSW) and rrf() stays as is.

import { chunkText, extractText } from "./ingest";
import { embed } from "./embed";

export type KbDocument = {
  id: string;
  title: string;
  version: number;
  mime: string;
  content: Uint8Array | string;
};
type Indexed = {
  id: string;
  docId: string;
  docTitle: string;
  docVersion: number;
  section: string;
  text: string;
  terms: string[];
  embedding: number[];
};
export type Hit = {
  chunkId: string;
  docId: string;
  docTitle: string;
  section: string;
  /** RRF score, only meaningful for ranking. */
  score: number;
  /** Cosine similarity of the chunk to the query, 0..1; the helpdesk uses it to decide whether a source exists. */
  similarity: number;
  snippet: string;
};

const store = new Map<string, Indexed[]>(); // eventId -> chunks

const STOP = new Set(
  "a an and are as at be by can do does for from how i in is it me my of on or the to what when where which who will with you your there this that we our any get".split(
    " ",
  ),
);
export function terms(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t))
    .map((t) => (t.length > 4 ? t.replace(/(ing|ed|es|s)$/, "") : t));
}

/** (Re)index one document for an event. Call again on kb.updated; the old version's chunks are replaced. */
export async function indexDocument(eventId: string, doc: KbDocument): Promise<number> {
  const chunks = chunkText(await extractText(doc.content, doc.mime), doc.title);
  const vectors = await embed(chunks.map((c) => `${c.section}\n${c.text}`));
  const rows: Indexed[] = chunks.map((c, i) => ({
    id: `${doc.id}#${i}`,
    docId: doc.id,
    docTitle: doc.title,
    docVersion: doc.version,
    section: c.section,
    text: c.text,
    terms: terms(`${c.section} ${c.text}`),
    embedding: vectors[i]!,
  }));
  store.set(eventId, [...(store.get(eventId) ?? []).filter((r) => r.docId !== doc.id), ...rows]);
  return rows.length;
}

function bm25(rows: Indexed[], query: string[]): Map<string, number> {
  const k1 = 1.2;
  const b = 0.75;
  const avg = rows.reduce((s, r) => s + r.terms.length, 0) / Math.max(rows.length, 1);
  const scores = new Map<string, number>();
  for (const q of new Set(query)) {
    const df = rows.filter((r) => r.terms.includes(q)).length;
    if (!df) continue;
    const idf = Math.log(1 + (rows.length - df + 0.5) / (df + 0.5));
    for (const r of rows) {
      const tf = r.terms.filter((t) => t === q).length;
      if (!tf) continue;
      const s = (idf * tf * (k1 + 1)) / (tf + k1 * (1 - b + (b * r.terms.length) / avg));
      scores.set(r.id, (scores.get(r.id) ?? 0) + s);
    }
  }
  return scores;
}

const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

/** Reciprocal rank fusion over ranked id lists. */
export function rrf(lists: string[][], k = 60): Map<string, number> {
  const fused = new Map<string, number>();
  for (const list of lists)
    list.forEach((id, rank) => fused.set(id, (fused.get(id) ?? 0) + 1 / (k + rank + 1)));
  return fused;
}

export async function retrieve(
  eventId: string,
  query: string,
  opts: { k?: number; filters?: { docIds?: string[] } } = {},
): Promise<Hit[]> {
  let rows = store.get(eventId) ?? [];
  if (opts.filters?.docIds) rows = rows.filter((r) => opts.filters!.docIds!.includes(r.docId));
  if (!rows.length) return [];

  const [qv] = await embed([query], { query: true });
  const sims = new Map(rows.map((r) => [r.id, dot(qv!, r.embedding)]));
  const byVector = [...sims]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id]) => id);
  const byText = [...bm25(rows, terms(query))]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20)
    .map(([id]) => id);

  const byId = new Map(rows.map((r) => [r.id, r]));
  return [...rrf([byText, byVector])]
    .sort((a, b) => b[1] - a[1])
    .slice(0, opts.k ?? 5)
    .map(([id, score]) => {
      const r = byId.get(id)!;
      return {
        chunkId: r.id,
        docId: r.docId,
        docTitle: r.docTitle,
        section: r.section,
        score,
        similarity: sims.get(id)!,
        snippet: r.text.slice(0, 280),
      };
    });
}
