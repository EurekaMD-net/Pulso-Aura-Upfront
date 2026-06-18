/**
 * Brand resolution tests — free-text marca -> brand_key (folder slug), with disambiguation.
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";
import { normalizeMarca } from "../src/aura-rbac.js";

let testDb: InstanceType<typeof Database>;
vi.mock("../src/db.js", () => ({ getDatabase: () => testDb }));

const { resolveBrandKey, slugifyBrand } = await import("../src/aura-brand.js");

let seq = 0;
function doc(brandKey: string, marca: string) {
  testDb
    .prepare(
      `INSERT INTO crm_documents
         (id, source, source_id, titulo, marca, marca_norm, brand_key, rol_minimo, aislado_por_cliente)
       VALUES (?, 'aura-kb', ?, ?, ?, ?, ?, 'comercial_kam', 1)`,
    )
    .run(
      `d${seq}`,
      `s${seq}`,
      `${marca} finding`,
      marca,
      normalizeMarca(marca),
      brandKey,
    );
  seq++;
}

function setupDb() {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);
  // One brand, consistent marca:
  doc("coca-cola-refrescos-cola", "Coca Cola");
  doc("coca-cola-refrescos-cola", "Coca Cola");
  // Three sibling brand folders that all share the "bonafont" prefix, inconsistent marcas:
  doc("bonafont-agua-natural", "Bonafont Agua Natural");
  doc("bonafont-aguas-frescas", "Bonafont Aguas Frescas");
  doc("bonafont-levite", "Bonafont Levite");
  doc("bonafont-levite", "Lievité"); // typo + accent, same folder
}
beforeEach(setupDb);

describe("slugifyBrand", () => {
  it("lowercases, strips accents, hyphenates", () => {
    expect(slugifyBrand("Coca Cola")).toBe("coca-cola");
    expect(slugifyBrand("Bonafont Agua Natural")).toBe("bonafont-agua-natural");
    expect(slugifyBrand("Ensueño")).toBe("ensueno");
    expect(slugifyBrand("  A.B/C  ")).toBe("a-b-c");
  });
});

describe("resolveBrandKey", () => {
  it("resolves an exact marca to its brand_key (case/accent-insensitive)", () => {
    expect(resolveBrandKey("Coca Cola").brandKey).toBe(
      "coca-cola-refrescos-cola",
    );
    expect(resolveBrandKey("COCA COLA").brandKey).toBe(
      "coca-cola-refrescos-cola",
    );
  });

  it("resolves a variant/typo marca to the right brand_key via the folder", () => {
    // 'Lievité' is a typo tagged on the bonafont-levite folder — still resolves there.
    expect(resolveBrandKey("Lievité").brandKey).toBe("bonafont-levite");
  });

  it("returns candidates (no single key) for an ambiguous prefix", () => {
    const r = resolveBrandKey("bonafont");
    expect(r.brandKey).toBeNull();
    expect(r.candidates.map((c) => c.brandKey).sort()).toEqual([
      "bonafont-agua-natural",
      "bonafont-aguas-frescas",
      "bonafont-levite",
    ]);
  });

  it("resolves a brand_key passed verbatim to itself", () => {
    expect(resolveBrandKey("coca-cola-refrescos-cola").brandKey).toBe(
      "coca-cola-refrescos-cola",
    );
  });

  it("returns empty for unknown brand and blank input", () => {
    expect(resolveBrandKey("Marca Inexistente XYZ").candidates).toEqual([]);
    expect(resolveBrandKey("  ").brandKey).toBeNull();
  });

  it("candidate carries a representative marca + finding count", () => {
    const c = resolveBrandKey("Coca Cola").candidates[0];
    expect(c.brandKey).toBe("coca-cola-refrescos-cola");
    expect(c.findings).toBe(2);
    expect(c.marca).toBeTruthy();
  });
});
