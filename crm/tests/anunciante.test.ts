/**
 * Anunciante portfolio layer (P3.5) — the bridge between Aura per-brand intelligence and the
 * deal entity. Exercises resolution, the portfolio rollup (firewall/RBAC inherited per brand),
 * the committee from real CRM contacto, the ingester, and both tools.
 */

import Database from "better-sqlite3";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import * as sqliteVec from "sqlite-vec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";
import { normalizeMarca } from "../src/aura-rbac.js";
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

const { storeDocument } = await import("../src/doc-sync.js");
const {
  resolveAnunciante,
  marcasForAnunciante,
  radiografiaForAnunciante,
  committeeForAnunciante,
} = await import("../src/anunciante.js");
const { syncAnuncianteMap } = await import("../src/anunciante-sync.js");
const { armar_radiografia_anunciante, mapa_poder_anunciante } =
  await import("../src/tools/aura.js");

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

function seedAnun(
  brand_key: string,
  marca: string,
  anunciante: string,
  grupo: string | null = null,
) {
  testDb
    .prepare(
      `INSERT INTO anunciante_marca (brand_key, marca, anunciante, anunciante_norm, grupo, grupo_norm, confianza, basis)
       VALUES (?,?,?,?,?,?,?,?)`,
    )
    .run(
      brand_key,
      marca,
      anunciante,
      normalizeMarca(anunciante),
      grupo,
      grupo ? normalizeMarca(grupo) : null,
      "alta",
      "finding",
    );
}

function gov(brandKey: string, rol: string, cuerpo: string): AuraGovernance {
  return {
    marca: brandKey,
    brandKey,
    rolMinimo: rol,
    sensibilidad: "baja",
    aisladoPorCliente: true,
    cuerpo,
    estabilidad: "estable",
    tier: null,
  };
}
async function ingestCuerpo(
  brandKey: string,
  rol: string,
  cuerpo: string,
  body: string,
) {
  await storeDocument(
    null,
    "aura-kb",
    `${brandKey}::${cuerpo}`,
    `${brandKey} ${cuerpo}`,
    "aura-finding",
    `${brandKey}\n\n${body}`,
    gov(brandKey, rol, cuerpo),
  );
}

describe("resolveAnunciante", () => {
  beforeEach(() => {
    seedAnun("ariel", "Ariel", "Procter & Gamble México", "Procter & Gamble");
    seedAnun(
      "pampers",
      "Pampers",
      "Procter & Gamble México",
      "Procter & Gamble",
    );
    seedAnun("bonafont", "Bonafont", "Danone México", "Danone");
  });

  it("resolves an exact anunciante to a single match", () => {
    const r = resolveAnunciante("Procter & Gamble México");
    expect(r.anunciante).toBe("Procter & Gamble México");
    expect(r.candidates).toHaveLength(1);
  });

  it("resolves accent/case-insensitively (P&G has 2 brands, still one anunciante)", () => {
    const r = resolveAnunciante("procter & gamble mexico");
    expect(r.anunciante).toBe("Procter & Gamble México");
    expect(r.candidates[0].marcas).toBe(2);
  });

  it("resolves by grupo (holding)", () => {
    const r = resolveAnunciante("Danone");
    expect(r.anunciante).toBe("Danone México");
  });

  it("returns candidates (no guess) when the input matches >1 anunciante", () => {
    seedAnun("danette", "Danette", "Danone Internacional", "Danone");
    const r = resolveAnunciante("Danone"); // grupo matches 2 anunciantes
    expect(r.anunciante).toBeNull();
    expect(r.candidates.length).toBeGreaterThan(1);
  });

  it("returns empty for an unknown anunciante", () => {
    const r = resolveAnunciante("Marca Inexistente XYZ");
    expect(r.anunciante).toBeNull();
    expect(r.candidates).toEqual([]);
  });

  it("marcasForAnunciante lists the portfolio", () => {
    const marcas = marcasForAnunciante(
      normalizeMarca("Procter & Gamble México"),
    );
    expect(marcas.map((m) => m.brand_key).sort()).toEqual(["ariel", "pampers"]);
  });
});

