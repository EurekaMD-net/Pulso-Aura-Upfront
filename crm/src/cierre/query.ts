/**
 * Query + coaching layer over the closing-goal data (Cierres 2026 / Metas 2027).
 *
 * A `CierreFrame` is the commercial frame for one account (or an aggregate of
 * accounts): 2026 closed (incl. the World Cup halo), the recurring ex-Mundial
 * base, the 2027 target, and the derived coaching figures — the World Cup money
 * that won't recur (`mundial`), the growth required on the base, how the target
 * compares to the World-Cup-inflated 2026 headline, and the "low-hanging fruit"
 * (the channels they ALREADY buy, where investment is defended/grown first).
 *
 * Amounts are in MILLIONS of MXN.
 */

import { getDatabase } from "../db.js";
import { normalizeMarca } from "../aura-rbac.js";
import { resolveAnunciante } from "../anunciante.js";
import { MEDIO_LABEL, type Escenario } from "./types.js";

export interface EscenarioResumen {
  total: number;
  lineas: { medio: string; monto: number; esMundial: boolean }[];
}

export interface LowHangingFruit {
  medio: string;
  /** Recurring base investment (2026 ex-Mundial) in this channel — already buys it. */
  base: number;
  /** 2027 target in this channel. */
  meta: number;
}

export interface CierreFrame {
  cierre2026: EscenarioResumen; // incl. World Cup
  base2026: EscenarioResumen; // ex-World Cup recurring base
  meta2027: EscenarioResumen; // target
  /** World-Cup-attributable revenue closed in 2026 (won't recur). */
  mundial: number;
  /** Growth required on the recurring base to hit 2027 (meta − base). */
  crecimientoBase: number;
  /** crecimientoBase as a fraction of the base, or null if base is 0. */
  crecimientoPct: number | null;
  /** 2027 target vs the World-Cup-inflated 2026 headline (usually negative). */
  vs2026: number;
  vs2026Pct: number | null;
  /** Channels already bought (base>0, ex-Mundial), with their 2027 target. */
  lowHangingFruit: LowHangingFruit[];
}

interface HeaderRow {
  id: number;
  escenario: Escenario;
  total: number;
}
interface LineRow {
  cierre_id: number;
  medio: string;
  monto: number;
  es_mundial: number;
}

/** Are any closing-goal rows loaded at all? Distinguishes "no data" from "no match". */
export function cierreMetasLoaded(): boolean {
  const db = getDatabase();
  const row = db.prepare(`SELECT 1 FROM cierre_meta LIMIT 1`).get();
  return row !== undefined;
}

function emptyResumen(): EscenarioResumen {
  return { total: 0, lineas: [] };
}

/** Build a frame from headers + their lines (already filtered to the target accounts). */
function buildFrame(headers: HeaderRow[], lines: LineRow[]): CierreFrame {
  const escById = new Map<number, Escenario>();
  const res: Record<Escenario, EscenarioResumen> = {
    cierre_2026: emptyResumen(),
    base_2026: emptyResumen(),
    meta_2027: emptyResumen(),
  };
  for (const h of headers) {
    escById.set(h.id, h.escenario);
    res[h.escenario].total += h.total;
  }
  // Aggregate media lines per escenario+medio (sum across accounts).
  const byEscMedio = new Map<string, { monto: number; esMundial: boolean }>();
  for (const ln of lines) {
    const esc = escById.get(ln.cierre_id);
    if (!esc) continue;
    const k = `${esc}|${ln.medio}`;
    const cur = byEscMedio.get(k) ?? {
      monto: 0,
      esMundial: ln.es_mundial === 1,
    };
    cur.monto += ln.monto;
    byEscMedio.set(k, cur);
  }
  for (const [k, v] of byEscMedio) {
    const [esc, medio] = k.split("|") as [Escenario, string];
    res[esc].lineas.push({ medio, monto: v.monto, esMundial: v.esMundial });
  }
  for (const esc of Object.keys(res) as Escenario[]) {
    res[esc].lineas.sort((a, b) => b.monto - a.monto);
  }

  const mundial = res.cierre_2026.lineas
    .filter((l) => l.esMundial)
    .reduce((s, l) => s + l.monto, 0);
  const crecimientoBase = res.meta_2027.total - res.base_2026.total;
  const vs2026 = res.meta_2027.total - res.cierre_2026.total;

  // Low-hanging fruit: channels already bought in the recurring base (ex-Mundial),
  // paired with their 2027 target. These are where investment is defended + grown
  // before pitching net-new media.
  const metaByMedio = new Map(
    res.meta_2027.lineas.map((l) => [l.medio, l.monto]),
  );
  const lowHangingFruit: LowHangingFruit[] = res.base_2026.lineas
    .filter((l) => !l.esMundial && l.monto > 0)
    .map((l) => ({
      medio: l.medio,
      base: l.monto,
      meta: metaByMedio.get(l.medio) ?? 0,
    }))
    .sort((a, b) => b.base - a.base);

  return {
    cierre2026: res.cierre_2026,
    base2026: res.base_2026,
    meta2027: res.meta_2027,
    mundial,
    crecimientoBase,
    crecimientoPct:
      res.base_2026.total > 0 ? crecimientoBase / res.base_2026.total : null,
    vs2026,
    vs2026Pct:
      res.cierre_2026.total > 0 ? vs2026 / res.cierre_2026.total : null,
    lowHangingFruit,
  };
}

