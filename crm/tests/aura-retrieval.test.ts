/**
 * Aura KB retrieval tests — the firewall + RBAC enforced IN SQL by searchAuraKb (now keyed on
 * brand_key = the folder slug, not the free-text marca), plus the regression that the
 * persona-scoped Drive RAG never leaks aura-kb docs.
 *
 * Embeddings use the deterministic local fallback; with a tiny corpus the vector over-fetch
 * returns every chunk, so what we exercise is the governance filtering, not embedding quality.
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";
import type { AuraGovernance } from "../src/doc-sync.js";

let testDb: InstanceType<typeof Database>;

vi.mock("../src/db.js", () => ({ getDatabase: () => testDb }));

const noop = () => {};
const noopLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  fatal: noop,
  child: () => noopLogger,
};
vi.mock("../src/logger.js", () => ({ logger: noopLogger }));

vi.mock("../src/embedding.js", async (importOriginal) => {
  const orig = (await importOriginal()) as any;
  return {
    ...orig,
    embedText: async (t: string) => orig.embedTextLocal(t),
    embedBatch: async (ts: string[]) => ts.map((t) => orig.embedTextLocal(t)),
  };
});

const { storeDocument, searchAuraKb, searchDocuments } =
  await import("../src/doc-sync.js");

function setupDb() {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);
}
beforeEach(setupDb);

// brandKey is the firewall key (folder slug); marca is just display metadata and may vary
// across a brand's findings.
function gov(
  brandKey: string,
  marca: string,
  rol: string,
  aislado = true,
): AuraGovernance {
  return {
    marca,
    brandKey,
    rolMinimo: rol,
    sensibilidad: "baja",
    aisladoPorCliente: aislado,
    cuerpo: "diagnostico_9fuentes",
    estabilidad: "estable",
    tier: null,
  };
}

function ingest(
  brandKey: string,
  marca: string,
  rol: string,
  titulo: string,
  body: string,
  aislado = true,
) {
  return storeDocument(
    null,
    "aura-kb",
    `${brandKey}::${titulo}`,
    titulo,
    "aura-finding",
    `${titulo}\n\n${body}`,
    gov(brandKey, marca, rol, aislado),
  );
}

async function seedBrands() {
  await ingest(
    "coca-cola",
    "Coca Cola",
    "comercial_kam",
    "Coca Diag",
    "Diagnostico de Coca Cola con television abierta horario estelar campana refrescos.",
  );
  await ingest(
    "coca-cola",
    "Coca Cola",
    "restringido_senior",
    "Coca Dark",
    "Sala invisible comite negociacion estrategia de cierre para Coca Cola.",
  );
  await ingest(
    "pepsi",
    "Pepsi",
    "comercial_kam",
    "Pepsi Diag",
    "Diagnostico de Pepsi con campana digital redes sociales refrescos.",
  );
}

describe("searchAuraKb — firewall (keyed on brand_key)", () => {
  beforeEach(seedBrands);

  it("a coca-cola session never surfaces pepsi findings", async () => {
    const results = await searchAuraKb("refrescos campana television", {
      brand: "coca-cola",
      role: "gerente",
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.marca === "Coca Cola")).toBe(true);
    expect(results.some((r) => r.marca === "Pepsi")).toBe(false);
  });

  it("fails closed when no active brand is set", async () => {
    expect(
      await searchAuraKb("refrescos", { brand: null, role: "gerente" }),
    ).toEqual([]);
    expect(
      await searchAuraKb("refrescos", { brand: "  ", role: "gerente" }),
    ).toEqual([]);
  });
});

describe("searchAuraKb — completeness under one brand_key (THE FIX)", () => {
  it("retrieves ALL of a brand's findings even when marca strings differ (typos/variants)", async () => {
    // One brand folder, three findings tagged with three different marca strings — exactly the
    // real-corpus pathology (incl. the 'Lievité' typo). Old marca-keyed firewall would have
    // returned only the findings matching the queried marca; brand_key returns all three.
    await ingest(
      "bonafont-levite",
      "Bonafont Levite",
      "comercial_kam",
      "BL Diag",
      "Diagnostico bonafont levite agua saborizada campana refrescos.",
    );
    await ingest(
      "bonafont-levite",
      "Lievité",
      "comercial_kam",
      "BL Camp",
      "Campanas y temporalidades de levite agua saborizada refrescos.",
    );
    await ingest(
      "bonafont-levite",
      "Levité Aguas Saborizadas",
      "comercial_kam",
      "BL Social",
      "Inteligencia social levite conversacion agua refrescos.",
    );

    const results = await searchAuraKb("agua saborizada campana refrescos", {
      brand: "bonafont-levite",
      role: "gerente",
    });
    const titulos = results.map((r) => r.titulo);
    expect(titulos).toContain("BL Diag");
    expect(titulos).toContain("BL Camp");
    expect(titulos).toContain("BL Social");
  });
});

describe("searchAuraKb — RBAC", () => {
  beforeEach(seedBrands);

  it("AE cannot retrieve restringido_senior war-room material", async () => {
    const results = await searchAuraKb("sala invisible comite negociacion", {
      brand: "coca-cola",
      role: "ae",
    });
    expect(results.every((r) => r.titulo !== "Coca Dark")).toBe(true);
    expect(results.every((r) => r.rol_minimo !== "restringido_senior")).toBe(
      true,
    );
  });

  it("Gerente can retrieve restringido_senior material for the active brand", async () => {
    const results = await searchAuraKb("sala invisible comite negociacion", {
      brand: "coca-cola",
      role: "gerente",
    });
    expect(results.some((r) => r.titulo === "Coca Dark")).toBe(true);
  });
});

describe("Drive RAG isolation", () => {
  it("VP Drive search (empty persona filter) never returns aura-kb docs", async () => {
    await seedBrands();
    await storeDocument(
      null,
      "manual",
      "drive-1",
      "Nota Interna",
      "text",
      "Nota sobre refrescos y television abierta para el equipo.",
    );
    const results = await searchDocuments("refrescos television", [], 20);
    const titulos = results.map((r) => r.titulo);
    expect(titulos).not.toContain("Coca Diag");
    expect(titulos).not.toContain("Coca Dark");
    expect(titulos).not.toContain("Pepsi Diag");
  });
});

describe("searchAuraKb — firewall does not trust the aislado flag (C1)", () => {
  it("a finding with a brand_key + aislado=0 still cannot leak to another brand", async () => {
    await ingest(
      "pepsi",
      "Pepsi",
      "comercial_kam",
      "Pepsi Mislabeled",
      "Diagnostico Pepsi refrescos television campana.",
      false, // mislabeled not-isolated
    );
    await ingest(
      "coca-cola",
      "Coca Cola",
      "comercial_kam",
      "Coca Diag",
      "Diagnostico Coca Cola refrescos television campana.",
    );
    const results = await searchAuraKb("refrescos television campana", {
      brand: "coca-cola",
      role: "gerente",
    });
    expect(results.some((r) => r.titulo === "Pepsi Mislabeled")).toBe(false);
    expect(results.every((r) => r.marca === "Coca Cola")).toBe(true);
  });
});

describe("searchAuraKb — RBAC estrategia_research boundary (W4)", () => {
  beforeEach(async () => {
    await ingest(
      "coca-cola",
      "Coca Cola",
      "estrategia_research",
      "Coca Research",
      "Investigacion estrategica de audiencias Coca Cola journeys geo.",
    );
  });

  it("AE (comercial_kam ceiling) cannot read estrategia_research", async () => {
    const results = await searchAuraKb("investigacion audiencias journeys", {
      brand: "coca-cola",
      role: "ae",
    });
    expect(results.every((r) => r.titulo !== "Coca Research")).toBe(true);
  });

  it("Gerente can read estrategia_research", async () => {
    const results = await searchAuraKb("investigacion audiencias journeys", {
      brand: "coca-cola",
      role: "gerente",
    });
    expect(results.some((r) => r.titulo === "Coca Research")).toBe(true);
  });
});
