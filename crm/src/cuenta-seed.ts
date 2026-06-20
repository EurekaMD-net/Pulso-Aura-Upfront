/**
 * Bulk account (cuenta) seeding — companion to register.ts (persona seeding).
 *
 * Seeds real accounts from a CSV/JSON roster, deriving the org chain from the
 * owning AE (ae_id -> reporta_a = gerente -> reporta_a = director) and linking
 * each account to its advertiser (anunciante) — the join into the Aura per-brand
 * intelligence (anunciante_marca, 320 brands). Authoritative seed: accounts are
 * inserted estado='activo' (skips the solicitar_cuenta approval workflow) — so
 * they carry fecha_activacion=NULL and no aprobacion_registro audit row.
 *
 * Best-effort idempotent: deterministic slug id + INSERT OR IGNORE + a
 * normalized-nombre existence check, so exact re-runs — and accounts already
 * created via solicitar_cuenta (random id) under the SAME spelling — are not
 * re-inserted. Dedup is by normalized name only, with no backing UNIQUE
 * constraint: reconcile spelling variants ("Coca Cola" vs "Coca-Cola") against
 * existing rows before seeding into a DB that already holds agent-created
 * accounts. Two distinct roster names that slug to the same id are surfaced as
 * `slugCollision` (never silently dropped).
 *
 * Never guesses an ambiguous advertiser: a name matching >1 advertiser is left
 * unlinked and reported (mirrors the P3.5 "no-guess" posture). A null link is a
 * graceful degrade (radiografía-by-name still works; mapa_poder coaches from
 * method). Provide an explicit `anunciante` column to force the link when the
 * account name doesn't match the advertiser as it appears in the map.
 */
import fs from "fs";
import { getDatabase } from "./db.js";
import { logger } from "./logger.js";
import { resolveAnunciante } from "./anunciante.js";

export type CuentaTipo = "directo" | "agencia";

export interface CuentaSeed {
  nombre: string;
  tipo: CuentaTipo;
  ae_name: string;
  /** Explicit advertiser to link, used when `nombre` != the map's advertiser name. */
  anunciante?: string;
  vertical?: string;
  holding_agencia?: string;
  agencia_medios?: string;
  anos_relacion?: number;
  notas?: string;
}

export interface CuentaSeedReport {
  rows: number;
  inserted: number;
  skippedExisting: number;
  /** "<cuenta nombre> (ae_name=...)" for rows whose owner didn't resolve. */
  aeUnresolved: string[];
  linked: number;
  ambiguousLink: string[];
  unmatchedLink: string[];
  /** "<nombre> -> <slug>" for distinct names that collided on the slug id. */
  slugCollision: string[];
}

/** Remove accents and normalize to ASCII lowercase (SQLite LOWER() is ASCII-only). */
function normalize(str: string): string {
  return str.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
}

/** Deterministic, re-run-stable id derived from the account name. */
function slugId(nombre: string): string {
  const slug = normalize(nombre)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `cta-${slug || "x"}`;
}