function frameForWhere(where: string, params: unknown[]): CierreFrame | null {
  const db = getDatabase();
  const headers = db
    .prepare(`SELECT id, escenario, total FROM cierre_meta WHERE ${where}`)
    .all(...params) as HeaderRow[];
  if (headers.length === 0) return null;
  const ids = headers.map((h) => h.id);
  const ph = ids.map(() => "?").join(",");
  const lines = db
    .prepare(
      `SELECT cierre_id, medio, monto, es_mundial FROM cierre_meta_linea WHERE cierre_id IN (${ph})`,
    )
    .all(...ids) as LineRow[];
  return buildFrame(headers, lines);
}

export interface CierreCandidate {
  gerenteCode: string;
  cuentaRaw: string;
  cuentaId: string | null;
}
export interface ResolveResult {
  status: "ok" | "ambiguous" | "none";
  /** The distinct account(s) resolved (one when ok). */
  accounts: CierreCandidate[];
}

/**
 * Resolve a free-text account/advertiser name to its closing-goal account(s).
 * Exact normalized account-name match first (optionally scoped to a set of
 * gerente codes — the persona's portfolio); then the advertiser path
 * (resolveAnunciante → anunciante_norm). >1 distinct account → ambiguous (no
 * guess); the tool surfaces candidates.
 */
export function resolveCierreAccounts(
  nombre: string,
  scopeGerenteNorms?: string[],
): ResolveResult {
  const db = getDatabase();
  const norm = normalizeMarca(nombre);
  if (!norm) return { status: "none", accounts: [] };

  const scopeClause =
    scopeGerenteNorms && scopeGerenteNorms.length > 0
      ? ` AND LOWER(gerente_code) IN (${scopeGerenteNorms.map(() => "?").join(",")})`
      : "";
  const scopeParams = scopeGerenteNorms ?? [];

  const distinct = (
    rows: {
      gerente_code: string;
      cuenta_raw: string;
      cuenta_id: string | null;
    }[],
  ) => {
    const seen = new Map<string, CierreCandidate>();
    for (const r of rows) {
      const k = `${normalizeMarca(r.gerente_code)}|${normalizeMarca(r.cuenta_raw)}`;
      if (!seen.has(k))
        seen.set(k, {
          gerenteCode: r.gerente_code,
          cuentaRaw: r.cuenta_raw,
          cuentaId: r.cuenta_id,
        });
    }
    return [...seen.values()];
  };

  // 1. Exact account-name match.
  let rows = db
    .prepare(
      `SELECT DISTINCT gerente_code, cuenta_raw, cuenta_id
       FROM cierre_meta WHERE cuenta_norm = ?${scopeClause}`,
    )
    .all(norm, ...scopeParams) as {
    gerente_code: string;
    cuenta_raw: string;
    cuenta_id: string | null;
  }[];
  let accounts = distinct(rows);

  // 2. Advertiser path — resolve to anunciante_norm, match cierre rows by it.
  if (accounts.length === 0) {
    const r = resolveAnunciante(nombre);
    if (r.anuncianteNorm) {
      rows = db
        .prepare(
          `SELECT DISTINCT gerente_code, cuenta_raw, cuenta_id
           FROM cierre_meta WHERE anunciante_norm = ?${scopeClause}`,
        )
        .all(r.anuncianteNorm, ...scopeParams) as typeof rows;
      accounts = distinct(rows);
    }
  }

  if (accounts.length === 0) return { status: "none", accounts: [] };
  if (accounts.length > 1) return { status: "ambiguous", accounts };
  return { status: "ok", accounts };
}

