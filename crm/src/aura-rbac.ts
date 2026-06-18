/**
 * Aura KB role-based access control.
 *
 * Every KB asset is tagged with a `rol_minimo` clearance floor. The floors form a
 * cumulative lattice (order from aura-kb/taxonomy/rol-acceso.yaml): clearing a floor
 * clears every floor below it. CRM roles (ae/gerente/director/vp) map onto the lattice;
 * a user may retrieve an asset only if their role clears the asset's floor.
 *
 * Closing-companion consequence: Gerente + Director clear `restringido_senior`, so they
 * can read both the brand-intelligence corpus (mostly `estrategia_research`) and the
 * DARK/STAKEHOLDERS war-room material. See docs/AURA-KB-OPERATIONALIZATION.md §4.
 */

export type CrmRole = "ae" | "gerente" | "director" | "vp";

/**
 * Canonical brand key for firewall matching: lowercase + diacritics stripped + trimmed.
 * SQLite's LOWER() is ASCII-only (LOWER('ENSUEÑO') !== 'ensueño'), so the firewall must
 * compare on a pre-normalized column, not on LOWER(d.marca). Returns "" for empty input
 * (callers treat "" as "no brand").
 */
export function normalizeMarca(marca: string | null | undefined): string {
  if (!marca) return "";
  // Strip Unicode combining diacritical marks (U+0300–U+036F) after NFD decomposition.
  // Done by code point (not a literal-char regex) to keep the source ASCII-clean.
  const decomposed = marca.normalize("NFD");
  let out = "";
  for (const ch of decomposed) {
    const cp = ch.codePointAt(0)!;
    if (cp < 0x0300 || cp > 0x036f) out += ch;
  }
  return out.toLowerCase().trim();
}

/** KB clearance floors, ascending (index = rank). */
export const AURA_FLOORS = [
  "transversal",
  "comercial_kam",
  "estrategia_research",
  "restringido_senior",
  "direccion_clevel",
] as const;

export type AuraFloor = (typeof AURA_FLOORS)[number];

// Highest floor each CRM role clears (it also clears everything below it).
const ROLE_MAX_FLOOR: Record<CrmRole, AuraFloor> = {
  ae: "comercial_kam",
  gerente: "restringido_senior",
  director: "restringido_senior",
  vp: "direccion_clevel",
};

/**
 * KB floors a CRM role can read. Cumulative: clearing floor N clears floors 0..N.
 * An unknown role gets the most restrictive clearance (transversal only) — fail-closed.
 */
export function clearedFloors(role: string): AuraFloor[] {
  const max = ROLE_MAX_FLOOR[role as CrmRole];
  const maxRank = max ? AURA_FLOORS.indexOf(max) : 0;
  return AURA_FLOORS.slice(0, maxRank + 1) as AuraFloor[];
}

/**
 * Whether a CRM role clears a given asset floor. An untagged asset (null/empty floor)
 * has no restriction. An unrecognized floor string is treated as un-clearable
 * (fail-closed) — it is not in any role's cleared set.
 */
export function clears(
  role: string,
  floor: string | null | undefined,
): boolean {
  if (!floor) return true;
  return (clearedFloors(role) as string[]).includes(floor);
}
