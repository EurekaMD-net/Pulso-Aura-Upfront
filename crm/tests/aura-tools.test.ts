/**
 * buscar_inteligencia_marca tool — resolves a free-text brand, calls searchAuraKb under the
 * caller's role, and returns findings or disambiguation options.
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";
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
const { buscar_inteligencia_marca } = await import("../src/tools/aura.js");

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

function ingest(
  brandKey: string,
  marca: string,
  rol: string,
  titulo: string,
  body: string,
) {
  return storeDocument(
    null,
    "aura-kb",
    `${brandKey}::${titulo}`,
    titulo,
    "aura-finding",
    `${titulo}\n\n${body}`,
    {
      marca,
      brandKey,
      rolMinimo: rol,
      sensibilidad: "baja",
      aisladoPorCliente: true,
      cuerpo: "diagnostico_9fuentes",
      estabilidad: "estable",
      tier: null,
    },
  );
}

describe("buscar_inteligencia_marca", () => {
  beforeEach(async () => {
    await ingest(
      "coca-cola-refrescos-cola",
      "Coca Cola",
      "comercial_kam",
      "Coca Diag",
      "Diagnostico de Coca Cola television abierta campana refrescos.",
    );
    await ingest(
      "coca-cola-refrescos-cola",
      "Coca Cola",
      "restringido_senior",
      "Coca Dark",
      "Sala invisible comite negociacion estrategia de cierre Coca Cola.",
    );
    await ingest(
      "bonafont-agua-natural",
      "Bonafont Agua Natural",
      "comercial_kam",
      "BAN Diag",
      "Diagnostico bonafont agua natural campana refrescos.",
    );
    await ingest(
      "bonafont-aguas-frescas",
      "Bonafont Aguas Frescas",
      "comercial_kam",
      "BAF Diag",
      "Diagnostico bonafont aguas frescas campana refrescos.",
    );
  });

  it("returns findings for a resolved brand", async () => {
    const out = JSON.parse(
      await buscar_inteligencia_marca(
        { marca: "Coca Cola", consulta: "campana refrescos" },
        ctx("gerente"),
      ),
    );
    expect(out.encontrada).toBe(true);
    expect(out.brand_key).toBe("coca-cola-refrescos-cola");
    expect(out.resultados.length).toBeGreaterThan(0);
    expect(out.resultados.every((r: any) => r.titulo && r.cuerpo)).toBe(true);
  });

  it("returns opciones for an ambiguous brand (no guess)", async () => {
    const out = JSON.parse(
      await buscar_inteligencia_marca(
        { marca: "bonafont", consulta: "campana" },
        ctx("gerente"),
      ),
    );
    expect(out.ambigua).toBe(true);
    expect(out.opciones.map((o: any) => o.brand_key).sort()).toEqual([
      "bonafont-agua-natural",
      "bonafont-aguas-frescas",
    ]);
  });

  it("returns encontrada:false for an unknown brand", async () => {
    const out = JSON.parse(
      await buscar_inteligencia_marca(
        { marca: "Marca Inexistente XYZ", consulta: "x" },
        ctx("gerente"),
      ),
    );
    expect(out.encontrada).toBe(false);
    expect(out.resultados).toEqual([]);
  });

  it("respects RBAC — gerente sees restringido_senior closing material", async () => {
    const out = JSON.parse(
      await buscar_inteligencia_marca(
        { marca: "Coca Cola", consulta: "sala invisible comite negociacion" },
        ctx("gerente"),
      ),
    );
    expect(out.resultados.some((r: any) => r.titulo === "Coca Dark")).toBe(
      true,
    );
  });

  it("validates required params", async () => {
    expect(
      JSON.parse(
        await buscar_inteligencia_marca({ consulta: "x" }, ctx("gerente")),
      ).error,
    ).toBeTruthy();
    expect(
      JSON.parse(
        await buscar_inteligencia_marca({ marca: "Coca Cola" }, ctx("gerente")),
      ).error,
    ).toBeTruthy();
  });
});
