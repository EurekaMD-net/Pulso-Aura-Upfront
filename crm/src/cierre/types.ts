/**
 * Upfront closing-goal layer — shared types + media taxonomy.
 *
 * The operator's "Cierres 2026 A Semana 24" sheet has three tabs that map to
 * three `escenario`s per account:
 *   - cierre_2026 : 2026 actual closings INCLUDING the World Cup (Mundial) halo.
 *   - base_2026   : 2026 recurring base, ex-Mundial (what genuinely carries into 2027).
 *   - meta_2027   : the 2027 target (no World Cup tailwind).
 *
 * Amounts are in MILLIONS of MXN. The Mundial media lines (es_mundial) are the
 * World-Cup-attributable revenue — the gap a rep must defend/replace in a
 * non-World-Cup year, which is the whole point of the closing argument.
 */

export const ESCENARIOS = ["cierre_2026", "base_2026", "meta_2027"] as const;
export type Escenario = (typeof ESCENARIOS)[number];

/** Media lines that are World-Cup (Mundial) attributable — won't recur in 2027. */
export const MUNDIAL_MEDIOS = [
  "mundial_tv",
  "mundial_digital",
  "mundial_radio",
] as const;

/** Human labels for media keys (for the agent-facing summary). */
export const MEDIO_LABEL: Record<string, string> = {
  tv: "TV",
  mundial_tv: "Mundial TV",
  mundial_digital: "Mundial Digital",
  mundial_radio: "Mundial Radio",
  digital: "Digital",
  ctv: "CTV",
  roku: "Roku",
  disney: "Disney+",
  promoespacio: "Promoespacio",
  amx: "AMX",
  radio: "Radio",
  fox: "Fox",
};

export interface CierreLinea {
  medio: string;
  monto: number;
  esMundial: boolean;
}

/** One account in one escenario, with its media breakdown. */
export interface CierreRow {
  gerenteCode: string;
  cuentaRaw: string;
  escenario: Escenario;
  total: number;
  lineas: CierreLinea[];
}

export interface LoadReport {
  rows: number;
  /** Distinct accounts (gerente_code, cuenta) seen. */
  cuentas: number;
  linked: number;
  unmatched: { gerenteCode: string; cuentaRaw: string }[];
  ambiguous: { gerenteCode: string; cuentaRaw: string; matches: number }[];
  nonPilot: number;
  porEscenario: Record<Escenario, number>;
}