/** Frame for a resolved set of accounts (by gerente_code + cuenta_norm). */
export function frameForAccounts(
  accounts: CierreCandidate[],
): CierreFrame | null {
  if (accounts.length === 0) return null;
  const clauses = accounts.map(
    () => `(LOWER(gerente_code) = ? AND cuenta_norm = ?)`,
  );
  const params: unknown[] = [];
  for (const a of accounts) {
    params.push(normalizeMarca(a.gerenteCode), normalizeMarca(a.cuentaRaw));
  }
  return frameForWhere(clauses.join(" OR "), params);
}

// --- Portfolio rollup -------------------------------------------------------

export interface PortafolioCuenta {
  cuentaRaw: string;
  gerenteCode: string;
  cierre2026: number;
  mundial: number;
  base2026: number;
  meta2027: number;
  /** meta2027 − base2026 (growth required on the recurring base). */
  crecimientoBase: number;
}
export interface Portafolio {
  gerenteCodes: string[];
  total: CierreFrame;
  cuentas: PortafolioCuenta[];
}

/**
 * Portfolio rollup for a set of gerente codes (the persona's scope: own code for
 * a gerente; their gerentes for a director/VP). Returns the aggregate frame plus
 * a per-account breakdown sorted by 2027 target.
 */
export function cierrePortafolio(gerenteCodes: string[]): Portafolio | null {
  if (gerenteCodes.length === 0) return null;
  const db = getDatabase();
  const norms = gerenteCodes.map((g) => normalizeMarca(g));
  const ph = norms.map(() => "?").join(",");
  const total = frameForWhere(`LOWER(gerente_code) IN (${ph})`, norms);
  if (!total) return null;

  // Per-account: pivot the three escenarios into one row per (gerente, cuenta).
  const rows = db
    .prepare(
      `SELECT gerente_code, cuenta_raw, cuenta_norm, escenario, total
       FROM cierre_meta WHERE LOWER(gerente_code) IN (${ph})`,
    )
    .all(...norms) as {
    gerente_code: string;
    cuenta_raw: string;
    cuenta_norm: string;
    escenario: Escenario;
    total: number;
  }[];
  // Mundial per account from its cierre_2026 lines.
  const mundialRows = db
    .prepare(
      `SELECT m.gerente_code, m.cuenta_norm, COALESCE(SUM(l.monto),0) AS mundial
       FROM cierre_meta m JOIN cierre_meta_linea l ON l.cierre_id = m.id
       WHERE m.escenario = 'cierre_2026' AND l.es_mundial = 1
         AND LOWER(m.gerente_code) IN (${ph})
       GROUP BY m.gerente_code, m.cuenta_norm`,
    )
    .all(...norms) as {
    gerente_code: string;
    cuenta_norm: string;
    mundial: number;
  }[];
  const mundialByKey = new Map(
    mundialRows.map((r) => [
      `${normalizeMarca(r.gerente_code)}|${r.cuenta_norm}`,
      r.mundial,
    ]),
  );

  const byKey = new Map<string, PortafolioCuenta>();
  for (const r of rows) {
    const k = `${normalizeMarca(r.gerente_code)}|${r.cuenta_norm}`;
    const c =
      byKey.get(k) ??
      ({
        cuentaRaw: r.cuenta_raw,
        gerenteCode: r.gerente_code,
        cierre2026: 0,
        mundial: mundialByKey.get(k) ?? 0,
        base2026: 0,
        meta2027: 0,
        crecimientoBase: 0,
      } as PortafolioCuenta);
    if (r.escenario === "cierre_2026") c.cierre2026 = r.total;
    else if (r.escenario === "base_2026") c.base2026 = r.total;
    else if (r.escenario === "meta_2027") c.meta2027 = r.total;
    byKey.set(k, c);
  }
  const cuentas = [...byKey.values()]
    .map((c) => ({ ...c, crecimientoBase: c.meta2027 - c.base2026 }))
    .sort((a, b) => b.meta2027 - a.meta2027);

  return { gerenteCodes, total, cuentas };
}

