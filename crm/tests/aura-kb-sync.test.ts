/**
 * Aura KB ingester tests — frontmatter parsing, governance mapping, and a real
 * walk+ingest into an in-memory DB (embeddings mocked to the deterministic local
 * fallback, same pattern as doc-sync.test.ts).
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import fs from "fs";
import os from "os";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

vi.mock("../src/embedding.js", async (importOriginal) => {
  const orig = (await importOriginal()) as any;
  return {
    ...orig,
    embedText: async (t: string) => orig.embedTextLocal(t),
    embedBatch: async (ts: string[]) => ts.map((t) => orig.embedTextLocal(t)),
  };
});

const { parseFrontmatter, governanceFrom, syncAuraKb, clearAuraKb } =
  await import("../src/aura-kb-sync.js");

function setupDb() {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);
}
beforeEach(setupDb);

// ---------------------------------------------------------------------------
// parseFrontmatter
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("parses flat key:value, quotes, and booleans", () => {
    const raw = [
      "---",
      "id: kb-brand-coca-cola-diagnostico",
      "marca: Coca Cola",
      "aislado_por_cliente: true",
      'archivo_origen: "Coca Cola.docx"',
      "rol_minimo: comercial_kam",
      "---",
      "",
      "Cuerpo del finding.",
    ].join("\n");
    const { frontmatter, body } = parseFrontmatter(raw);
    expect(frontmatter.marca).toBe("Coca Cola");
    expect(frontmatter.aislado_por_cliente).toBe(true);
    expect(frontmatter.archivo_origen).toBe("Coca Cola.docx");
    expect(frontmatter.rol_minimo).toBe("comercial_kam");
    expect(body).toBe("Cuerpo del finding.");
  });

  it("returns empty frontmatter and full body when no leading fence", () => {
    const { frontmatter, body } = parseFrontmatter("just body text");
    expect(Object.keys(frontmatter)).toHaveLength(0);
    expect(body).toBe("just body text");
  });

  it("does not swallow content when the closing fence is missing", () => {
    const raw = "---\nmarca: X\nbody with no close";
    const { body } = parseFrontmatter(raw);
    expect(body).toContain("body with no close");
  });
});

describe("governanceFrom", () => {
  it("maps frontmatter to governance, tier stays null", () => {
    const gov = governanceFrom({
      marca: "Coca Cola",
      rol_minimo: "comercial_kam",
      sensibilidad: "baja",
      aislado_por_cliente: true,
      cuerpo: "diagnostico_9fuentes",
      estabilidad: "estable",
    });
    expect(gov).toEqual({
      marca: "Coca Cola",
      rolMinimo: "comercial_kam",
      sensibilidad: "baja",
      aisladoPorCliente: true,
      cuerpo: "diagnostico_9fuentes",
      estabilidad: "estable",
      tier: null,
    });
  });

  it("defaults aisladoPorCliente to false when absent/non-true", () => {
    expect(governanceFrom({}).aisladoPorCliente).toBe(false);
    expect(
      governanceFrom({ aislado_por_cliente: "true" }).aisladoPorCliente,
    ).toBe(false); // string, not boolean true
  });
});

// ---------------------------------------------------------------------------
// syncAuraKb / clearAuraKb (real walk + ingest)
// ---------------------------------------------------------------------------

describe("syncAuraKb", () => {
  let tmp: string;

  function writeFinding(brand: string, name: string, fm: string, body: string) {
    const dir = path.join(tmp, "knowledge", "brand-intelligence", brand);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(
      path.join(dir, `${name}.md`),
      `---\n${fm}\n---\n\n${body}\n`,
    );
  }

  beforeEach(() => {
    tmp = fs.mkdtempSync(path.join(os.tmpdir(), "aura-kb-test-"));
    writeFinding(
      "coca-cola",
      "diagnostico-9fuentes",
      "id: coca-diag\ntitulo: Coca Diag\nmarca: Coca Cola\nrol_minimo: comercial_kam\nsensibilidad: baja\naislado_por_cliente: true\ncuerpo: diagnostico_9fuentes\nestabilidad: estable",
      "Diagnostico estructural de Coca Cola con television abierta y horario estelar.",
    );
    writeFinding(
      "pepsi",
      "diagnostico-9fuentes",
      "id: pepsi-diag\ntitulo: Pepsi Diag\nmarca: Pepsi\nrol_minimo: comercial_kam\nsensibilidad: baja\naislado_por_cliente: true\ncuerpo: diagnostico_9fuentes\nestabilidad: estable",
      "Diagnostico estructural de Pepsi con campana digital y redes sociales.",
    );
  });

  afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

  it("indexes findings with governance metadata", async () => {
    const res = await syncAuraKb(tmp);
    expect(res.files).toBe(2);
    expect(res.indexed).toBe(2);
    expect(res.failed).toBe(0);

    const docs = testDb
      .prepare(
        "SELECT titulo, marca, rol_minimo, aislado_por_cliente, source, persona_id FROM crm_documents WHERE source = 'aura-kb' ORDER BY marca",
      )
      .all() as any[];
    expect(docs).toHaveLength(2);
    expect(docs[0].marca).toBe("Coca Cola");
    expect(docs[0].aislado_por_cliente).toBe(1);
    expect(docs[0].persona_id).toBeNull();
    expect(docs[0].source).toBe("aura-kb");
  });

  it("is idempotent — a second run re-indexes nothing", async () => {
    await syncAuraKb(tmp);
    const res2 = await syncAuraKb(tmp);
    expect(res2.indexed).toBe(0);
    expect(res2.skipped).toBe(2);
    const count = testDb
      .prepare("SELECT COUNT(*) c FROM crm_documents WHERE source='aura-kb'")
      .get() as any;
    expect(count.c).toBe(2);
  });

  it("clearAuraKb removes docs and their vec/fts rows", async () => {
    await syncAuraKb(tmp);
    const before = testDb
      .prepare("SELECT COUNT(*) c FROM crm_vec_embeddings")
      .get() as any;
    expect(before.c).toBeGreaterThan(0);

    const removed = clearAuraKb();
    expect(removed).toBeGreaterThan(0);

    const docs = testDb
      .prepare("SELECT COUNT(*) c FROM crm_documents WHERE source='aura-kb'")
      .get() as any;
    expect(docs.c).toBe(0);
    const vec = testDb
      .prepare("SELECT COUNT(*) c FROM crm_vec_embeddings")
      .get() as any;
    expect(vec.c).toBe(0);
  });

  it("reindex option rebuilds cleanly without duplicates", async () => {
    await syncAuraKb(tmp);
    const res = await syncAuraKb(tmp, { reindex: true });
    expect(res.indexed).toBe(2);
    const count = testDb
      .prepare("SELECT COUNT(*) c FROM crm_documents WHERE source='aura-kb'")
      .get() as any;
    expect(count.c).toBe(2);
  });

  it("skips ungoverned files — no frontmatter (README) or missing rol_minimo (C2)", async () => {
    // A navigation README with no frontmatter.
    fs.writeFileSync(
      path.join(tmp, "knowledge", "platform-intelligence-README.md"),
      "# Platform Intelligence\n\nNavigation file, no frontmatter at all.\n",
    );
    // A finding that has frontmatter but no rol_minimo -> cannot be RBAC-gated.
    writeFinding(
      "nobrand",
      "ungoverned",
      "id: ungoverned\ntitulo: Ungoverned\nmarca: Nobrand\nsensibilidad: baja\naislado_por_cliente: true\ncuerpo: diagnostico_9fuentes",
      "Cuerpo sin rol_minimo que no debe indexarse jamas.",
    );

    await syncAuraKb(tmp);
    const titulos = (
      testDb
        .prepare("SELECT titulo FROM crm_documents WHERE source='aura-kb'")
        .all() as any[]
    ).map((d) => d.titulo);

    expect(titulos).not.toContain("Ungoverned"); // no rol_minimo -> skipped
    expect(titulos.some((t: string) => t.includes("Platform"))).toBe(false); // README -> skipped
    expect(titulos).toContain("Coca Diag"); // the 2 governed findings still indexed
    expect(titulos).toContain("Pepsi Diag");
  });
});
