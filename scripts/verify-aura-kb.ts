/**
 * Verify the Aura KB ingest: counts + a live firewall/RBAC retrieval check against
 * whatever crm.db getDatabase() resolves (honors CRM_DB_PATH). Exits non-zero on failure.
 *
 *   npx tsx scripts/verify-aura-kb.ts
 *
 * Run after `npm run sync:aura-kb`. Proves the corpus is indexed AND that retrieval is
 * brand-locked (no cross-brand leak) and fail-closed (no brand -> no results).
 */

import { getDatabase } from "../crm/src/db.js";
import { createCrmSchema } from "../crm/src/schema.js";
import { searchAuraKb } from "../crm/src/doc-sync.js";
import { isEmbeddingDegraded } from "../crm/src/embedding.js";

const db = getDatabase();
createCrmSchema(db); // idempotent

const total = (
  db
    .prepare("SELECT COUNT(*) c FROM crm_documents WHERE source = 'aura-kb'")
    .get() as { c: number }
).c;
const marcaStrings = (
  db
    .prepare(
      "SELECT COUNT(DISTINCT marca) c FROM crm_documents WHERE source = 'aura-kb' AND marca IS NOT NULL",
    )
    .get() as { c: number }
).c;
const marcaNorm = (
  db
    .prepare(
      "SELECT COUNT(DISTINCT marca_norm) c FROM crm_documents WHERE source = 'aura-kb' AND marca_norm IS NOT NULL",
    )
    .get() as { c: number }
).c;
const chunks = (
  db
    .prepare(
      "SELECT COUNT(*) c FROM crm_embeddings e JOIN crm_documents d ON e.document_id = d.id WHERE d.source = 'aura-kb'",
    )
    .get() as { c: number }
).c;

const brands = (
  db
    .prepare(
      "SELECT COUNT(DISTINCT brand_key) c FROM crm_documents WHERE source = 'aura-kb' AND brand_key IS NOT NULL",
    )
    .get() as { c: number }
).c;
console.log(
  `aura-kb docs: ${total} | brands (brand_key): ${brands} | marca strings: ${marcaStrings} (norm ${marcaNorm}) | chunks: ${chunks}`,
);
console.log(
  "  firewall keys on brand_key (folder slug); marca strings > brands because marca is inconsistent within a brand (see AURA-P2-PLAN.md).",
);

if (total === 0) {
  console.error(
    "VERIFY FAIL: no aura-kb docs indexed — run `npm run sync:aura-kb` first.",
  );
  process.exit(1);
}

// Pick the two highest-volume brands (by brand_key) for a realistic firewall test.
const top = db
  .prepare(
    "SELECT brand_key, COUNT(*) c FROM crm_documents WHERE source='aura-kb' AND brand_key IS NOT NULL GROUP BY brand_key ORDER BY c DESC LIMIT 1",
  )
  .get() as { brand_key: string; c: number };
const other = db
  .prepare(
    "SELECT brand_key FROM crm_documents WHERE source='aura-kb' AND brand_key IS NOT NULL AND brand_key != ? GROUP BY brand_key ORDER BY COUNT(*) DESC LIMIT 1",
  )
  .get(top.brand_key) as { brand_key: string } | undefined;

// FTS-friendly query: a representative marca for this brand (its display name is in the
// content), so the firewall check holds on the keyword path even without a live embedding
// provider (e.g. a standalone `npm run verify:aura-kb` with no .env).
const repr = (
  db
    .prepare(
      "SELECT marca FROM crm_documents WHERE source='aura-kb' AND brand_key=? AND marca IS NOT NULL LIMIT 1",
    )
    .get(top.brand_key) as { marca: string } | undefined
)?.marca;
const query = repr ?? top.brand_key.replace(/-/g, " ");

// Titulos that legitimately belong to the top brand — anything else in the results is a leak.
// (Results carry marca, which varies within a brand, so we check membership by titulo.)
const topTitulos = new Set(
  (
    db
      .prepare(
        "SELECT titulo FROM crm_documents WHERE source='aura-kb' AND brand_key=?",
      )
      .all(top.brand_key) as { titulo: string }[]
  ).map((r) => r.titulo),
);

const hits = await searchAuraKb(query, {
  brand: top.brand_key,
  role: "gerente",
});
if (isEmbeddingDegraded()) {
  console.log(
    "  note: no embedding provider in env — firewall checked via the keyword (FTS) path only;",
  );
  console.log(
    "        run ./scripts/deploy-aura-kb-p2.sh (sources .env) for a full semantic check.",
  );
}
const leak = hits.filter((r) => !topTitulos.has(r.titulo));

const failClosed = await searchAuraKb(query, { brand: null, role: "gerente" });

let crossOk = true;
if (other) {
  const cross = await searchAuraKb(query, {
    brand: other.brand_key,
    role: "gerente",
  });
  crossOk = cross.every((r) => !topTitulos.has(r.titulo));
  console.log(
    `retrieval[${other.brand_key}, gerente]: ${cross.length} hits (must not contain ${top.brand_key} findings)`,
  );
}

console.log(
  `retrieval[${top.brand_key}, gerente]: ${hits.length} hits | cross-brand leak: ${leak.length} | fail-closed(null brand): ${failClosed.length}`,
);

const checks: [string, boolean][] = [
  [`retrieval returns results for ${top.brand_key}`, hits.length > 0],
  ["firewall: zero cross-brand leak", leak.length === 0],
  ["fail-closed: null brand returns nothing", failClosed.length === 0],
  ["firewall holds for a second brand", crossOk],
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(`  ${pass ? "PASS" : "FAIL"} — ${name}`);
  if (!pass) ok = false;
}

console.log(ok ? "VERIFY PASS" : "VERIFY FAIL");
process.exit(ok ? 0 : 1);
