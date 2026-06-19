/**
 * Proactive Near-Close Coaching (Aura · Cierre cercano)
 *
 * A scheduled sweep (Monday 07:00 MX, via the unified scheduler's
 * `crm_nearclose_coaching` task) that finds deals in the closing zone and
 * nudges the responsible Gerente/Director to open the Aura Modo Cierre flow.
 *
 * Anchored on the ANUNCIANTE (the deal unit — one budget, one committee across
 * the portfolio; see P3.5), the nudge points to `armar_radiografia_anunciante`
 * + `mapa_poder_anunciante`. It coaches the seller — it NEVER reaches the
 * client.
 *
 * The never-to-client gate is enforced as code in `resolveCoachingRecipient`:
 * the ONLY way a message reaches a recipient is an internal `persona` with
 * `rol ∈ {gerente, director}`, active, with a registered WhatsApp group. A
 * `contacto` (client) has no `persona` row, so it can never become a send
 * target — and nothing here reads `contacto.telefono`.
 *
 * Mirrors `escalation.ts` (same alerta_log dedup + registeredGroups jid rail).
 */

import { getDatabase } from "./db.js";
import { getPersonById, type Persona } from "./hierarchy.js";
import { logger } from "./logger.js";
import { getMxDateStr } from "./tools/helpers.js";
import type { IpcDeps } from "../../engine/src/ipc.js";

const ALERT_TYPE = "nearclose_coaching";

/** Deal stages where war-room coaching matters: active negotiation + verbally
 *  confirmed (lock + upsell the portfolio). Excludes earlier `en_discusion`,
 *  already-won `orden_recibida`, and terminal states. */
const NEARCLOSE_ETAPAS = ["en_negociacion", "confirmada_verbal"] as const;

/** Flag a deal as stale (shown in the nudge) past this many days of inactivity. */
const STALE_DAYS = 7;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface NearcloseDeal {
  id: string;
  titulo: string;
  etapa: string;
  valorEstimado: number | null;
  fechaCierreEsperado: string | null;
  diasSinActividad: number;
}

export interface NearcloseCluster {
  /** The Gerente/Director who coaches this deal's AE (ae.reporta_a). */
  recipientPersonaId: string;
  /** Stable dedup key: anunciante_norm, or `cuenta:<id>` when unlinked. */
  key: string;
  anunciante: string | null;
  cuentaNombre: string | null;
  deals: NearcloseDeal[];
}

export interface RecipientResolution {
  ok: boolean;
  jid?: string;
  persona?: Persona;
  reason?:
    | "not_a_persona"
    | "role_out_of_scope"
    | "inactive"
    | "no_group"
    | "no_registered_group";
}

export interface SweepResult {
  sent: number;
  skipped: number;
  blocked: number;
}

// ---------------------------------------------------------------------------
// alerta_log dedup helpers (same rail as escalation.ts)
// ---------------------------------------------------------------------------

function genId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function today(): string {
  return getMxDateStr();
}

/** Check if a nudge of this type+entity was already sent today. The sweep runs
 *  weekly (Mon), so daily dedup yields one nudge per cluster per week and guards
 *  against a same-day re-fire after a restart. Dedup is deliberately keyed on
 *  (type, entityId, day) only — `entityId` already embeds the recipient persona,
 *  so one cluster maps to one coach; `grupo_destino` (a column on the unique
 *  index) is intentionally not part of the check. Same rail as escalation.ts. */
function isDuplicate(entityId: string): boolean {
  const db = getDatabase();
  const row = db
    .prepare(
      `SELECT 1 FROM alerta_log WHERE alerta_tipo = ? AND entidad_id = ? AND fecha_envio_date = ?`,
    )
    .get(ALERT_TYPE, entityId, today());
  return row !== undefined;
}

