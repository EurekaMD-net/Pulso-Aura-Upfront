/**
 * ARMAGEDDON read-path (P3.2) — radiografiaForBrand pulls a brand's 4 diagnostic cuerpos
 * deterministically by brand_key + cuerpo (NOT semantic search), with the firewall + RBAC
 * inherited from P2, and the tool armar_radiografia_marca that wraps it.
 *
 * Embeddings use the deterministic local fallback; we exercise the deterministic pull,
 * reassembly, faltantes, firewall and RBAC — not embedding quality.
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";
import type { AuraGovernance } from "../src/doc-sync.js";
import type { ToolContext } from "../src/tools/index.js";

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

const { storeDocument, radiografiaForBrand, RADIOGRAFIA_CUERPOS } =
  await import("../src/doc-sync.js");
const { armar_radiografia_marca } = await import("../src/tools/aura.js");

function setupDb() {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);
}
beforeEach(setupDb);

function ctx(rol: ToolContext["rol"]): ToolContext {
  return { persona_id: "p1", rol, team_ids: [], full_team_ids: [] };
}

function gov(
  brandKey: string,
  marca: string,
  rol: string,
  cuerpo: string,
): AuraGovernance {
  return {
    marca,
    brandKey,
    rolMinimo: rol,
    sensibilidad: "baja",
    aisladoPorCliente: true,
    cuerpo,
    estabilidad: "estable",
    tier: null,
  };
}

function ingest(
  brandKey: string,
  marca: string,
  rol: string,
  cuerpo: string,
  titulo: string,
  body: string,
) {
  return storeDocument(
    null,
    "aura-kb",
    `${brandKey}::${cuerpo}`,
    titulo,
    "aura-finding",
    `${titulo}\n\n${body}`,
    gov(brandKey, marca, rol, cuerpo),
  );
}

/** Ingest all 4 diagnostic cuerpos for a brand at a clearable floor. */
async function seedFullBrand(brandKey: string, marca: string) {
  await ingest(
    brandKey,
    marca,
    "estrategia_research",
    "diagnostico_9fuentes",
    `${marca} Diag`,
    "Diagnostico de 9 fuentes posicionamiento competitivo.",
  );
  await ingest(
    brandKey,
    marca,
    "estrategia_research",
    "buyer_personas",
    `${marca} Buyer`,
    "Buyer personas JTBD criterios de decision.",
  );
  await ingest(
    brandKey,
    marca,
    "comercial_kam",
    "campanas_temporalidades",
    `${marca} Camp`,
    "Campañas y temporalidades calendario estacional.",
  );
  await ingest(
    brandKey,
    marca,
    "estrategia_research",
    "inteligencia_social",
    `${marca} Social`,
    "Inteligencia social conversacion organica.",
  );
}

