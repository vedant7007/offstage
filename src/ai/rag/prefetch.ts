// pnpm ai:models: downloads and caches the embedding model, so the first KB ingest or query does not wait on it.
import { embed } from "./embed";

await embed(["warmup"]);
console.log("embedding model cached");
