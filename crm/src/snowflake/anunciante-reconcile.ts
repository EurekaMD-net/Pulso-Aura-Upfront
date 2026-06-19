/**
 * Anunciante reconciliation: OUR advertiser <-> Snowflake's (P4).
 *
 * The factual data in Snowflake is keyed by Snowflake's own advertiser
 * identifier, which won't match ours verbatim. Before any factual query, the
 * advertiser must be reconciled. `anunciante_snowflake_map` holds the join:
 * our `anunciante_norm` -> { sf_anunciante_id, sf_anunciante_nombre }.
 *
 * `reconcileAnunciantes(sfRows)` matches a batch of Snowflake advertisers to
 * ours by normalized name (exact-norm auto-maps with `confianza='alta'`); the
 * rest are reported as `unmatched` for operator review — we never silently guess
 * a wrong advertiser (same posture as the P3.5 brand map). The `ambiguous` count
 * is reserved (always 0 in this exact-norm pass) for a future fuzzy/contains pass.
 */

import { getDatabase } from "../db.js";
import { normalizeMarca } from "../aura-rbac.js";

export interface SnowflakeAnunciante {
  /** Snowflake's stable advertiser id. */
  id: string;
  /** Snowflake's advertiser display name. */
  nombre: string;
}

export interface SnowflakeKey {
  sfId: string;
  sfNombre: string | null;
}

export interface ReconcileResult {
  mapped: number;
  ambiguous: number;
  unmatched: number;
  /** SF advertisers that matched none of ours (surfaced for operator review). */
  unmatchedNombres: string[];
}

/** The Snowflake key for one of our advertisers, or null if not yet reconciled. */
export function snowflakeKeyForAnunciante(
  anuncianteNorm: string,
): SnowflakeKey | null {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT sf_anunciante_id, sf_anunciante_nombre
       FROM anunciante_snowflake_map
       WHERE anunciante_norm = ? AND sf_anunciante_id IS NOT NULL`,
    )
    .get(anuncianteNorm) as
    | { sf_anunciante_id: string; sf_anunciante_nombre: string | null }
    | undefined;
  if (!row) return null;
  return { sfId: row.sf_anunciante_id, sfNombre: row.sf_anunciante_nombre };
}

export interface SnowflakeMapping {
  anuncianteNorm: string;
  sfId: string;
  sfNombre: string | null;
  matchMethod: string;
  confianza: string;
}

/** Upsert a single mapping (manual override or reconciliation output). */
export function upsertSnowflakeMapping(m: SnowflakeMapping): void {
  const db = getDatabase();
  const nowMx = new Date().toLocaleString("sv-SE", {
    timeZone: "America/Mexico_City",
  });
  db.prepare(
    `INSERT INTO anunciante_snowflake_map
       (anunciante_norm, sf_anunciante_id, sf_anunciante_nombre, match_method, confianza, reconciled_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(anunciante_norm) DO UPDATE SET
       sf_anunciante_id = excluded.sf_anunciante_id,
       sf_anunciante_nombre = excluded.sf_anunciante_nombre,
       match_method = excluded.match_method,
       confianza = excluded.confianza,
       reconciled_at = excluded.reconciled_at`,
  ).run(
    m.anuncianteNorm,
    m.sfId,
    m.sfNombre,
    m.matchMethod,
    m.confianza,
    nowMx,
  );
}

/** Our distinct advertiser norms (from the P3.5 brand->anunciante map). */
function ourAnuncianteNorms(): Set<string> {
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT DISTINCT anunciante_norm FROM anunciante_marca WHERE anunciante_norm IS NOT NULL`,
    )
    .all() as { anunciante_norm: string }[];
  return new Set(rows.map((r) => r.anunciante_norm));
}

/**
 * Match a batch of Snowflake advertisers to ours by normalized name. Exact-norm
 * matches auto-map (confianza='alta'); SF names that match >1 of ours, or none,
 * are reported (not written). Idempotent — re-running refreshes the auto matches.
 */
export function reconcileAnunciantes(
  sfRows: SnowflakeAnunciante[],
): ReconcileResult {
  const ours = ourAnuncianteNorms();
  let mapped = 0;
  let ambiguous = 0;
  let unmatched = 0;
  const unmatchedNombres: string[] = [];

  for (const sf of sfRows) {
    const norm = normalizeMarca(sf.nombre);
    if (!norm) {
      unmatched++;
      unmatchedNombres.push(sf.nombre);
      continue;
    }
    if (ours.has(norm)) {
      upsertSnowflakeMapping({
        anuncianteNorm: norm,
        sfId: sf.id,
        sfNombre: sf.nombre,
        matchMethod: "exact_norm",
        confianza: "alta",
      });
      mapped++;
    } else {
      // No exact normalized match. A fuzzy/contains pass is a deliberate
      // follow-up (operator-reviewed) — we do not auto-link on a fuzzy guess.
      unmatched++;
      unmatchedNombres.push(sf.nombre);
    }
  }

  return { mapped, ambiguous, unmatched, unmatchedNombres };
}