describe("radiografiaForBrand — deterministic 4-cuerpo pull", () => {
  it("returns the 4 cuerpos in canonical reading order with no faltantes", async () => {
    await seedFullBrand("coca-cola", "Coca Cola");
    const r = radiografiaForBrand("coca-cola", "gerente");
    expect(r.dimensiones.map((d) => d.cuerpo)).toEqual([
      ...RADIOGRAFIA_CUERPOS,
    ]);
    expect(r.faltantes).toEqual([]);
    expect(r.dimensiones.every((d) => d.contenido.length > 0)).toBe(true);
  });

  it("reports the missing dimensions in faltantes (and never invents them)", async () => {
    // Only diagnostico + social exist for this brand.
    await ingest(
      "acme",
      "Acme",
      "estrategia_research",
      "diagnostico_9fuentes",
      "Acme Diag",
      "Diagnostico acme.",
    );
    await ingest(
      "acme",
      "Acme",
      "estrategia_research",
      "inteligencia_social",
      "Acme Social",
      "Social acme.",
    );
    const r = radiografiaForBrand("acme", "gerente");
    expect(r.dimensiones.map((d) => d.cuerpo)).toEqual([
      "diagnostico_9fuentes",
      "inteligencia_social",
    ]);
    expect(r.faltantes.sort()).toEqual(
      ["buyer_personas", "campanas_temporalidades"].sort(),
    );
  });

  it("reassembles the full body from chunks in order", async () => {
    const body = "PRIMERA_PARTE " + "relleno ".repeat(400) + " ULTIMA_PARTE";
    await ingest(
      "acme",
      "Acme",
      "comercial_kam",
      "diagnostico_9fuentes",
      "Acme Diag",
      body,
    );
    const r = radiografiaForBrand("acme", "gerente");
    const diag = r.dimensiones.find(
      (d) => d.cuerpo === "diagnostico_9fuentes",
    )!;
    expect(diag.contenido).toContain("PRIMERA_PARTE");
    expect(diag.contenido).toContain("ULTIMA_PARTE");
    expect(diag.contenido.indexOf("PRIMERA_PARTE")).toBeLessThan(
      diag.contenido.indexOf("ULTIMA_PARTE"),
    );
  });

  it("firewall: never pulls another brand's cuerpos", async () => {
    await seedFullBrand("coca-cola", "Coca Cola");
    await seedFullBrand("pepsi", "Pepsi");
    const r = radiografiaForBrand("coca-cola", "gerente");
    const titulos = r.dimensiones.map((d) => d.titulo);
    expect(titulos.every((t) => t.startsWith("Coca Cola"))).toBe(true);
    expect(titulos.some((t) => t.startsWith("Pepsi"))).toBe(false);
  });

  it("RBAC: a cuerpo above the role's clearance is faltante, not leaked", async () => {
    await ingest(
      "coca-cola",
      "Coca Cola",
      "estrategia_research",
      "diagnostico_9fuentes",
      "Coca Diag",
      "Diag.",
    );
    await ingest(
      "coca-cola",
      "Coca Cola",
      "estrategia_research",
      "buyer_personas",
      "Coca Buyer",
      "Buyer.",
    );
    await ingest(
      "coca-cola",
      "Coca Cola",
      "comercial_kam",
      "campanas_temporalidades",
      "Coca Camp",
      "Camp.",
    );
    // direccion_clevel is above a Gerente's restringido_senior ceiling.
    await ingest(
      "coca-cola",
      "Coca Cola",
      "direccion_clevel",
      "inteligencia_social",
      "Coca Social CLEVEL",
      "Social sensible.",
    );

    const r = radiografiaForBrand("coca-cola", "gerente");
    expect(r.faltantes).toEqual(["inteligencia_social"]);
    expect(r.dimensiones.some((d) => d.titulo === "Coca Social CLEVEL")).toBe(
      false,
    );
  });

  it("fails closed on a blank brand", () => {
    const r = radiografiaForBrand("  ", "gerente");
    expect(r.dimensiones).toEqual([]);
    expect(r.faltantes).toEqual([...RADIOGRAFIA_CUERPOS]);
  });
});

describe("armar_radiografia_marca tool", () => {
  it("returns the dimensiones for a resolved brand", async () => {
    await seedFullBrand("coca-cola-refrescos-cola", "Coca Cola");
    const out = JSON.parse(
      await armar_radiografia_marca({ marca: "Coca Cola" }, ctx("gerente")),
    );
    expect(out.encontrada).toBe(true);
    expect(out.brand_key).toBe("coca-cola-refrescos-cola");
    expect(out.dimensiones.map((d: any) => d.cuerpo)).toEqual([
      ...RADIOGRAFIA_CUERPOS,
    ]);
    expect(out.faltantes).toEqual([]);
  });

  it("returns opciones for an ambiguous brand (no guess)", async () => {
    await ingest(
      "bonafont-agua-natural",
      "Bonafont Agua Natural",
      "comercial_kam",
      "diagnostico_9fuentes",
      "BAN Diag",
      "Diag.",
    );
    await ingest(
      "bonafont-aguas-frescas",
      "Bonafont Aguas Frescas",
      "comercial_kam",
      "diagnostico_9fuentes",
      "BAF Diag",
      "Diag.",
    );
    const out = JSON.parse(
      await armar_radiografia_marca({ marca: "bonafont" }, ctx("director")),
    );
    expect(out.ambigua).toBe(true);
    expect(out.opciones.map((o: any) => o.brand_key).sort()).toEqual([
      "bonafont-agua-natural",
      "bonafont-aguas-frescas",
    ]);
  });

  it("returns encontrada:false for an unknown brand", async () => {
    const out = JSON.parse(
      await armar_radiografia_marca(
        { marca: "Marca Inexistente XYZ" },
        ctx("gerente"),
      ),
    );
    expect(out.encontrada).toBe(false);
    expect(out.dimensiones).toEqual([]);
  });

  it("surfaces faltantes in the mensaje for a partial radiografía", async () => {
    await ingest(
      "acme-brand",
      "Acme",
      "comercial_kam",
      "diagnostico_9fuentes",
      "Acme Diag",
      "Diag.",
    );
    const out = JSON.parse(
      await armar_radiografia_marca({ marca: "Acme" }, ctx("gerente")),
    );
    expect(out.encontrada).toBe(true);
    expect(out.faltantes).toContain("buyer_personas");
    expect(out.mensaje).toMatch(/faltan/i);
  });

  it("validates the marca param", async () => {
    expect(
      JSON.parse(await armar_radiografia_marca({}, ctx("gerente"))).error,
    ).toBeTruthy();
  });
});
