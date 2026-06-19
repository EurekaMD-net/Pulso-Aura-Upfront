/**
 * Snowflake anunciante reconciliation (P4) — matching OUR advertiser to theirs.
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";
import { normalizeMarca } from "../src/aura-rbac.js";

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

const {
  reconcileAnunciantes,
  snowflakeKeyForAnunciante,
  upsertSnowflakeMapping,
} = await import("../src/snowflake/anunciante-reconcile.js");

function seedAnun(brand_key: string, marca: string, anunciante: string) {
  testDb
    .prepare(
      `INSERT INTO anunciante_marca (brand_key, marca, anunciante, anunciante_norm, confianza, basis)
       VALUES (?,?,?,?,'alta','finding')`,
    )
    .run(brand_key, marca, anunciante, normalizeMarca(anunciante));
}

beforeEach(() => {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);
  seedAnun("ariel", "Ariel", "Procter & Gamble México");
  seedAnun("bonafont", "Bonafont", "Danone México");
});

describe("reconcileAnunciantes", () => {
  it("auto-maps exact normalized-name matches, reports the rest", () => {
    const res = reconcileAnunciantes([
      { id: "SF-1", nombre: "Procter & Gamble México" }, // exact-norm → mapped
      { id: "SF-2", nombre: "Empresa Sin Match SA" }, // → unmatched
    ]);
    expect(res.mapped).toBe(1);
    expect(res.unmatched).toBe(1);
    expect(res.ambiguous).toBe(0);
    expect(res.unmatchedNombres).toEqual(["Empresa Sin Match SA"]);
  });

  it("matches accent/case-insensitively (normalizeMarca on both sides)", () => {
    const res = reconcileAnunciantes([
      { id: "SF-9", nombre: "procter & gamble mexico" },
    ]);
    expect(res.mapped).toBe(1);
    const key = snowflakeKeyForAnunciante(
      normalizeMarca("Procter & Gamble México"),
    );
    expect(key?.sfId).toBe("SF-9");
  });

  it("snowflakeKeyForAnunciante returns null for an unreconciled advertiser", () => {
    expect(
      snowflakeKeyForAnunciante(normalizeMarca("Danone México")),
    ).toBeNull();
  });

  it("is idempotent and refreshes the SF id on re-run", () => {
    reconcileAnunciantes([{ id: "SF-1", nombre: "Procter & Gamble México" }]);
    reconcileAnunciantes([{ id: "SF-1b", nombre: "Procter & Gamble México" }]);
    const key = snowflakeKeyForAnunciante(
      normalizeMarca("Procter & Gamble México"),
    );
    expect(key?.sfId).toBe("SF-1b");
    const count = testDb
      .prepare(`SELECT COUNT(*) AS c FROM anunciante_snowflake_map`)
      .get() as { c: number };
    expect(count.c).toBe(1); // upsert, not duplicate
  });
});

describe("upsertSnowflakeMapping (manual override)", () => {
  it("writes a mapping that snowflakeKeyForAnunciante then resolves", () => {
    const norm = normalizeMarca("Danone México");
    upsertSnowflakeMapping({
      anuncianteNorm: norm,
      sfId: "SF-MANUAL",
      sfNombre: "DANONE SA DE CV",
      matchMethod: "manual",
      confianza: "alta",
    });
    const key = snowflakeKeyForAnunciante(norm);
    expect(key).toEqual({ sfId: "SF-MANUAL", sfNombre: "DANONE SA DE CV" });
  });
});
