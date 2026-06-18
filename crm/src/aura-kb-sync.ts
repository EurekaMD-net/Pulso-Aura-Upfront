/**
 * Aura KB ingester.
 *
 * Walks aura-kb/knowledge/ and indexes each finding into the engine's hybrid RAG
 * (crm_documents + embeddings) carrying its governance metadata, so retrieval can
 * enforce the firewall + RBAC at recall (see searchAuraKb in doc-sync.ts).
 *
 * Idempotent: storeDocument dedupes by (source, source_id, contenido_hash), so a
 * re-run only re-embeds findings whose content changed. For a clean rebuild call
 * clearAuraKb() first (or syncAuraKb(root, { reindex: true })).
 *
 * NOT run at boot — it embeds ~969 findings (one-time cost, needs a live embedding
 * provider). Invoke via `npm run sync:aura-kb` (scripts/sync-aura-kb.ts) after deploy.
 */

import fs from "fs";
import path from "path";
import { getDatabase } from "./db.js";
import { storeDocument, type AuraGovernance } from "./doc-sync.js";
import { logger } from "./logger.js";

// ---------------------------------------------------------------------------
// Frontmatter parsing (flat scalar YAML — findings have no nested structures)
// ---------------------------------------------------------------------------

export interface ParsedFinding {
  frontmatter: Record<string, string | boolean>;
  body: string;
}

/**
 * Parse a leading `---` YAML frontmatter block. Handles flat `key: value` pairs,
 * surrounding quotes, and booleans. Not a general YAML parser — Aura findings are
 * flat scalars by convention (taxonomy/ + CONVENTIONS.md). A file without a leading
 * `---` returns empty frontmatter and the whole text as body.
 */
export function parseFrontmatter(raw: string): ParsedFinding {
  const fm: Record<string, string | boolean> = {};
  const lines = raw.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { frontmatter: fm, body: raw.trim() };

  let i = 1;
  let closed = false;
  for (; i < lines.length; i++) {
    if (lines[i].trim() === "---") {
      i++;
      closed = true;
      break;
    }
    const m = lines[i].match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2].trim();
    if (
      val.length >= 2 &&
      ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'")))
    ) {
      val = val.slice(1, -1);
    }
    fm[key] = val === "true" ? true : val === "false" ? false : val;
  }
  // No closing fence -> treat the whole file as body (don't swallow content).
  const body = (closed ? lines.slice(i).join("\n") : raw).trim();
  return { frontmatter: fm, body };
}

function str(v: string | boolean | undefined): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

export function governanceFrom(
  fm: Record<string, string | boolean>,
  brandKey: string | null = null,
): AuraGovernance {
  return {
    marca: str(fm.marca),
    brandKey,
    rolMinimo: str(fm.rol_minimo),
    sensibilidad: str(fm.sensibilidad),
    aisladoPorCliente: fm.aislado_por_cliente === true,
    cuerpo: str(fm.cuerpo),
    estabilidad: str(fm.estabilidad),
    // Evidence tiers (CERTEZA_FUERTE/…) are inline per-claim in the body, not a
    // document-level field — they ride along in the retrieved chunk text.
    tier: null,
  };
}

/**
 * Brand firewall key = the `brand-intelligence/<slug>/` folder of a finding (one folder =
 * one brand, always consistent — unlike the free-text `marca`). Null for non-brand docs
 * (doctrine, catalogs), which are cross-brand. Path is relative to the knowledge/ dir.
 */
export function brandKeyForFile(
  knowledgeDir: string,
  file: string,
): string | null {
  const parts = path.relative(knowledgeDir, file).split(path.sep);
  return parts[0] === "brand-intelligence" && parts.length >= 3
    ? parts[1]
    : null;
}

// ---------------------------------------------------------------------------
// Walk + ingest
// ---------------------------------------------------------------------------

export function walkMarkdown(dir: string): string[] {
  const out: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walkMarkdown(full));
    else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
  }
  return out.sort();
}

/**
 * Remove all Aura KB documents and their embeddings/vec/FTS rows. The vec0 and FTS5
 * virtual tables are keyed by crm_embeddings.rowid and are NOT cascade-cleaned by the
 * crm_embeddings FK, so we delete them explicitly to avoid orphaned vectors.
 * Returns the number of embedding rows removed.
 */
