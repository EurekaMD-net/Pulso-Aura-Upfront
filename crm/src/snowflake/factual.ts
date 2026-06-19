/**
 * On-demand factual queries against Snowflake (P4).
 *
 * Each function resolves OUR advertiser (`anunciante_norm`) to its Snowflake key
 * (via reconciliation), runs a parameterized read query, and maps the rows to a
 * typed shape. The return carries an explicit status so callers (and, later,
 * agent tools) degrade honestly:
 *   - `not_configured` : Snowflake creds absent (querier is null)
 *   - `unreconciled`   : this advertiser has no Snowflake mapping yet
 *   - `ok`             : data retrieved
 *
 * The SQL in FACTUAL_SQL is PROVISIONAL — it encodes the intent + the bind
 * (always `WHERE <advertiser> = ?` on the reconciled SF id) and the expected
 * output columns, but the real table/column names must be confirmed against the
 * live Snowflake schema before this runs in production (tracked in AURA-P4-PLAN).
 */

import type { SnowflakeQuerier } from "./client.js";
import { getSnowflakeQuerier } from "./client.js";
import { snowflakeKeyForAnunciante } from "./anunciante-reconcile.js";

export type FactualStatus = "ok" | "unreconciled" | "not_configured";

export interface FactualResult<T> {
  status: FactualStatus;
  anuncianteNorm: string;
  sfId: string | null;
  data: T | null;
}

// --- Result shapes (one per example query) -----------------------------------

export interface LastClosed {
  monto: number;
  moneda: string;
  periodo: string;
}

/** Inventory mix: spot vs. programa vs. timeslot vs. otras propiedades. */
export interface InventoryMixRow {
  tipo: string; // 'spot' | 'programa' | 'timeslot' | 'otras_propiedades' | ...
  monto: number;
  share: number; // 0..1 of total
}

/** Descarga / investment over time (pacing of the booked investment). */
export interface InvestmentPoint {
  periodo: string; // e.g. ISO week or month
  monto: number;
}

// --- Provisional SQL (confirm against the real Snowflake schema) -------------

export const FACTUAL_SQL = {
  lastClosedAmount: `
    SELECT monto_cerrado AS monto, moneda, periodo
    FROM cierres
    WHERE anunciante_id = ?
    ORDER BY fecha_cierre DESC
    LIMIT 1`,
  inventoryMix: `
    SELECT tipo_inventario AS tipo, SUM(monto) AS monto
    FROM ordenes
    WHERE anunciante_id = ?
    GROUP BY tipo_inventario
    ORDER BY monto DESC`,
  investmentOverTime: `
    SELECT periodo, SUM(monto) AS monto
    FROM descargas
    WHERE anunciante_id = ?
    GROUP BY periodo
    ORDER BY periodo`,
} as const;

// --- Helpers -----------------------------------------------------------------

function gate<T>(
  q: SnowflakeQuerier | null,
  anuncianteNorm: string,
): { result: FactualResult<T> } | { sfId: string; q: SnowflakeQuerier } {
  if (!q)
    return {
      result: {
        status: "not_configured",
        anuncianteNorm,
        sfId: null,
        data: null,
      },
    };
  const key = snowflakeKeyForAnunciante(anuncianteNorm);
  if (!key)
    return {
      result: {
        status: "unreconciled",
        anuncianteNorm,
        sfId: null,
        data: null,
      },
    };
  return { sfId: key.sfId, q };
}

// --- Queries -----------------------------------------------------------------

export async function lastClosedAmount(
  anuncianteNorm: string,
  q: SnowflakeQuerier | null = getSnowflakeQuerier(),
): Promise<FactualResult<LastClosed>> {
  const g = gate<LastClosed>(q, anuncianteNorm);
  if ("result" in g) return g.result;
  const rows = await g.q.query<{
    MONTO?: number;
    monto?: number;
    MONEDA?: string;
    moneda?: string;
    PERIODO?: string;
    periodo?: string;
  }>(FACTUAL_SQL.lastClosedAmount, [g.sfId]);
  const r = rows[0];
  const data = r
    ? {
        monto: Number(r.MONTO ?? r.monto ?? 0),
        moneda: String(r.MONEDA ?? r.moneda ?? "MXN"),
        periodo: String(r.PERIODO ?? r.periodo ?? ""),
      }
    : null;
  return { status: "ok", anuncianteNorm, sfId: g.sfId, data };
}

export async function inventoryMix(
  anuncianteNorm: string,
  q: SnowflakeQuerier | null = getSnowflakeQuerier(),
): Promise<FactualResult<InventoryMixRow[]>> {
  const g = gate<InventoryMixRow[]>(q, anuncianteNorm);
  if ("result" in g) return g.result;
  const rows = await g.q.query<Record<string, unknown>>(
    FACTUAL_SQL.inventoryMix,
    [g.sfId],
  );
  const parsed = rows.map((r) => ({
    tipo: String(r.TIPO ?? r.tipo ?? "desconocido"),
    monto: Number(r.MONTO ?? r.monto ?? 0),
  }));
  const total = parsed.reduce((s, r) => s + r.monto, 0);
  const data = parsed.map((r) => ({
    ...r,
    share: total > 0 ? r.monto / total : 0,
  }));
  return { status: "ok", anuncianteNorm, sfId: g.sfId, data };
}

export async function investmentOverTime(
  anuncianteNorm: string,
  q: SnowflakeQuerier | null = getSnowflakeQuerier(),
): Promise<FactualResult<InvestmentPoint[]>> {
  const g = gate<InvestmentPoint[]>(q, anuncianteNorm);
  if ("result" in g) return g.result;
  const rows = await g.q.query<Record<string, unknown>>(
    FACTUAL_SQL.investmentOverTime,
    [g.sfId],
  );
  const data = rows.map((r) => ({
    periodo: String(r.PERIODO ?? r.periodo ?? ""),
    monto: Number(r.MONTO ?? r.monto ?? 0),
  }));
  return { status: "ok", anuncianteNorm, sfId: g.sfId, data };
}
