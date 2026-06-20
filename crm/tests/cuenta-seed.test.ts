/**
 * Bulk account (cuenta) seeding — companion to register.ts (persona seeding).
 * Exercises org-chain derivation from the AE, advertiser linking (incl. the
 * never-guess ambiguous case + explicit override), idempotency, and CSV parsing.
 */
import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";

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

const { seedCuentas, parseCuentaCsv } = await import("../src/cuenta-seed.js");

function persona(
  id: string,
  nombre: string,
  rol: string,
  reporta_a: string | null,
): void {
  testDb
    .prepare(
      "INSERT INTO persona (id, nombre, rol, reporta_a, activo) VALUES (?, ?, ?, ?, 1)",
    )
    .run(id, nombre, rol, reporta_a);
}
function anunciante(brand_key: string, name: string, norm: string): void {
  testDb
    .prepare(
      "INSERT INTO anunciante_marca (brand_key, marca, anunciante, anunciante_norm, grupo, grupo_norm, confianza, basis) VALUES (?, ?, ?, ?, ?, ?, 'alta', 'finding')",
    )
    .run(brand_key, "Marca", name, norm, "Grupo", "grupo");
}
function cuentaRow(nombre: string): Record<string, unknown> {
  return testDb
    .prepare(
      "SELECT ae_id, gerente_id, director_id, anunciante_norm, estado, creado_por, años_relacion FROM cuenta WHERE nombre = ?",
    )
    .get(nombre) as Record<string, unknown>;
}

beforeEach(() => {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  createCrmSchema(testDb);
  // org chart: Diana (director) <- Gabriel (gerente) <- José (ae)
  persona("dir1", "Diana Director", "director", null);
  persona("ger1", "Gabriel Gerente", "gerente", "dir1");
  persona("ae1", "José Pérez", "ae", "ger1");
  anunciante("pg-ace", "Procter & Gamble México", "procter & gamble mexico");
});

describe("seedCuentas", () => {
  it("inserts an account, derives the full org chain from the AE, links the advertiser", () => {
    const r = seedCuentas([
      {
        nombre: "Procter & Gamble México",
        tipo: "directo",
        ae_name: "José Pérez",
        anos_relacion: 8,
      },
    ]);
    expect(r.inserted).toBe(1);
    expect(r.linked).toBe(1);
    const row = cuentaRow("Procter & Gamble México");
    expect(row.ae_id).toBe("ae1");
    expect(row.gerente_id).toBe("ger1");
    expect(row.director_id).toBe("dir1");
    expect(row.anunciante_norm).toBe("procter & gamble mexico");
    expect(row.estado).toBe("activo");
    expect(row.creado_por).toBe("seed");
    expect(row.años_relacion).toBe(8);
  });

  it("matches the AE name accent- and case-insensitively", () => {
    const r = seedCuentas([
      { nombre: "Cuenta A", tipo: "directo", ae_name: "jose perez" },
    ]);
    expect(r.aeUnresolved).toHaveLength(0);
    expect(cuentaRow("Cuenta A").ae_id).toBe("ae1");
  });

  it("is idempotent — a second run skips the existing account", () => {
    const rows = [
      {
        nombre: "Procter & Gamble México",
        tipo: "directo" as const,
        ae_name: "José Pérez",
      },
    ];
    seedCuentas(rows);
    const r2 = seedCuentas(rows);
    expect(r2.inserted).toBe(0);
    expect(r2.skippedExisting).toBe(1);
    expect(
      (
        testDb.prepare("SELECT count(*) AS c FROM cuenta").get() as {
          c: number;
        }
      ).c,
    ).toBe(1);
  });

  it("reports an unresolved AE but still inserts the account with null ownership", () => {
    const r = seedCuentas([
      { nombre: "Huérfana", tipo: "directo", ae_name: "Nadie Existe" },
    ]);
    expect(r.inserted).toBe(1);
    expect(r.aeUnresolved).toHaveLength(1);
    expect(cuentaRow("Huérfana").ae_id).toBeNull();
  });

  it("never guesses an ambiguous advertiser — leaves it unlinked and reports it", () => {
    anunciante(
      "pg-ca",
      "Procter & Gamble Centroamérica",
      "procter & gamble centroamerica",
    );
    const r = seedCuentas([
      { nombre: "Procter", tipo: "directo", ae_name: "José Pérez" },
    ]);
    expect(r.linked).toBe(0);
    expect(r.ambiguousLink).toHaveLength(1);
    expect(cuentaRow("Procter").anunciante_norm).toBeNull();
  });

  it("honors an explicit anunciante override when the account name doesn't match", () => {
    const r = seedCuentas([
      {
        nombre: "Cuenta Interna 42",
        tipo: "agencia",
        ae_name: "José Pérez",
        anunciante: "Procter & Gamble México",
      },
    ]);
    expect(r.linked).toBe(1);
    expect(cuentaRow("Cuenta Interna 42").anunciante_norm).toBe(
      "procter & gamble mexico",
    );
  });

  it("reports an unmatched advertiser (0 candidates) without inventing one", () => {
    const r = seedCuentas([
      {
        nombre: "Marca Inexistente XYZ",
        tipo: "directo",
        ae_name: "José Pérez",
      },
    ]);
    expect(r.linked).toBe(0);
    expect(r.unmatchedLink).toEqual(["Marca Inexistente XYZ"]);
    expect(r.inserted).toBe(1);
  });

  it("surfaces a slug collision (distinct names → same id) instead of silently dropping", () => {
    const r = seedCuentas([
      { nombre: "Café Olé", tipo: "directo", ae_name: "José Pérez" },
      { nombre: "Cafe, Ole!", tipo: "directo", ae_name: "José Pérez" },
    ]);
    expect(r.inserted).toBe(1);
    expect(r.slugCollision).toHaveLength(1);
    expect(r.slugCollision[0]).toContain("cta-cafe-ole");
    expect(
      (
        testDb.prepare("SELECT count(*) AS c FROM cuenta").get() as {
          c: number;
        }
      ).c,
    ).toBe(1);
  });
});

describe("parseCuentaCsv", () => {
  it("parses a header + quoted fields with commas", () => {
    const rows = parseCuentaCsv(
      'nombre,tipo,ae_name,anunciante\n"Acme, Inc",directo,José Pérez,Procter & Gamble México',
    );
    expect(rows[0]).toMatchObject({
      nombre: "Acme, Inc",
      tipo: "directo",
      ae_name: "José Pérez",
      anunciante: "Procter & Gamble México",
    });
  });

  it("rejects an invalid tipo", () => {
    expect(() =>
      parseCuentaCsv("nombre,tipo,ae_name\nX,foo,José Pérez"),
    ).toThrow(/tipo/);
  });
});
