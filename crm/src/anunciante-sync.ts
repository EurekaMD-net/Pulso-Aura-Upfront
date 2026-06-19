/**
 * Anunciante map ingester (P3.5).
 *
 * Loads the researched brand_key -> anunciante (advertiser) + grupo (holding) bridge from
 * `aura-kb/anunciantes/brand-anunciante-map.json` into the `anunciante_marca` registry.
 * Pure upsert — no embedding, no corpus re-index (the bridge is brand-level metadata, like
 * the brand_key backfill). Idempotent: re-running refreshes rows in place.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { getDatabase } from "./db.js";

interface AnuncianteRow {
  brand_key: string;
  marca?: string | null;
  anunciante?: string | null;
  anunciante_norm?: string | null;
  grupo?: string | null;
  grupo_norm?: string | null;
  confidence?: string | null;
  basis?: string | null;
}

/** Default location of the researched map, relative to the kb root. */
export function anuncianteMapPath(kbRoot = "aura-kb"): string {
  return path.join(kbRoot, "anunciantes", "brand-anunciante-map.json");
}

/**
 * Ingest the brand -> anunciante map into anunciante_marca. Returns the row count.
 * Throws if the map file is missing or malformed (fail loud — this is the bridge).
 */
export function syncAnuncianteMap(kbRoot = "aura-kb"): { upserted: number } {
  const db = getDatabase();
  const file = anuncianteMapPath(kbRoot);
  const parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as {
    brands?: AnuncianteRow[];
  };
  const rows = parsed.brands ?? [];

  const stmt = db.prepare(
    `INSERT INTO anunciante_marca
       (brand_key, marca, anunciante, anunciante_norm, grupo, grupo_norm, confianza, basis)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(brand_key) DO UPDATE SET
       marca = excluded.marca,
       anunciante = excluded.anunciante,
       anunciante_norm = excluded.anunciante_norm,
       grupo = excluded.grupo,
       grupo_norm = excluded.grupo_norm,
       confianza = excluded.confianza,
       basis = excluded.basis`,
  );

  const run = db.transaction((rs: AnuncianteRow[]) => {
    for (const r of rs) {
      if (!r.brand_key) continue;
      stmt.run(
        r.brand_key,
        r.marca ?? null,
        r.anunciante ?? null,
        r.anunciante_norm ?? null,
        r.grupo ?? null,
        r.grupo_norm ?? null,
        r.confidence ?? null,
        r.basis ?? null,
      );
    }
  });
  run(rows);

  return { upserted: rows.filter((r) => r.brand_key).length };
}
