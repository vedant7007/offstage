// Text extraction and chunking for kb_documents.

import { extractText as pdfText, getDocumentProxy } from "unpdf";

export type KbChunk = { section: string; text: string };

const TOKENS_PER_CHUNK = 400;
const OVERLAP_TOKENS = 60;
const CHARS_PER_TOKEN = 4; // ponytail: char estimate, swap for the bge tokenizer if chunk sizes drift.

/** Minimal CSV line split that respects double quotes. */
function csvCells(line: string): string[] {
  const cells: string[] = [];
  let cur = "";
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"' && quoted && line[i + 1] === '"') {
      cur += '"';
      i++;
    } else if (c === '"') {
      quoted = !quoted;
    } else if (c === "," && !quoted) {
      cells.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  cells.push(cur.trim());
  return cells;
}

/** CSV rows become "header: value; header: value" lines so each row reads as a fact. */
export function csvToText(csv: string): string {
  const [head, ...rows] = csv.split(/\r?\n/).filter((l) => l.trim());
  if (!head) return "";
  const headers = csvCells(head);
  return rows
    .map((r) =>
      csvCells(r)
        .map((v, i) => `${headers[i] ?? `col${i + 1}`}: ${v}`)
        .join("; "),
    )
    .join("\n");
}

export async function extractText(content: Uint8Array | string, mime: string): Promise<string> {
  if (mime === "application/pdf") {
    const pdf = await getDocumentProxy(
      typeof content === "string" ? new TextEncoder().encode(content) : content,
    );
    const { text } = await pdfText(pdf, { mergePages: true });
    return text;
  }
  const text = typeof content === "string" ? content : new TextDecoder().decode(content);
  if (mime === "text/csv") return csvToText(text);
  if (mime === "text/markdown" || mime === "text/plain") return text;
  throw new Error(`Unsupported KB mime type: ${mime}`);
}

/** Split by markdown headings, then into ~400 token windows with 60 token overlap, on word boundaries. */
export function chunkText(text: string, docTitle: string): KbChunk[] {
  const sections: { section: string; body: string[] }[] = [{ section: docTitle, body: [] }];
  for (const line of text.split(/\r?\n/)) {
    const h = /^#{1,6}\s+(.*)$/.exec(line);
    if (h?.[1]) sections.push({ section: h[1].trim(), body: [] });
    else sections.at(-1)!.body.push(line);
  }

  const size = TOKENS_PER_CHUNK * CHARS_PER_TOKEN;
  const overlap = OVERLAP_TOKENS * CHARS_PER_TOKEN;
  const chunks: KbChunk[] = [];
  for (const { section, body } of sections) {
    const words = body.join("\n").trim().split(/\s+/).filter(Boolean);
    let start = 0;
    while (start < words.length) {
      let end = start;
      let len = 0;
      while (end < words.length && len + words[end]!.length + 1 <= size) len += words[end++]!.length + 1;
      if (end === start) end++; // a single word longer than a chunk
      chunks.push({ section, text: words.slice(start, end).join(" ") });
      if (end >= words.length) break;
      // Step back roughly `overlap` chars for the next window.
      let back = end;
      let backLen = 0;
      while (back > start + 1 && backLen < overlap) backLen += words[--back]!.length + 1;
      start = back;
    }
  }
  return chunks;
}
