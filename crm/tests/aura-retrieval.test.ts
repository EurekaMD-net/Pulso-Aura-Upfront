/**
 * Aura KB retrieval tests — the firewall + RBAC enforced IN SQL by searchAuraKb,
 * plus the regression that the persona-scoped Drive RAG never leaks aura-kb docs.
 *
 * Embeddings use the deterministic local fallback; with a tiny corpus the vector
 * over-fetch returns every chunk, so what we are exercising is the governance
 * filtering, not embedding quality.
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

function gov(marca: string, rol: string, aislado = true): AuraGovernance {
  return {
    marca,
    rolMinimo: rol,
    sensibilidad: "baja",
    aisladoPorCliente: aislado,
    cuerpo: "diagnostico_9fuentes",
    estabilidad: "estable",
    tier: null,
  };
}

function ingest(
  marca: string,
  rol: string,
  titulo: string,
  body: string,
  aislado = true,
) {
  return storeDocument(
    null,
    "aura-kb",
    `${marca}::${titulo}`,
    titulo,
    "aura-finding",
    `${titulo}\n\n${body}`,
    gov(marca, rol, aislado),
  );
}

async function seedBrands() {
  await ingest(
    "Coca Cola",
    "comercial_kam",
    "Coca Diag",
    "Diagnostico de Coca Cola con television abierta horario estelar campana refrescos.",
  );
  await ingest(
    "Coca Cola",
    "restringido_senior",
    "Coca Dark",
    "Sala invisible comite negociacion estrategia de cierre para Coca Cola.",
  );
  await ingest(
    "Pepsi",
    "comercial_kam",
    "Pepsi Diag",
    "Diagnostico de Pepsi con campana digital redes sociales refrescos.",
  );
}

describe("searchAuraKb — firewall", () => {
  beforeEach(seedBrands);

  it("a Coca Cola session never surfaces Pepsi findings", async () => {
    const results = await searchAuraKb("refrescos campana television", {
      marca: "Coca Cola",
      role: "gerente",
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.marca === "Coca Cola")).toBe(true);
    expect(results.some((r) => r.marca === "Pepsi")).toBe(false);
  });

  it("matches brand case-insensitively", async () => {
    const results = await searchAuraKb("refrescos", {
      marca: "coca cola",
      role: "gerente",
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.marca === "Coca Cola")).toBe(true);
  });

  it("fails closed when no active brand is set", async () => {
    expect(
      await searchAuraKb("refrescos", { marca: null, role: "gerente" }),
    ).toEqual([]);
    expect(
      await searchAuraKb("refrescos", { marca: "  ", role: "gerente" }),
    ).toEqual([]);
  });
});

describe("searchAuraKb — RBAC", () => {
  beforeEach(seedBrands);

  it("AE cannot retrieve restringido_senior war-room material", async () => {
    const results = await searchAuraKb("sala invisible comite negociacion", {
      marca: "Coca Cola",
      role: "ae",
    });
    expect(results.every((r) => r.titulo !== "Coca Dark")).toBe(true);
    expect(results.every((r) => r.rol_minimo !== "restringido_senior")).toBe(
      true,
    );
  });

  it("Gerente can retrieve restringido_senior material for the active brand", async () => {
    const results = await searchAuraKb("sala invisible comite negociacion", {
      marca: "Coca Cola",
      role: "gerente",
    });
    expect(results.some((r) => r.titulo === "Coca Dark")).toBe(true);
  });
});

describe("Drive RAG isolation", () => {
  it("VP Drive search (empty persona filter) never returns aura-kb docs", async () => {
    await seedBrands();
    // Also store a real Drive doc so the search has a legitimate hit.
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
  it("a branded finding with aislado=0 still cannot leak to another brand", async () => {
    // Mislabeled: real brand 'Pepsi' but flagged not-isolated.
    await ingest(
      "Pepsi",
      "comercial_kam",
      "Pepsi Mislabeled",
      "Diagnostico Pepsi refrescos television campana.",
      false,
    );
    await ingest(
      "Coca Cola",
      "comercial_kam",
      "Coca Diag",
      "Diagnostico Coca Cola refrescos television campana.",
    );
    const results = await searchAuraKb("refrescos television campana", {
      marca: "Coca Cola",
      role: "gerente",
    });
    expect(results.some((r) => r.titulo === "Pepsi Mislabeled")).toBe(false);
    expect(results.every((r) => r.marca === "Coca Cola")).toBe(true);
  });
});

describe("searchAuraKb — accented brand matching (W3)", () => {
  it("matches across case + diacritics (ENSUEÑO ↔ ensueño)", async () => {
    await ingest(
      "Ensueño",
      "comercial_kam",
      "Ensueno Diag",
      "Diagnostico de Ensueno suavizante hogar campana.",
    );
    const results = await searchAuraKb("suavizante campana", {
      marca: "ENSUEÑO",
      role: "gerente",
    });
    expect(results.length).toBeGreaterThan(0);
    expect(results.every((r) => r.marca === "Ensueño")).toBe(true);
  });
});

describe("searchAuraKb — RBAC estrategia_research boundary (W4)", () => {
  beforeEach(async () => {
    await ingest(
      "Coca Cola",
      "estrategia_research",
      "Coca Research",
      "Investigacion estrategica de audiencias Coca Cola journeys geo.",
    );
  });

  it("AE (comercial_kam ceiling) cannot read estrategia_research", async () => {
    const results = await searchAuraKb("investigacion audiencias journeys", {
      marca: "Coca Cola",
      role: "ae",
    });
    expect(results.every((r) => r.titulo !== "Coca Research")).toBe(true);
  });

  it("Gerente can read estrategia_research", async () => {
    const results = await searchAuraKb("investigacion audiencias journeys", {
      marca: "Coca Cola",
      role: "gerente",
    });
    expect(results.some((r) => r.titulo === "Coca Research")).toBe(true);
  });
});
