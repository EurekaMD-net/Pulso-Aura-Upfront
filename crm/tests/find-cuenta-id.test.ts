/**
 * findCuentaId name-variant resolution (helpers.ts) — the same advertiser-name /
 * hyphen / token-superset class that d2c0d71 fixed for cierre, swept into the
 * general account resolver. Regression for the 2026-06-20 "knows nothing about
 * Bayer/Nissan/Procter" report: the account exists, but the advertiser spelling
 * the agent passed ("Bayer de México") is a SUPERSET of the cartera name ("BAYER")
 * and a one-directional LIKE missed it.
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

const { findCuentaId } = await import("../src/tools/helpers.js");

function cuenta(
  id: string,
  nombre: string,
  anuncianteNorm: string | null = null,
): void {
  testDb
    .prepare(
      "INSERT INTO cuenta (id, nombre, tipo, anunciante_norm, estado) VALUES (?, ?, 'directo', ?, 'activo')",
    )
    .run(id, nombre, anuncianteNorm);
}

function anuncianteMarca(
  brandKey: string,
  marca: string,
  anunciante: string,
  anuncianteNorm: string,
): void {
  testDb
    .prepare(
      "INSERT INTO anunciante_marca (brand_key, marca, anunciante, anunciante_norm) VALUES (?, ?, ?, ?)",
    )
    .run(brandKey, marca, anunciante, anuncianteNorm);
}

beforeEach(() => {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  createCrmSchema(testDb);
  cuenta("cta-bayer", "BAYER", "bayer");
  cuenta("cta-nissan", "NISSAN");
  cuenta("cta-procter", "PROCTER & GAMBLE");
  cuenta("cta-coca", "COCA COLA");
  cuenta("cta-amazon", "AMAZON");
  cuenta("cta-amazon-orion", "AMAZON ORION");
  // Advertiser-bridge fixture: account name shares NO token with the advertiser
  // query, so only the anunciante_norm path (step 3) can resolve it.
  cuenta("cta-lala-mx", "OPERADORA LALA", "grupo lala");
  anuncianteMarca("leche-x", "Leche X", "GRUPO LALA", "grupo lala");
});

describe("findCuentaId — exact / substring (unchanged behavior)", () => {
  it("resolves an exact name", () => {
    expect(findCuentaId("BAYER")).toBe("cta-bayer");
  });
  it("resolves case-insensitively", () => {
    expect(findCuentaId("nissan")).toBe("cta-nissan");
  });
  it("resolves when the query is contained in the stored name", () => {
    expect(findCuentaId("Procter")).toBe("cta-procter");
  });
});

describe("findCuentaId — name-variant fallbacks (the fix)", () => {
  it("resolves advertiser spelling that is a SUPERSET of the account name", () => {
    // The exact 2026-06-20 failure: "Bayer de México" -> "BAYER".
    expect(findCuentaId("Bayer de México")).toBe("cta-bayer");
  });
  it("resolves hyphen/space punctuation variants (loose-exact)", () => {
    expect(findCuentaId("Coca-Cola")).toBe("cta-coca");
  });
  it("resolves via the advertiser bridge (anunciante_norm) when no name token matches", () => {
    // "Grupo Lala" shares no token with "OPERADORA LALA"; only step 3 resolves it.
    expect(findCuentaId("Grupo Lala")).toBe("cta-lala-mx");
  });
  it("resolves a multi-word account from a superset query", () => {
    expect(findCuentaId("Procter & Gamble de México")).toBe("cta-procter");
  });

  it("resolves a single-token brand even when a longer sibling brand exists", () => {
    // Brand-family recall: AMAZON and AMAZON ORION coexist. A query that does NOT
    // name the sibling's distinguishing token ("orion") resolves to the master
    // account — AMAZON ORION can't match step 4 because "orion" isn't in the query.
    expect(findCuentaId("Amazon México 2027")).toBe("cta-amazon");
  });
});

describe("findCuentaId — no-guess safety", () => {
  it("returns null for a genuinely unknown name", () => {
    expect(findCuentaId("Marca Inexistente XYZ")).toBeNull();
  });
  it("returns null (ambiguous) when a superset query matches >1 account", () => {
    // "AMAZON ORION ..." is a superset of BOTH "AMAZON" and "AMAZON ORION".
    expect(findCuentaId("Amazon Orion campaña 2027")).toBeNull();
  });
  it("does not over-match an unrelated single token", () => {
    expect(findCuentaId("Pepsi")).toBeNull();
  });
});
