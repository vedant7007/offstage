// Local embeddings: bge-small-en-v1.5 (384 dims) via transformers.js, CLS pooling, normalised.
// The model downloads on first use into the transformers cache; `pnpm ai:models` prefetches it at build time.

import { pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

export const EMBED_MODEL = "Xenova/bge-small-en-v1.5";
export const EMBED_DIMS = 384;
// bge v1.5 recommends this prefix on queries (not on passages) for retrieval.
const QUERY_PREFIX = "Represent this sentence for searching relevant passages: ";

let extractor: Promise<FeatureExtractionPipeline> | undefined;

export async function embed(texts: string[], opts: { query?: boolean } = {}): Promise<number[][]> {
  if (!texts.length) return [];
  // A failed load is not kept, so one bad start does not leave the process without retrieval until a restart.
  extractor ??= pipeline("feature-extraction", EMBED_MODEL, { dtype: "q8" }).catch((err: unknown) => {
    extractor = undefined;
    throw err;
  });
  const fe = await extractor;
  const input = opts.query ? texts.map((t) => QUERY_PREFIX + t) : texts;
  const out = await fe(input, { pooling: "cls", normalize: true });
  return out.tolist() as number[][];
}
