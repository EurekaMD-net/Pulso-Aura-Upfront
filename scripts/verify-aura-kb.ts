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

console.log(
  `aura-kb docs: ${total} | distinct marca strings: ${marcaStrings} (normalized: ${marcaNorm}) | embedding chunks: ${chunks}`,
);
console.log(
  "  note: the corpus has 320 brand FOLDERS; marca strings > 320 because the marca field is inconsistent within folders (see AURA-P2-PLAN.md brand-key note).",
);

if (total === 0) {
  console.error(
    "VERIFY FAIL: no aura-kb docs indexed — run `npm run sync:aura-kb` first.",
  );
  process.exit(1);
}

// Pick the two highest-volume brands for a realistic firewall test.
const top = db
  .prepare(
    "SELECT marca, COUNT(*) c FROM crm_documents WHERE source='aura-kb' AND marca IS NOT NULL GROUP BY marca ORDER BY c DESC LIMIT 1",
  )
  .get() as { marca: string; c: number };
const other = db
  .prepare(
    "SELECT marca FROM crm_documents WHERE source='aura-kb' AND marca IS NOT NULL AND marca != ? GROUP BY marca ORDER BY COUNT(*) DESC LIMIT 1",
  )
  .get(top.marca) as { marca: string } | undefined;

// Query with the brand name only: FTS surfaces that brand's findings on the keyword
// path, so the firewall check holds even without a live embedding provider (e.g. a
// standalone `npm run verify:aura-kb` with no .env). Semantic recall isn't tested here.
const query = top.marca;

const hits = await searchAuraKb(query, { marca: top.marca, role: "gerente" });
if (isEmbeddingDegraded()) {
  console.log(
    "  note: no embedding provider in env — firewall checked via the keyword (FTS) path only;",
  );
  console.log(
    "        run ./scripts/deploy-aura-kb-p2.sh (sources .env) for a full semantic check.",
  );
}
const leak = hits.filter((r) => r.marca !== top.marca);

const failClosed = await searchAuraKb(query, { marca: null, role: "gerente" });

let crossOk = true;
if (other) {
  const cross = await searchAuraKb(query, {
    marca: other.marca,
    role: "gerente",
  });
  crossOk = cross.every((r) => r.marca === other.marca);
  console.log(
    `retrieval[${other.marca}, gerente]: ${cross.length} hits (must not contain ${top.marca})`,
  );
}

console.log(
  `retrieval[${top.marca}, gerente]: ${hits.length} hits | cross-brand leak: ${leak.length} | fail-closed(null marca): ${failClosed.length}`,
);

const checks: [string, boolean][] = [
  [`retrieval returns results for ${top.marca}`, hits.length > 0],
  ["firewall: zero cross-brand leak", leak.length === 0],
  ["fail-closed: null marca returns nothing", failClosed.length === 0],
  ["firewall holds for a second brand", crossOk],
];

let ok = true;
for (const [name, pass] of checks) {
  console.log(`  ${pass ? "PASS" : "FAIL"} — ${name}`);
  if (!pass) ok = false;
}

console.log(ok ? "VERIFY PASS" : "VERIFY FAIL");
process.exit(ok ? 0 : 1);