export function clearAuraKb(): number {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT e.rowid AS rowid
       FROM crm_embeddings e JOIN crm_documents d ON e.document_id = d.id
       WHERE d.source = 'aura-kb'`,
    )
    .all() as { rowid: number | bigint }[];

  const run = db.transaction(() => {
    for (const { rowid } of rows) {
      const rid = BigInt(Number(rowid));
      try {
        db.prepare("DELETE FROM crm_vec_embeddings WHERE rowid = ?").run(rid);
      } catch {
        /* vec table may be absent on older DBs */
      }
      try {
        db.prepare("DELETE FROM crm_fts_embeddings WHERE rowid = ?").run(rid);
      } catch {
        /* fts table may be absent on older DBs */
      }
    }
    // Cascade removes crm_embeddings rows via the document_id FK.
    db.prepare("DELETE FROM crm_documents WHERE source = 'aura-kb'").run();
  });
  run();
  return rows.length;
}

export interface AuraSyncResult {
  files: number;
  indexed: number;
  skipped: number;
  failed: number;
}

/**
 * Index every finding under `<kbRoot>/knowledge/`. `kbRoot` defaults to env
 * AURA_KB_DIR, else `<cwd>/aura-kb`. With `{ reindex: true }` it clears existing
 * Aura docs first (clean rebuild); otherwise it is incremental (unchanged findings
 * are skipped by storeDocument's content-hash dedupe).
 */
export async function syncAuraKb(
  kbRoot?: string,
  opts: { reindex?: boolean } = {},
): Promise<AuraSyncResult> {
  const root =
    kbRoot || process.env.AURA_KB_DIR || path.resolve(process.cwd(), "aura-kb");
  const knowledgeDir = path.join(root, "knowledge");

  if (opts.reindex) clearAuraKb();

  const files = walkMarkdown(knowledgeDir);
  const result: AuraSyncResult = {
    files: files.length,
    indexed: 0,
    skipped: 0,
    failed: 0,
  };

  for (const file of files) {
    try {
      const raw = fs.readFileSync(file, "utf8");
      const { frontmatter, body } = parseFrontmatter(raw);
      const brandKey = brandKeyForFile(knowledgeDir, file);
      const governance = governanceFrom(frontmatter, brandKey);
      // Only index governed findings. Skip anything ungoverned — a navigation file
      // with no frontmatter (e.g. platform-intelligence/README.md), an empty body, or
      // a finding with no rol_minimo (it could never be RBAC-gated, so we never index
      // it rather than rely on the IN clause excluding NULL by accident).
      if (
        body.length < 20 ||
        Object.keys(frontmatter).length === 0 ||
        !governance.rolMinimo
      ) {
        result.skipped++;
        continue;
      }
      const sourceId = str(frontmatter.id) || path.relative(knowledgeDir, file);
      const titulo = str(frontmatter.titulo) || path.basename(file, ".md");
      // Index title + body so marca/cuerpo terms are searchable text too.
      const text = `${titulo}\n\n${body}`;
      const { chunkCount } = await storeDocument(
        null,
        "aura-kb",
        sourceId,
        titulo,
        "aura-finding",
        text,
        governance,
      );
      // Ensure brand_key is set even when storeDocument skipped (content unchanged) — lets an
      // incremental `sync:aura-kb` backfill the key onto an already-embedded corpus with no
      // re-embedding.
      getDatabase()
        .prepare(
          "UPDATE crm_documents SET brand_key = ? WHERE source = 'aura-kb' AND source_id = ?",
        )
        .run(brandKey, sourceId);
      if (chunkCount > 0) result.indexed++;
      else result.skipped++;
    } catch (err) {
      result.failed++;
      logger.warn({ err, file }, "Failed to index Aura KB finding");
    }
  }

  logger.info(result, "Aura KB sync complete");
  return result;
}

/**
 * Backfill ONLY the brand_key column on an already-indexed corpus — a pure UPDATE keyed by
 * source_id, with NO re-embedding. Use this to fix the firewall key on a live DB without
 * paying to re-embed (and without risking a local-fallback overwrite of good vectors when no
 * embedding provider is configured). Matches by frontmatter id (= source_id), which the
 * mojibake cleanup does not touch.
 */
export function backfillBrandKeys(kbRoot?: string): {
  files: number;
  updated: number;
} {
  const root =
    kbRoot || process.env.AURA_KB_DIR || path.resolve(process.cwd(), "aura-kb");
  const knowledgeDir = path.join(root, "knowledge");
  const files = walkMarkdown(knowledgeDir);
  const db = getDatabase();
  const upd = db.prepare(
    "UPDATE crm_documents SET brand_key = ? WHERE source = 'aura-kb' AND source_id = ?",
  );
  let updated = 0;
  const run = db.transaction(() => {
    for (const file of files) {
      const fm = parseFrontmatter(fs.readFileSync(file, "utf8")).frontmatter;
      const sourceId = str(fm.id) || path.relative(knowledgeDir, file);
      const brandKey = brandKeyForFile(knowledgeDir, file);
      updated += upd.run(brandKey, sourceId).changes;
    }
  });
  run();
  logger.info({ files: files.length, updated }, "Aura KB brand_key backfill");
  return { files: files.length, updated };
}