function recordAlert(entityId: string, grupoDestino: string): void {
  const db = getDatabase();
  const mxNow = new Date().toLocaleString("sv-SE", {
    timeZone: "America/Mexico_City",
  });
  db.prepare(
    `INSERT OR IGNORE INTO alerta_log (id, alerta_tipo, entidad_id, grupo_destino, fecha_envio)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(genId("nc"), ALERT_TYPE, entityId, grupoDestino, mxNow);
}

/** Resolve a persona's whatsapp_group_folder to its registered JID. */
function findJid(folder: string, deps: IpcDeps): string | undefined {
  const groups = deps.registeredGroups();
  return Object.keys(groups).find((k) => groups[k].folder === folder);
}

// ---------------------------------------------------------------------------
// Never-to-client gate (as code)
// ---------------------------------------------------------------------------

const COACH_ROLES: ReadonlySet<Persona["rol"]> = new Set([
  "gerente",
  "director",
]);

/**
 * The delivery boundary. A coaching nudge may ONLY reach an internal persona in
 * the Gerente/Director tier with a registered WhatsApp group. Any other target
 * — an AE, a VP, an inactive persona, or a `contacto` (client, which has no
 * `persona` row) — is blocked with a reason and never receives a message.
 */
export function resolveCoachingRecipient(
  personaId: string | null,
  deps: IpcDeps,
): RecipientResolution {
  if (!personaId) return { ok: false, reason: "not_a_persona" };
  const persona = getPersonById(personaId);
  if (!persona) return { ok: false, reason: "not_a_persona" };
  if (!COACH_ROLES.has(persona.rol))
    return { ok: false, reason: "role_out_of_scope" };
  if (persona.activo !== 1) return { ok: false, reason: "inactive" };
  if (!persona.whatsapp_group_folder) return { ok: false, reason: "no_group" };
  const jid = findJid(persona.whatsapp_group_folder, deps);
  if (!jid) return { ok: false, reason: "no_registered_group" };
  return { ok: true, jid, persona };
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

interface ClusterRow {
  id: string;
  titulo: string;
  etapa: string;
  valor_estimado: number | null;
  fecha_cierre_esperado: string | null;
  dias_sin_actividad: number | null;
  gerente_id: string | null;
  cuenta_id: string | null;
  cuenta_nombre: string | null;
  anunciante: string | null;
  anunciante_norm: string | null;
}

/**
 * Sweep near-close propuestas and cluster them by (responsible Gerente,
 * anunciante). When the cuenta isn't yet linked to an anunciante (clean-start),
 * the cluster degrades to per-cuenta — the nudge still works, just account-grain.
 */
export function nearcloseClusters(): NearcloseCluster[] {
  const db = getDatabase();
  const placeholders = NEARCLOSE_ETAPAS.map(() => "?").join(",");
  const rows = db
    .prepare(
      `SELECT p.id, p.titulo, p.etapa, p.valor_estimado, p.fecha_cierre_esperado,
              p.dias_sin_actividad,
              ae.reporta_a AS gerente_id,
              c.id AS cuenta_id, c.nombre AS cuenta_nombre,
              c.anunciante, c.anunciante_norm
         FROM propuesta p
         JOIN persona ae ON ae.id = p.ae_id
         LEFT JOIN cuenta c ON c.id = p.cuenta_id
        WHERE p.etapa IN (${placeholders})
          AND ae.activo = 1
          AND ae.reporta_a IS NOT NULL
        ORDER BY p.valor_estimado DESC`,
    )
    .all(...NEARCLOSE_ETAPAS) as ClusterRow[];

  const map = new Map<string, NearcloseCluster>();
  for (const r of rows) {
    if (!r.gerente_id) continue;
    const anuncianteKey =
      r.anunciante_norm || `cuenta:${r.cuenta_id ?? "none"}`;
    const mapKey = `${r.gerente_id}::${anuncianteKey}`;
    let cluster = map.get(mapKey);
    if (!cluster) {
      cluster = {
        recipientPersonaId: r.gerente_id,
        key: anuncianteKey,
        anunciante: r.anunciante ?? null,
        cuentaNombre: r.cuenta_nombre ?? null,
        deals: [],
      };
      map.set(mapKey, cluster);
    }
    cluster.deals.push({
      id: r.id,
      titulo: r.titulo,
      etapa: r.etapa,
      valorEstimado: r.valor_estimado ?? null,
      fechaCierreEsperado: r.fecha_cierre_esperado ?? null,
      diasSinActividad: r.dias_sin_actividad ?? 0,
    });
  }
  return [...map.values()];
}

// ---------------------------------------------------------------------------
// Message composition
// ---------------------------------------------------------------------------

function etapaLabel(etapa: string): string {
  return etapa === "confirmada_verbal" ? "confirmada verbal" : "en negociación";
}

/** Seller-language coaching nudge — synthesize, never dump raw rows. */
export function composeNudge(cluster: NearcloseCluster): string {
  const titulo = cluster.anunciante ?? cluster.cuentaNombre ?? "Cuenta";
  const n = cluster.deals.length;
  const sujeto = cluster.anunciante ? `${titulo} (anunciante)` : titulo;
  const lines = cluster.deals.map((d) => {
    const parts = [`*${d.titulo}* — ${etapaLabel(d.etapa)}`];
    if (d.valorEstimado)
      parts.push(`$${(d.valorEstimado / 1_000_000).toFixed(1)}M`);
    if (d.fechaCierreEsperado) parts.push(`cierre ${d.fechaCierreEsperado}`);
    if (d.diasSinActividad > STALE_DAYS)
      parts.push(`${d.diasSinActividad}d sin actividad`);
    return `• ${parts.join(" · ")}`;
  });
  return (
    `🎯 *Aura · Cierre cercano*\n\n` +
    `*${sujeto}* entró en zona de cierre — ${n} ${n === 1 ? "propuesta" : "propuestas"}:\n` +
    `${lines.join("\n")}\n\n` +
    `Abre el hilo de cierre de este anunciante:\n` +
    `1. \`armar_radiografia_anunciante\` → la necesidad GLOBAL del portafolio (un presupuesto, un comité).\n` +
    `2. \`mapa_poder_anunciante\` → quién decide y qué debe escuchar cada uno.\n\n` +
    `_Material interno de guerra. Coachea al vendedor — jamás al cliente ni al grupo._`
  );
}