// --- Formatting / coaching summary ------------------------------------------

/** Millions of MXN, one decimal: 212.49 -> "$212.5M". */
export function fmtM(n: number): string {
  return `$${n.toFixed(1)}M`;
}
function pct(n: number | null): string {
  if (n === null) return "n/d";
  const sign = n > 0 ? "+" : "";
  return `${sign}${(n * 100).toFixed(1)}%`;
}
function medioLabel(m: string): string {
  return MEDIO_LABEL[m] ?? m;
}

/**
 * A Spanish coaching narrative for one account (or portfolio aggregate). States
 * the World-Cup gap explicitly and leads the retention argument with the
 * recurring base — because 2027 is a non-World-Cup year and the argument to
 * retain investment must be strong on the base, not the Mundial halo.
 */
export function cierreCoachingSummary(label: string, f: CierreFrame): string {
  const lhf = f.lowHangingFruit
    .slice(0, 5)
    .map(
      (c) =>
        `${medioLabel(c.medio)} (base ${fmtM(c.base)} → meta ${fmtM(c.meta)})`,
    )
    .join(", ");

  const hasMundial = f.mundial > 0;
  const hasBase = f.base2026.total > 0;

  const lines = [
    `[Interno — coaching de cierre, jamás al cliente] Cierre / Meta — ${label} (millones MXN):`,
  ];

  // 2026 closed — only call out the Mundial split when there was one.
  lines.push(
    hasMundial
      ? `• 2026 cerrado (con Mundial): ${fmtM(f.cierre2026.total)}, de los cuales ${fmtM(f.mundial)} fueron Mundial — NO se repiten en 2027.`
      : `• 2026 cerrado: ${fmtM(f.cierre2026.total)} (sin componente Mundial).`,
  );

  // Recurring base — what gets defended. A zero base = net-new business.
  lines.push(
    hasBase
      ? `• Base recurrente 2026 (sin Mundial): ${fmtM(f.base2026.total)}. Es lo que de verdad se defiende.`
      : `• Sin base recurrente 2026 — la meta 2027 es negocio NUEVO por construir, no una base a defender.`,
  );

  // 2027 target — frame vs the base (when there is one) and vs the 2026 headline.
  lines.push(
    hasBase
      ? `• Meta 2027: ${fmtM(f.meta2027.total)} — ${pct(f.crecimientoPct)} sobre la base recurrente, y ${pct(f.vs2026Pct)} vs. el cierre 2026${hasMundial ? " inflado por el Mundial" : ""}.`
      : `• Meta 2027: ${fmtM(f.meta2027.total)} — negocio nuevo (sin base previa que comparar).`,
  );

  if (hasMundial) {
    lines.push(
      `• Brecha Mundial a reemplazar: ${fmtM(f.mundial)}. En año sin Mundial el argumento debe sostenerse en el valor recurrente, no en el halo del Mundial.`,
    );
  }
  if (lhf) {
    lines.push(
      `• Fruta al alcance (medios que YA compran — defender y crecer primero): ${lhf}.`,
    );
  }

  // Encuadre tailored to what the account actually is.
  if (!hasBase) {
    lines.push(
      `Encuadre del cierre: cuenta sin base previa — la meta 2027 es negocio nuevo. Construye desde la radiografía y el caso multimedia, no desde una base a defender.`,
    );
  } else if (hasMundial) {
    lines.push(
      `Encuadre del cierre: lleva con la base recurrente y su crecimiento (${pct(f.crecimientoPct)}); plantea cómo recuperar la inversión del Mundial (${fmtM(f.mundial)}) en los medios que ya usan, antes de proponer medios nuevos.`,
    );
  } else {
    lines.push(
      `Encuadre del cierre: sin halo de Mundial, el argumento es 100% defensa y crecimiento de la base recurrente (${pct(f.crecimientoPct)}) en los medios que ya usan; sube el listón medio por medio antes de proponer medios nuevos.`,
    );
  }
  return lines.join("\n");
}