/** Parse a single CSV line handling quoted fields with commas. */
function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of line) {
    if (ch === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (ch === "," && !inQuotes) {
      fields.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  fields.push(current);
  return fields;
}

const VALID_TIPO: readonly string[] = ["directo", "agencia"];

function coerceRow(
  raw: Record<string, string | undefined>,
  where: string,
): CuentaSeed {
  const nombre = raw.nombre?.trim();
  const tipo = raw.tipo?.trim().toLowerCase();
  const ae_name = raw.ae_name?.trim();
  if (!nombre) throw new Error(`Missing nombre at ${where}`);
  if (!tipo || !VALID_TIPO.includes(tipo))
    throw new Error(
      `Invalid tipo "${raw.tipo}" at ${where} (use directo|agencia)`,
    );
  if (!ae_name) throw new Error(`Missing ae_name at ${where}`);
  const anosRaw = raw.anos_relacion?.trim();
  return {
    nombre,
    tipo: tipo as CuentaTipo,
    ae_name,
    anunciante: raw.anunciante?.trim() || undefined,
    vertical: raw.vertical?.trim() || undefined,
    holding_agencia: raw.holding_agencia?.trim() || undefined,
    agencia_medios: raw.agencia_medios?.trim() || undefined,
    anos_relacion: anosRaw ? Number(anosRaw) : undefined,
    notas: raw.notas?.trim() || undefined,
  };
}

export function parseCuentaCsv(content: string): CuentaSeed[] {
  const lines = content
    .trim()
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length < 2)
    throw new Error("CSV must have a header row and at least one data row");
  const header = lines[0]
    .toLowerCase()
    .split(",")
    .map((h) => h.replace(/"/g, "").trim());
  return lines.slice(1).map((line, i) => {
    const fields = parseCsvLine(line);
    const raw: Record<string, string | undefined> = {};
    header.forEach((h, idx) => (raw[h] = fields[idx]));
    return coerceRow(raw, `row ${i + 2}`);
  });
}

export function parseCuentaJson(content: string): CuentaSeed[] {
  const data = JSON.parse(content);
  if (!Array.isArray(data))
    throw new Error("JSON must be an array of accounts");
  return data.map((m: Record<string, unknown>, i: number) =>
    coerceRow(
      {
        nombre: m.nombre as string | undefined,
        tipo: m.tipo as string | undefined,
        ae_name: m.ae_name as string | undefined,
        anunciante: m.anunciante as string | undefined,
        vertical: m.vertical as string | undefined,
        holding_agencia: m.holding_agencia as string | undefined,
        agencia_medios: m.agencia_medios as string | undefined,
        anos_relacion:
          m.anos_relacion != null ? String(m.anos_relacion) : undefined,
        notas: m.notas as string | undefined,
      },
      `index ${i}`,
    ),
  );
}

export function parseCuentaFile(filePath: string): CuentaSeed[] {
  const content = fs.readFileSync(filePath, "utf-8");
  return filePath.endsWith(".json")
    ? parseCuentaJson(content)
    : parseCuentaCsv(content);
}

interface PersonaRow {
  id: string;
  nombre: string;
  rol: string;
  reporta_a: string | null;
}

/**
 * Seed accounts. Resolves ownership from the named AE up the reporta_a chain,
 * links the advertiser, and inserts authoritative (estado='activo') rows.
 * Returns a report; unresolved AEs and unlinked advertisers are surfaced (never
 * guessed) for operator review.
 */
export function seedCuentas(rows: CuentaSeed[]): CuentaSeedReport {
  const db = getDatabase();

  // Persona lookups built JS-side: SQLite LOWER() is ASCII-only and names carry
  // accents, so we match on the same NFD-stripped normalize() used at insert.
  const personas = db
    .prepare("SELECT id, nombre, rol, reporta_a FROM persona WHERE activo = 1")
    .all() as PersonaRow[];
  const byName = new Map<string, PersonaRow>();
  const byId = new Map<string, PersonaRow>();
  for (const p of personas) {
    byName.set(normalize(p.nombre), p);
    byId.set(p.id, p);
  }

  // Existing accounts by normalized nombre — so a re-run, or an account already
  // created via solicitar_cuenta (random id), is never duplicated.
  const existing = new Set(
    (db.prepare("SELECT nombre FROM cuenta").all() as { nombre: string }[]).map(
      (c) => normalize(c.nombre),
    ),
  );

  const insert = db.prepare(
    `INSERT OR IGNORE INTO cuenta
       (id, nombre, tipo, vertical, holding_agencia, agencia_medios, ae_id, gerente_id, director_id, años_relacion, creado_por, estado, notas, fecha_creacion, anunciante, anunciante_norm)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'seed', 'activo', ?, ?, ?, ?)`,
  );

  const report: CuentaSeedReport = {
    rows: rows.length,
    inserted: 0,
    skippedExisting: 0,
    aeUnresolved: [],
    linked: 0,
    ambiguousLink: [],
    unmatchedLink: [],
    slugCollision: [],
  };
  const now = new Date().toISOString();

  const run = db.transaction(() => {
    for (const row of rows) {
      if (existing.has(normalize(row.nombre))) {
        report.skippedExisting++;
        continue;
      }

      // Ownership: walk up reporta_a from the named owner by its role.
      let aeId: string | null = null;
      let gerenteId: string | null = null;
      let directorId: string | null = null;
      const owner = byName.get(normalize(row.ae_name));
      if (!owner) {
        report.aeUnresolved.push(`${row.nombre} (ae_name="${row.ae_name}")`);
      } else if (owner.rol === "ae") {
        aeId = owner.id;
        const ger = owner.reporta_a ? byId.get(owner.reporta_a) : undefined;
        gerenteId = ger?.id ?? null;
        directorId = ger?.reporta_a
          ? (byId.get(ger.reporta_a)?.id ?? null)
          : null;
      } else if (owner.rol === "gerente") {
        gerenteId = owner.id;
        directorId = owner.reporta_a
          ? (byId.get(owner.reporta_a)?.id ?? null)
          : null;
      } else if (owner.rol === "director") {
        directorId = owner.id;
      }

      // Advertiser link: explicit `anunciante` column wins, else resolve by name.
      const res = resolveAnunciante(row.anunciante || row.nombre);
      if (res.anuncianteNorm) {
        report.linked++;
      } else if (res.candidates.length > 1) {
        report.ambiguousLink.push(
          `${row.nombre} (${res.candidates.length} candidates)`,
        );
      } else {
        report.unmatchedLink.push(row.nombre);
      }

      const info = insert.run(
        slugId(row.nombre),
        row.nombre,
        row.tipo,
        row.vertical ?? null,
        row.holding_agencia ?? null,
        row.agencia_medios ?? null,
        aeId,
        gerenteId,
        directorId,
        row.anos_relacion ?? 0,
        row.notas ?? null,
        now,
        res.anunciante,
        res.anuncianteNorm,
      );
      if (info.changes > 0) {
        report.inserted++;
        existing.add(normalize(row.nombre));
      } else {
        // Passed the normalized-nombre pre-check yet INSERT OR IGNORE made no
        // change => a DISTINCT name collided on the slug id. Surface it instead
        // of hiding it as a skip, so the operator can disambiguate.
        report.slugCollision.push(`${row.nombre} -> ${slugId(row.nombre)}`);
      }
    }
  });
  run();

  logger.info(
    { inserted: report.inserted, linked: report.linked, rows: report.rows },
    "Accounts seeded",
  );
  return report;
}
