/**
 * Closing-goal tools (Cierres 2026 / Metas 2027).
 *
 * Give the closing companion the commercial frame in the context of the rep:
 * how much an account closed in 2026 (and how much of that was the World Cup
 * halo that won't recur), the recurring base, the 2027 target, and the
 * "low-hanging fruit" (channels already bought). The retention argument for a
 * non-World-Cup year leads with the recurring base, not the Mundial halo.
 *
 *   consultar_metas_cierre     — one account/advertiser's closing frame.
 *   consultar_metas_portafolio — the rep's whole portfolio rollup.
 */

import type { ToolContext } from "./index.js";
import { getDatabase } from "../db.js";
import { normalizeMarca } from "../aura-rbac.js";
import {
  cierreMetasLoaded,
  resolveCierreAccounts,
  frameForAccounts,
  cierrePortafolio,
  cierreCoachingSummary,
  fmtM,
  type CierreFrame,
} from "../cierre/query.js";

/** The gerente codes in this persona's scope (own code for a gerente; their gerentes for Dir/VP). */
function scopeGerenteCodes(ctx: ToolContext): string[] {
  const db = getDatabase();
  if (ctx.rol === "gerente") {
    const me = db
      .prepare(`SELECT nombre FROM persona WHERE id = ?`)
      .get(ctx.persona_id) as { nombre: string } | undefined;
    return me ? [me.nombre] : [];
  }
  const ids = ctx.full_team_ids;
  if (ids.length === 0) return [];
  const ph = ids.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT nombre FROM persona WHERE rol = 'gerente' AND id IN (${ph})`,
    )
    .all(...ids) as { nombre: string }[];
  return rows.map((r) => r.nombre);
}

function frameToJson(f: CierreFrame) {
  return {
    cierre_2026: {
      total: round(f.cierre2026.total),
      mundial: round(f.mundial),
      lineas: f.cierre2026.lineas.map((l) => ({
        medio: l.medio,
        monto: round(l.monto),
        es_mundial: l.esMundial,
      })),
    },
    base_2026: {
      total: round(f.base2026.total),
      lineas: f.base2026.lineas.map((l) => ({
        medio: l.medio,
        monto: round(l.monto),
      })),
    },
    meta_2027: {
      total: round(f.meta2027.total),
      lineas: f.meta2027.lineas.map((l) => ({
        medio: l.medio,
        monto: round(l.monto),
      })),
    },
    derivado: {
      brecha_mundial: round(f.mundial),
      crecimiento_base: round(f.crecimientoBase),
      crecimiento_pct:
        f.crecimientoPct === null ? null : round(f.crecimientoPct * 100, 1),
      vs_2026: round(f.vs2026),
      vs_2026_pct: f.vs2026Pct === null ? null : round(f.vs2026Pct * 100, 1),
      low_hanging_fruit: f.lowHangingFruit.map((c) => ({
        medio: c.medio,
        base: round(c.base),
        meta: round(c.meta),
      })),
    },
  };
}

function round(n: number, d = 2): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

/**
 * consultar_metas_cierre — the closing frame for ONE account/advertiser.
 * Resolves within the rep's portfolio first, then globally.
 */
export async function consultar_metas_cierre(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const raw =
    typeof args.cuenta === "string"
      ? args.cuenta.trim()
      : typeof args.anunciante === "string"
        ? args.anunciante.trim()
        : "";
  if (!raw)
    return JSON.stringify({
      error: 'Falta el parámetro "cuenta" (o "anunciante").',
    });
  if (!cierreMetasLoaded())
    return JSON.stringify({
      status: "no_cargada",
      mensaje:
        "Aún no se han cargado las metas de cierre (Cierres 2026 / Metas 2027).",
    });

  const scope = scopeGerenteCodes(ctx).map((g) => normalizeMarca(g));
  let res = resolveCierreAccounts(raw, scope.length ? scope : undefined);
  let fueraDeCartera = false;
  // Not in this rep's portfolio? Retry globally so a Dir/VP can still look it up.
  if (res.status === "none" && scope.length) {
    res = resolveCierreAccounts(raw);
    fueraDeCartera = res.status !== "none";
  }

  if (res.status === "none")
    return JSON.stringify({
      cuenta: raw,
      status: "no_encontrada",
      mensaje: `No hay metas de cierre para "${raw}".`,
    });
  if (res.status === "ambiguous")
    return JSON.stringify({
      cuenta: raw,
      ambigua: true,
      mensaje: `"${raw}" coincide con varias cuentas. ¿A cuál te refieres?`,
      opciones: res.accounts.map((a) => ({
        cuenta: a.cuentaRaw,
        gerente: a.gerenteCode,
      })),
    });

  const frame = frameForAccounts(res.accounts);
  if (!frame)
    return JSON.stringify({
      cuenta: raw,
      status: "no_encontrada",
      mensaje: `No se pudieron armar las metas de "${raw}".`,
    });

  const label = res.accounts[0].cuentaRaw;
  return JSON.stringify({
    cuenta: label,
    gerente: res.accounts[0].gerenteCode,
    status: "ok",
    fuera_de_cartera: fueraDeCartera || undefined,
    ...frameToJson(frame),
    mensaje: cierreCoachingSummary(label, frame),
  });
}

/**
 * consultar_metas_portafolio — the rep's whole closing portfolio rollup:
 * aggregate 2026/base/2027 + per-account breakdown sorted by 2027 target,
 * flagging the accounts most exposed to the World Cup gap.
 */
export async function consultar_metas_portafolio(
  _args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  if (!cierreMetasLoaded())
    return JSON.stringify({
      status: "no_cargada",
      mensaje:
        "Aún no se han cargado las metas de cierre (Cierres 2026 / Metas 2027).",
    });
  const codes = scopeGerenteCodes(ctx);
  if (codes.length === 0)
    return JSON.stringify({
      status: "sin_cartera",
      mensaje: "No tienes una cartera de cierre asociada todavía.",
    });

  const port = cierrePortafolio(codes);
  if (!port)
    return JSON.stringify({
      status: "no_encontrada",
      gerentes: codes,
      mensaje: `No hay metas de cierre para tu cartera (${codes.join(", ")}).`,
    });

  const f = port.total;
  const topMundial = [...port.cuentas]
    .filter((c) => c.mundial > 0)
    .sort((a, b) => b.mundial - a.mundial)
    .slice(0, 5);
  const topCrecimiento = [...port.cuentas]
    .sort((a, b) => b.crecimientoBase - a.crecimientoBase)
    .slice(0, 5);

  const label = `Cartera (${codes.join(", ")})`;
  return JSON.stringify({
    status: "ok",
    gerentes: codes,
    total: {
      cierre_2026: round(f.cierre2026.total),
      mundial: round(f.mundial),
      base_2026: round(f.base2026.total),
      meta_2027: round(f.meta2027.total),
      crecimiento_base: round(f.crecimientoBase),
      crecimiento_pct:
        f.crecimientoPct === null ? null : round(f.crecimientoPct * 100, 1),
      vs_2026_pct: f.vs2026Pct === null ? null : round(f.vs2026Pct * 100, 1),
    },
    cuentas: port.cuentas.map((c) => ({
      cuenta: c.cuentaRaw,
      gerente: c.gerenteCode,
      cierre_2026: round(c.cierre2026),
      mundial: round(c.mundial),
      base_2026: round(c.base2026),
      meta_2027: round(c.meta2027),
      crecimiento_base: round(c.crecimientoBase),
    })),
    mas_expuestas_al_mundial: topMundial.map((c) => ({
      cuenta: c.cuentaRaw,
      mundial: round(c.mundial),
    })),
    mayor_crecimiento_requerido: topCrecimiento.map((c) => ({
      cuenta: c.cuentaRaw,
      crecimiento_base: round(c.crecimientoBase),
    })),
    mensaje:
      cierreCoachingSummary(label, f) +
      `\nMás expuestas al Mundial (defender primero): ${topMundial
        .map((c) => `${c.cuentaRaw} ${fmtM(c.mundial)}`)
        .join(", ")}.`,
  });
}