describe("radiografiaForAnunciante — portfolio rollup", () => {
  it("rolls up per-brand availability + resumen across the portfolio", async () => {
    seedAnun("ariel", "Ariel", "P&G México");
    seedAnun("pampers", "Pampers", "P&G México");
    await ingestCuerpo(
      "ariel",
      "comercial_kam",
      "diagnostico_9fuentes",
      "Diagnostico Ariel detergente.",
    );
    await ingestCuerpo(
      "ariel",
      "estrategia_research",
      "buyer_personas",
      "Buyer Ariel.",
    );
    await ingestCuerpo(
      "pampers",
      "comercial_kam",
      "diagnostico_9fuentes",
      "Diagnostico Pampers panales.",
    );

    const port = radiografiaForAnunciante("P&G México", "gerente")!;
    expect(port.anunciante).toBe("P&G México");
    expect(port.marcas).toHaveLength(2);
    const ariel = port.marcas.find((m) => m.brand_key === "ariel")!;
    expect(ariel.cuerpos_disponibles.sort()).toEqual(
      ["buyer_personas", "diagnostico_9fuentes"].sort(),
    );
    expect(ariel.faltantes).toContain("campanas_temporalidades");
    expect(ariel.resumen).toContain("Diagnostico Ariel");
    expect(port.totales).toEqual({
      marcas: 2,
      con_diagnostico: 2,
      sin_inteligencia: 0,
    });
  });

  it("RBAC: a cuerpo above the role's clearance is not available in the rollup", async () => {
    seedAnun("secret-brand", "Secret", "P&G México");
    await ingestCuerpo(
      "secret-brand",
      "direccion_clevel",
      "diagnostico_9fuentes",
      "Sensible clevel.",
    );
    const port = radiografiaForAnunciante("P&G México", "gerente")!;
    const m = port.marcas.find((x) => x.brand_key === "secret-brand")!;
    expect(m.cuerpos_disponibles).toEqual([]);
    expect(m.faltantes).toContain("diagnostico_9fuentes");
    expect(m.resumen).toBe("");
  });

  it("isolates to the anunciante's own brands (no cross-advertiser bleed)", async () => {
    seedAnun("ariel", "Ariel", "P&G México");
    seedAnun("bonafont", "Bonafont", "Danone México");
    await ingestCuerpo(
      "ariel",
      "comercial_kam",
      "diagnostico_9fuentes",
      "Diag Ariel.",
    );
    await ingestCuerpo(
      "bonafont",
      "comercial_kam",
      "diagnostico_9fuentes",
      "Diag Bonafont.",
    );
    const port = radiografiaForAnunciante("P&G México", "gerente")!;
    expect(port.marcas.map((m) => m.brand_key)).toEqual(["ariel"]);
  });

  it("returns null for an unresolved anunciante (tool surfaces options)", () => {
    expect(radiografiaForAnunciante("Nadie", "gerente")).toBeNull();
  });
});

describe("committeeForAnunciante — real CRM committee", () => {
  function seedCuentaComite() {
    testDb
      .prepare(
        `INSERT INTO cuenta (id, nombre, tipo, anunciante, anunciante_norm) VALUES (?,?,?,?,?)`,
      )
      .run(
        "c1",
        "P&G Directo",
        "directo",
        "P&G México",
        normalizeMarca("P&G México"),
      );
    testDb
      .prepare(
        `INSERT INTO contacto (id, nombre, cuenta_id, rol, seniority, titulo) VALUES (?,?,?,?,?,?)`,
      )
      .run("k1", "María CMO", "c1", "decisor", "director", "CMO");
    testDb
      .prepare(
        `INSERT INTO contacto (id, nombre, cuenta_id, rol, seniority, titulo) VALUES (?,?,?,?,?,?)`,
      )
      .run(
        "k2",
        "Jorge Compras",
        "c1",
        "comprador",
        "senior",
        "Head of Procurement",
      );
  }

  it("maps the anunciante to its cuenta(s) + contactos", () => {
    seedAnun("ariel", "Ariel", "P&G México");
    seedCuentaComite();
    const comite = committeeForAnunciante("P&G México")!;
    expect(comite.sin_comite).toBe(false);
    expect(comite.cuentas).toHaveLength(1);
    expect(comite.cuentas[0].contactos.map((c) => c.nombre).sort()).toEqual([
      "Jorge Compras",
      "María CMO",
    ]);
  });

  it("sin_comite=true when the anunciante has no cuenta/contacto on file", () => {
    seedAnun("ariel", "Ariel", "P&G México");
    const comite = committeeForAnunciante("P&G México")!;
    expect(comite.sin_comite).toBe(true);
    expect(comite.cuentas).toEqual([]);
  });
});

