/**
 * Aura brand resolution — turn a seller's free-text brand ("Coca Cola", "bonafont") into a
 * `brand_key` (the brand-intelligence folder slug, which is the firewall key for searchAuraKb).
 *
 * The marca field is inconsistent (typos/accents/wording), so we resolve via several strategies
 * and return the candidate brand_keys when the input is ambiguous (e.g. "bonafont" → 3 keys), so
 * the agent can ask the seller to pick rather than guessing the wrong brand.
 */

import { getDatabase } from "./db.js";
import { normalizeMarca } from "./aura-rbac.js";

export interface BrandCandidate {
  brandKey: string;
  /** A representative display marca for the brand_key (helps the agent disambiguate). */
  marca: string | null;
  /** How many findings the brand has (coverage). */
  findings: number;
}

export interface BrandResolution {
  /** The single resolved brand_key, or null when there were 0 or >1 matches. */
  brandKey: string | null;
  /** Match candidates (1 = resolved; >1 = ambiguous, ask the seller; 0 = not found). */
  candidates: BrandCandidate[];
}

/** lowercase + strip accents + collapse non-alphanumerics to single hyphens. */
export function slugifyBrand(input: string): string {
  return normalizeMarca(input)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Resolve free-text `input` to a brand_key. Strategies, in order (first non-empty wins):
 *   1. exact `marca_norm` match  → the brand_key(s) of findings tagged with that marca
 *   2. `brand_key` prefix on the slug  ("bonafont" → bonafont-*)
 *   3. `brand_key` contains the slug
 * 0 or >1 results → `brandKey: null` with the candidate list for disambiguation.
 */
export function resolveBrandKey(input: string): BrandResolution {
  const empty: BrandResolution = { brandKey: null, candidates: [] };
  if (!input || !input.trim()) return empty;

  const db = getDatabase();
  const norm = normalizeMarca(input);
  const slug = slugifyBrand(input);
  if (!norm && !slug) return empty;

  const byClause = (where: string, param: string): BrandCandidate[] =>
    (
      db
        .prepare(
          `SELECT brand_key AS brandKey, MIN(marca) AS marca, COUNT(*) AS findings
           FROM crm_documents
           WHERE source='aura-kb' AND brand_key IS NOT NULL AND ${where}
           GROUP BY brand_key
           ORDER BY findings DESC, brand_key`,
        )
        .all(param) as {
        brandKey: string;
        marca: string | null;
        findings: number;
      }[]
    ).map((r) => ({
      brandKey: r.brandKey,
      marca: r.marca,
      findings: r.findings,
    }));

  let candidates: BrandCandidate[] = [];
  if (norm) candidates = byClause("marca_norm = ?", norm);
  if (candidates.length === 0 && slug)
    candidates = byClause("brand_key LIKE ?", `${slug}%`);
  if (candidates.length === 0 && slug)
    candidates = byClause("brand_key LIKE ?", `%${slug}%`);

  return {
    brandKey: candidates.length === 1 ? candidates[0].brandKey : null,
    candidates,
  };
}
