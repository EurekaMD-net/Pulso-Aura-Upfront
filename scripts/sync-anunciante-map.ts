/**
 * One-shot ingest of the researched brand -> anunciante map into the CRM (P3.5).
 *
 * Run from the repo root with the engine's env loaded (same CRM_DB_PATH):
 *   npm run sync:anunciante-map
 *
 * Pure upsert into the `anunciante_marca` registry from
 * `aura-kb/anunciantes/brand-anunciante-map.json` — no embedding, no corpus re-index.
 * Idempotent: re-running refreshes rows in place. The portfolio rollup tools
 * (armar_radiografia_anunciante / mapa_poder_anunciante) need this loaded.
 */

import { getDatabase } from "../crm/src/db.js";
import { createCrmSchema } from "../crm/src/schema.js";
import { syncAnuncianteMap } from "../crm/src/anunciante-sync.js";

const db = getDatabase();
createCrmSchema(db); // idempotent — ensures anunciante_marca exists

const res = syncAnuncianteMap();
console.log("Anunciante map sync:", JSON.stringify(res));
process.exit(res.upserted > 0 ? 0 : 1);
