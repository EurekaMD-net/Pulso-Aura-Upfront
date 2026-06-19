/**
 * Anunciante portfolio layer (P3.5).
 *
 * The Upfront deal is closed with the ANUNCIANTE (advertiser) across its whole brand portfolio
 * — one budget, one committee. Aura is per-brand; this layer rolls the per-brand radiografías up
 * to the advertiser, and reaches the real committee (CRM `contacto`) for STAKEHOLDERS.
 *
 *   resolveAnunciante       free-text -> anunciante (ambiguous -> candidates)
 *   marcasForAnunciante     anunciante -> its brand_keys
 *   radiografiaForAnunciante  portfolio rollup: per-brand availability + a bounded resumen
 *   committeeForAnunciante  the anunciante's cuenta(s) -> contacto power-map
 *
 * Firewall + RBAC are inherited per brand from P2/P3.2 (brand_key + rol_minimo via clearedFloors).
 */

import { getDatabase } from "./db.js";
import { normalizeMarca, clearedFloors } from "./aura-rbac.js";
import { RADIOGRAFIA_CUERPOS, type RadiografiaCuerpo } from "./doc-sync.js";

export interface AnuncianteCandidate {
  anunciante: string;
  grupo: string | null;
  marcas: number;
}

export interface AnuncianteResolution {
  /** Single resolved anunciante display name, or null when 0 or >1 matches. */
  anunciante: string | null;
  anuncianteNorm: string | null;
  grupo: string | null;
  candidates: AnuncianteCandidate[];
}

/** Resolve free-text input to an anunciante. Exact anunciante_norm, then contains, then grupo. */
export function resolveAnunciante(input: string): AnuncianteResolution {
  const empty: AnuncianteResolution = {
    anunciante: null,
    anuncianteNorm: null,
    grupo: null,
    candidates: [],
  };
  if (!input || !input.trim()) return empty;
  const db = getDatabase();
  const norm = normalizeMarca(input);
  if (!norm) return empty;

  const byClause = (where: string, param: string): AnuncianteCandidate[] =>
    db
      .prepare(
        `SELECT MIN(anunciante) AS anunciante, MIN(grupo) AS grupo, COUNT(*) AS marcas
         FROM anunciante_marca
         WHERE anunciante IS NOT NULL AND ${where}
         GROUP BY anunciante_norm
         ORDER BY marcas DESC, anunciante`,
      )
      .all(param) as AnuncianteCandidate[];

  let candidates = byClause("anunciante_norm = ?", norm);
  if (candidates.length === 0)
    candidates = byClause("anunciante_norm LIKE ?", `%${norm}%`);
  if (candidates.length === 0) candidates = byClause("grupo_norm = ?", norm);

  const resolved = candidates.length === 1 ? candidates[0] : null;
  return {
    anunciante: resolved ? resolved.anunciante : null,
    anuncianteNorm: resolved ? normalizeMarca(resolved.anunciante) : null,
    grupo: resolved ? resolved.grupo : null,
    candidates,
  };
}

export function marcasForAnunciante(
  anuncianteNorm: string,
): { brand_key: string; marca: string | null }[] {
  const db = getDatabase();
  return db
    .prepare(
      `SELECT brand_key, marca FROM anunciante_marca WHERE anunciante_norm = ? ORDER BY marca`,
    )
    .all(anuncianteNorm) as { brand_key: string; marca: string | null }[];
}

export interface MarcaResumen {
  brand_key: string;
  marca: string | null;
  /** Which of the 4 diagnostic cuerpos the caller's role can see for this brand. */
  cuerpos_disponibles: RadiografiaCuerpo[];
  faltantes: RadiografiaCuerpo[];
  /** A bounded signal: the head of the diagnostico (≤600 chars), or "" if none/blocked. */
  resumen: string;
}

export interface AnuncianteRadiografia {
  anunciante: string;
  grupo: string | null;
  marcas: MarcaResumen[];
  totales: {
    marcas: number;
    con_diagnostico: number;
    sin_inteligencia: number;
  };
}

/**
 * Portfolio rollup for an anunciante: every brand's cuerpo availability + a bounded resumen
 * (NOT full bodies — a 24-brand portfolio would blow context). The agent drills into a brand's
 * full radiografía via armar_radiografia_marca and synthesizes the portfolio-level thesis.
 * Returns null when the anunciante is unresolved/ambiguous (the tool surfaces candidates).
 */