describe("tools — armar_radiografia_anunciante / mapa_poder_anunciante", () => {
  it("armar_radiografia_anunciante returns the portfolio", async () => {
    seedAnun("ariel", "Ariel", "P&G México");
    seedAnun("pampers", "Pampers", "P&G México");
    await ingestCuerpo(
      "ariel",
      "comercial_kam",
      "diagnostico_9fuentes",
      "Diag Ariel.",
    );
    const out = JSON.parse(
      await armar_radiografia_anunciante(
        { anunciante: "P&G México" },
        ctx("gerente"),
      ),
    );
    expect(out.encontrada).toBe(true);
    expect(out.totales.marcas).toBe(2);
    expect(out.marcas.map((m: any) => m.brand_key).sort()).toEqual([
      "ariel",
      "pampers",
    ]);
  });

  it("armar_radiografia_anunciante returns opciones when ambiguous", async () => {
    seedAnun("a1", "A1", "Grupo X Bebidas", "Grupo X");
    seedAnun("a2", "A2", "Grupo X Alimentos", "Grupo X");
    const out = JSON.parse(
      await armar_radiografia_anunciante(
        { anunciante: "Grupo X" },
        ctx("director"),
      ),
    );
    expect(out.ambigua).toBe(true);
    expect(out.opciones.length).toBe(2);
  });

  it("armar_radiografia_anunciante returns encontrada:false for unknown", async () => {
    const out = JSON.parse(
      await armar_radiografia_anunciante(
        { anunciante: "Nadie SA" },
        ctx("gerente"),
      ),
    );
    expect(out.encontrada).toBe(false);
  });

  it("mapa_poder_anunciante returns the committee, with the never-to-client reminder", () => {
    seedAnun("ariel", "Ariel", "P&G México");
    testDb
      .prepare(
        `INSERT INTO cuenta (id, nombre, tipo, anunciante, anunciante_norm) VALUES (?,?,?,?,?)`,
      )
      .run("c1", "P&G", "directo", "P&G México", normalizeMarca("P&G México"));
    testDb
      .prepare(
        `INSERT INTO contacto (id, nombre, cuenta_id, rol) VALUES (?,?,?,?)`,
      )
      .run("k1", "María", "c1", "decisor");
    return mapa_poder_anunciante(
      { anunciante: "P&G México" },
      ctx("director"),
    ).then((raw) => {
      const out = JSON.parse(raw);
      expect(out.sin_comite).toBe(false);
      expect(out.cuentas[0].contactos[0].nombre).toBe("María");
      expect(out.mensaje).toMatch(/jamás al cliente/i);
    });
  });

  it("mapa_poder_anunciante: sin_comite coaches from method", () => {
    seedAnun("ariel", "Ariel", "P&G México");
    return mapa_poder_anunciante(
      { anunciante: "P&G México" },
      ctx("gerente"),
    ).then((raw) => {
      const out = JSON.parse(raw);
      expect(out.sin_comite).toBe(true);
      expect(out.mensaje).toMatch(/método|pregunta al vendedor/i);
    });
  });
});

describe("syncAnuncianteMap — ingester", () => {
  it("ingests a map file into anunciante_marca (idempotent upsert)", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "anun-"));
    fs.mkdirSync(path.join(dir, "anunciantes"));
    const map = {
      brands: [
        {
          brand_key: "ariel",
          marca: "Ariel",
          anunciante: "P&G México",
          anunciante_norm: "p&g mexico",
          grupo: "P&G",
          grupo_norm: "p&g",
          confidence: "alta",
          basis: "finding",
        },
      ],
    };
    fs.writeFileSync(
      path.join(dir, "anunciantes", "brand-anunciante-map.json"),
      JSON.stringify(map),
    );
    const r1 = syncAnuncianteMap(dir);
    expect(r1.upserted).toBe(1);
    const row = testDb
      .prepare(
        "SELECT anunciante, confianza FROM anunciante_marca WHERE brand_key='ariel'",
      )
      .get() as { anunciante: string; confianza: string };
    expect(row.anunciante).toBe("P&G México");
    expect(row.confianza).toBe("alta");
    // re-run = upsert, no duplicate
    syncAnuncianteMap(dir);
    const count = testDb
      .prepare("SELECT COUNT(*) AS n FROM anunciante_marca")
      .get() as { n: number };
    expect(count.n).toBe(1);
  });
});