// ---------------------------------------------------------------------------
// Sweep entry point
// ---------------------------------------------------------------------------

export async function evaluateNearcloseCoaching(
  deps: IpcDeps,
): Promise<SweepResult> {
  const clusters = nearcloseClusters();
  // `sent` counts messages dispatched (the send completed), not new log rows.
  let sent = 0;
  let skipped = 0;
  let blocked = 0;

  for (const cluster of clusters) {
    try {
      const recipient = resolveCoachingRecipient(
        cluster.recipientPersonaId,
        deps,
      );
      if (!recipient.ok) {
        blocked++;
        continue;
      }

      // `::` delimiter (same as the in-memory mapKey) — neither half can
      // contain it, so distinct (coach, anunciante) pairs never collide.
      const entityId = `${cluster.recipientPersonaId}::${cluster.key}`;
      if (isDuplicate(entityId)) {
        skipped++;
        continue;
      }

      await deps.sendMessage(recipient.jid!, composeNudge(cluster));
      recordAlert(entityId, recipient.persona!.whatsapp_group_folder!);
      sent++;
      logger.info(
        {
          recipient: cluster.recipientPersonaId,
          rol: recipient.persona!.rol,
          anunciante: cluster.anunciante ?? cluster.cuentaNombre,
          deals: cluster.deals.length,
        },
        "Near-close coaching nudge sent",
      );
    } catch (err) {
      logger.error(
        { cluster: cluster.key, err },
        "Near-close nudge failed, continuing",
      );
    }
  }

  return { sent, skipped, blocked };
}