export function radiografiaForAnunciante(
  input: string,
  role: string,
): AnuncianteRadiografia | null {
  const res = resolveAnunciante(input);
  if (!res.anunciante || !res.anuncianteNorm) return null;
  const db = getDatabase();
  const cleared = clearedFloors(role) as string[];
  const marcas = marcasForAnunciante(res.anuncianteNorm);

  const empty: AnuncianteRadiografia = {
    anunciante: res.anunciante,
    grupo: res.grupo,
    marcas: [],
    totales: {
      marcas: marcas.length,
      con_diagnostico: 0,
      sin_inteligencia: marcas.length,
    },
  };
  if (cleared.length === 0) return empty;

  const cuerpoPh = RADIOGRAFIA_CUERPOS.map(() => "?").join(",");
  const rolePh = cleared.map(() => "?").join(",");
  const presentStmt = db.prepare(
    `SELECT DISTINCT cuerpo FROM crm_documents
     WHERE source='aura-kb' AND brand_key = ?
       AND cuerpo IN (${cuerpoPh}) AND rol_minimo IN (${rolePh})`,
  );
  const diagStmt = db.prepare(
    `SELECT e.contenido FROM crm_embeddings e
     JOIN crm_documents d ON e.document_id = d.id
     WHERE d.source='aura-kb' AND d.brand_key = ? AND d.cuerpo = 'diagnostico_9fuentes'
       AND d.rol_minimo IN (${rolePh})
     ORDER BY e.chunk_index LIMIT 1`,
  );

  let conDiagnostico = 0;
  const out: MarcaResumen[] = marcas.map((m) => {
    const present = (
      presentStmt.all(m.brand_key, ...RADIOGRAFIA_CUERPOS, ...cleared) as {
        cuerpo: string;
      }[]
    ).map((r) => r.cuerpo);
    const disponibles = RADIOGRAFIA_CUERPOS.filter((c) => present.includes(c));
    const faltantes = RADIOGRAFIA_CUERPOS.filter((c) => !present.includes(c));
    let resumen = "";
    if (disponibles.includes("diagnostico_9fuentes")) {
      const row = diagStmt.get(m.brand_key, ...cleared) as
        | { contenido: string }
        | undefined;
      resumen = (row?.contenido ?? "").slice(0, 600).trim();
      if (resumen) conDiagnostico++;
    }
    return {
      brand_key: m.brand_key,
      marca: m.marca,
      cuerpos_disponibles: disponibles,
      faltantes,
      resumen,
    };
  });

  return {
    anunciante: res.anunciante,
    grupo: res.grupo,
    marcas: out,
    totales: {
      marcas: out.length,
      con_diagnostico: conDiagnostico,
      sin_inteligencia: out.filter((m) => m.cuerpos_disponibles.length === 0)
        .length,
    },
  };
}

export interface ComiteContacto {
  nombre: string;
  rol: string | null;
  seniority: string | null;
  titulo: string | null;
  organizacion: string | null;
  es_agencia: number;
}
export interface ComiteCuenta {
  cuenta_id: string;
  cuenta: string;
  tipo: string;
  contactos: ComiteContacto[];
}
export interface ComiteAnunciante {
  anunciante: string;
  cuentas: ComiteCuenta[];
  /** true when no CRM committee is on file — the agent coaches the power map from method. */
  sin_comite: boolean;
}

/**
 * The anunciante's real committee for STAKEHOLDERS: its CRM cuenta(s) and their contactos
 * (comprador/planeador/decisor + seniority). Returns null when the anunciante is unresolved;
 * `sin_comite: true` when resolved but no cuenta/contacto is on file yet.
 */
export function committeeForAnunciante(input: string): ComiteAnunciante | null {
  const res = resolveAnunciante(input);
  if (!res.anunciante || !res.anuncianteNorm) return null;
  const db = getDatabase();
  const cuentas = db
    .prepare(`SELECT id, nombre, tipo FROM cuenta WHERE anunciante_norm = ?`)
    .all(res.anuncianteNorm) as { id: string; nombre: string; tipo: string }[];
  const contStmt = db.prepare(
    `SELECT nombre, rol, seniority, titulo, organizacion, es_agencia
     FROM contacto
     WHERE cuenta_id = ? AND COALESCE(estado, 'activo') <> 'inactivo'
     ORDER BY seniority DESC, rol`,
  );
  const out: ComiteCuenta[] = cuentas.map((c) => ({
    cuenta_id: c.id,
    cuenta: c.nombre,
    tipo: c.tipo,
    contactos: contStmt.all(c.id) as ComiteContacto[],
  }));
  return {
    anunciante: res.anunciante,
    cuentas: out,
    sin_comite: out.every((c) => c.contactos.length === 0),
  };
}
