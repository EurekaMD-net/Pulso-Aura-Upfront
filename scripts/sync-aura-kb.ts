/**
 * One-shot Aura KB ingest into the CRM hybrid RAG.
 *
 * Run from the repo root with the engine's env loaded (same CRM_DB_PATH):
 *   npm run sync:aura-kb               # incremental (unchanged findings skipped)
 *   npm run sync:aura-kb -- --reindex  # clean rebuild (clears existing aura-kb docs first)
 *
 * Embeds every finding under aura-kb/knowledge/, so it needs a live embedding provider
 * (EMBEDDING_URL / EMBEDDING_MODEL / INFERENCE_PRIMARY_KEY). Without one, embeddings fall
 * back to the non-semantic local hash and the script warns — re-run once a 1024-dim
 * embedding model is configured.
 */

import { getDatabase } from "../crm/src/db.js";
import { createCrmSchema } from "../crm/src/schema.js";
import { isEmbeddingDegraded } from "../crm/src/embedding.js";
import { syncAuraKb } from "../crm/src/aura-kb-sync.js";

const db = getDatabase();
createCrmSchema(db); // idempotent — ensures the aura-kb governance columns exist
const reindex = process.argv.includes("--reindex");

const res = await syncAuraKb(undefined, { reindex });

if (isEmbeddingDegraded()) {
  console.warn(
    "WARNING: embedding provider unavailable — used the local non-semantic fallback. " +
      "Configure a 1024-dim EMBEDDING_MODEL and re-run with --reindex for real semantic search.",
  );
}
console.log("Aura KB sync:", JSON.stringify(res));
process.exit(res.failed > 0 ? 1 : 0);
