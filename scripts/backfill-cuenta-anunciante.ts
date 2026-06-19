/**
 * One-shot backfill of `cuenta.anunciante` / `anunciante_norm` for accounts that
 * predate the registration wiring or were created by demo seeds (which bypass
 * `solicitar_cuenta`).
 *
 * Run from the repo root with the engine's env loaded (same CRM_DB_PATH):
 *   npm run backfill:cuenta-anunciante
 *
 * Links only unambiguous matches (reuses the Aura resolver); reports ambiguous +
 * unmatched counts for operator review — never guesses. Idempotent: re-running
 * only touches still-unlinked rows. Needs `anunciante_marca` loaded first
 * (`npm run sync:anunciante-map`).
 */

import { getDatabase } from "../crm/src/db.js";
import { createCrmSchema } from "../crm/src/schema.js";
import { backfillCuentaAnunciante } from "../crm/src/anunciante.js";

const db = getDatabase();
createCrmSchema(db); // idempotent — ensures the link columns exist

const res = backfillCuentaAnunciante();
console.log("Cuenta→anunciante backfill:", JSON.stringify(res));
if (res.ambiguous > 0 || res.unmatched > 0) {
  console.log(
    `Note: ${res.ambiguous} ambiguous + ${res.unmatched} unmatched left unlinked — review account names against the anunciante map.`,
  );
}
process.exit(0);
