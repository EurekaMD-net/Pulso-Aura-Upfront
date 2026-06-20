/**
 * Closing-goal layer (Cierres 2026 / Metas 2027) — loader linking + the coaching
 * frame math (World Cup gap, base growth, low-hanging fruit), no-guess resolution,
 * idempotency, portfolio rollup, and CSV parsing.
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

const { loadCierreMetas, parseCierreCsvs } =
  await import("../src/cierre/load.js");
const {
  resolveCierreAccounts,
  frameForAccounts,
  cierrePortafolio,
  cierreCoachingSummary,
  cierreMetasLoaded,
} = await import("../src/cierre/query.js");
import type { CierreRow, Escenario } from "../src/cierre/types.js";

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
function cuenta(
  id: string,
  nombre: string,
  gerenteId: string,
  anuncianteNorm: string | null,
): void {
  testDb
    .prepare(
      "INSERT INTO cuenta (id, nombre, tipo, gerente_id, anunciante_norm, estado) VALUES (?, ?, 'directo', ?, ?, 'activo')",
    )
    .run(id, nombre, gerenteId, anuncianteNorm);
}

type L = [string, number, boolean]; // medio, monto, esMundial
function row(
  g: string,
  c: string,
  e: Escenario,
  total: number,
  lineas: L[],
): CierreRow {
  return {
    gerenteCode: g,
    cuentaRaw: c,
    escenario: e,
    total,
    lineas: lineas.map(([medio, monto, esMundial]) => ({
      medio,
      monto,
      esMundial,
    })),
  };
}

/** CCM under ACL: clean numbers. WC=20, base=135, meta=150. */
function ccmRows(): CierreRow[] {
  return [
    row("ACL", "CCM", "cierre_2026", 150, [
      ["tv", 100, false],
      ["mundial_tv", 15, true],
      ["mundial_radio", 5, true],
      ["digital", 10, false],
      ["ctv", 20, false],
    ]),
    row("ACL", "CCM", "base_2026", 135, [
      ["tv", 100, false],
      ["digital", 10, false],
      ["ctv", 20, false],
      ["roku", 5, false],
    ]),
    row("ACL", "CCM", "meta_2027", 150, [
      ["tv", 110, false],
      ["digital", 12, false],
      ["ctv", 22, false],
      ["roku", 6, false],
    ]),
  ];
}

beforeEach(() => {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  createCrmSchema(testDb);
  testDb.pragma("foreign_keys = ON"); // match prod (db.ts) — exercises ON DELETE SET NULL
  persona("dir1", "Diana", "director", null);
  persona("ACL", "ACL", "gerente", "dir1");
  persona("CG", "CG", "gerente", "dir1");
  cuenta("c-ccm", "CCM", "ACL", null);
  cuenta("c-cola", "COCA COLA", "CG", "coca-cola mexico");
});

describe("loadCierreMetas — linking", () => {
  it("links accounts by (gerente, name); reports unmatched + non-pilot; never guesses", () => {
    const rows = [
      ...ccmRows(),
      row("ACL", "PRIME", "cierre_2026", 31, [["tv", 31, false]]), // pilot, no cuenta -> unmatched
      row("CG", "COCA COLA", "cierre_2026", 251, [["tv", 66, false]]), // links via name
      row("ZZ", "FOO", "cierre_2026", 9, [["tv", 9, false]]), // non-pilot gerente
    ];
    const r = loadCierreMetas(rows);
    expect(r.linked).toBe(2); // CCM + COCA COLA
    expect(r.unmatched).toEqual([{ gerenteCode: "ACL", cuentaRaw: "PRIME" }]);
    expect(r.nonPilot).toBe(1);
    expect(r.ambiguous).toEqual([]);

    // CCM row carries cuenta_id; PRIME stays unlinked but loaded.
    const ccm = testDb
      .prepare(
        "SELECT cuenta_id FROM cierre_meta WHERE cuenta_norm='ccm' AND escenario='cierre_2026'",
      )
      .get() as { cuenta_id: string | null };
    expect(ccm.cuenta_id).toBe("c-ccm");
    const prime = testDb
      .prepare(
        "SELECT cuenta_id, total FROM cierre_meta WHERE cuenta_norm='prime'",
      )
      .get() as { cuenta_id: string | null; total: number };
    expect(prime.cuenta_id).toBeNull();
    expect(prime.total).toBe(31);
  });

  it("inherits anunciante_norm from the linked cuenta", () => {
    loadCierreMetas([
      row("CG", "COCA COLA", "meta_2027", 200, [["tv", 200, false]]),
    ]);
    const r = testDb
      .prepare(
        "SELECT anunciante_norm FROM cierre_meta WHERE cuenta_norm='coca cola'",
      )
      .get() as { anunciante_norm: string | null };
    expect(r.anunciante_norm).toBe("coca-cola mexico");
  });

  it("is idempotent — re-loading refreshes totals without duplicating", () => {
    loadCierreMetas(ccmRows());
    // change a total, reload
    const changed = ccmRows();
    changed[2].total = 999;
    loadCierreMetas(changed);
    const headers = testDb
      .prepare("SELECT COUNT(*) n FROM cierre_meta")
      .get() as { n: number };
    expect(headers.n).toBe(3); // still 3 escenarios, not 6
    const meta = testDb
      .prepare("SELECT total FROM cierre_meta WHERE escenario='meta_2027'")
      .get() as { total: number };
    expect(meta.total).toBe(999);
    const lines = testDb
      .prepare("SELECT COUNT(*) n FROM cierre_meta_linea")
      .get() as { n: number };
    expect(lines.n).toBe(13); // 5 + 4 + 4, not doubled
  });
});

describe("frameForAccounts — coaching math", () => {
  beforeEach(() => loadCierreMetas(ccmRows()));

  it("isolates the World Cup gap and computes base growth / vs-2026", () => {
    const res = resolveCierreAccounts("CCM");
    expect(res.status).toBe("ok");
    const f = frameForAccounts(res.accounts)!;
    expect(f.cierre2026.total).toBe(150);
    expect(f.base2026.total).toBe(135);
    expect(f.meta2027.total).toBe(150);
    expect(f.mundial).toBe(20); // 15 + 5 Mundial lines
    expect(f.crecimientoBase).toBe(15); // 150 - 135
    expect(f.crecimientoPct).toBeCloseTo(15 / 135, 5);
    expect(f.vs2026).toBe(0); // 150 - 150 (target flat vs WC-inflated headline)
  });

  it("low-hanging fruit = channels already bought (ex-Mundial), base desc, paired to 2027", () => {
    const f = frameForAccounts(resolveCierreAccounts("CCM").accounts)!;
    const medios = f.lowHangingFruit.map((c) => c.medio);
    expect(medios).toEqual(["tv", "ctv", "digital", "roku"]); // sorted by base desc
    expect(f.lowHangingFruit.find((c) => c.medio === "tv")).toEqual({
      medio: "tv",
      base: 100,
      meta: 110,
    });
    // no Mundial channel leaks into low-hanging fruit
    expect(medios).not.toContain("mundial_tv");
  });

  it("summary states the World Cup gap and leads with the recurring base", () => {
    const f = frameForAccounts(resolveCierreAccounts("CCM").accounts)!;
    const s = cierreCoachingSummary("CCM", f);
    expect(s).toContain("$20.0M"); // World Cup money
    expect(s).toContain("$135.0M"); // recurring base
    expect(s).toContain("$150.0M"); // 2027 target
    expect(s).toMatch(/sin Mundial/i);
  });
});

describe("resolveCierreAccounts — no-guess", () => {
  it("resolves by advertiser name (anunciante path)", () => {
    loadCierreMetas([
      row("CG", "COCA COLA", "cierre_2026", 100, [["tv", 100, false]]),
    ]);
    // 'Coca-Cola' resolves to anunciante_norm 'coca-cola mexico' via the account's link
    const res = resolveCierreAccounts("COCA COLA");
    expect(res.status).toBe("ok");
    expect(res.accounts[0].cuentaRaw).toBe("COCA COLA");
  });

  it("returns ambiguous when one name spans >1 account, never picking one", () => {
    // Two different gerentes each have an account literally named OXXO.
    loadCierreMetas([
      row("ACL", "OXXO", "cierre_2026", 10, [["tv", 10, false]]),
      row("CG", "OXXO", "cierre_2026", 20, [["tv", 20, false]]),
    ]);
    const res = resolveCierreAccounts("OXXO");
    expect(res.status).toBe("ambiguous");
    expect(res.accounts.length).toBe(2);
  });

  it("scopes resolution to the rep's gerente codes", () => {
    loadCierreMetas([
      row("ACL", "OXXO", "cierre_2026", 10, [["tv", 10, false]]),
      row("CG", "OXXO", "cierre_2026", 20, [["tv", 20, false]]),
    ]);
    const scoped = resolveCierreAccounts("OXXO", ["acl"]);
    expect(scoped.status).toBe("ok");
    expect(scoped.accounts[0].gerenteCode).toBe("ACL");
  });

  it("returns none for an unknown name", () => {
    loadCierreMetas(ccmRows());
    expect(resolveCierreAccounts("NOPE").status).toBe("none");
  });
});

describe("cierrePortafolio — rollup", () => {
  it("aggregates a gerente's accounts and sorts by 2027 target", () => {
    loadCierreMetas([
      ...ccmRows(),
      row("ACL", "COLGATE", "cierre_2026", 80, [["tv", 80, false]]),
      row("ACL", "COLGATE", "base_2026", 80, [["tv", 80, false]]),
      row("ACL", "COLGATE", "meta_2027", 90, [["tv", 90, false]]),
    ]);
    const p = cierrePortafolio(["ACL"])!;
    expect(p.total.cierre2026.total).toBe(230); // 150 + 80
    expect(p.total.mundial).toBe(20); // only CCM has Mundial
    expect(p.total.meta2027.total).toBe(240); // 150 + 90
    expect(p.cuentas[0].cuentaRaw).toBe("CCM"); // meta 150 > 90
    expect(p.cuentas[0].crecimientoBase).toBe(15);
  });
});

describe("parseCierreCsvs", () => {
  it("joins header + line CSVs and flags Mundial lines", () => {
    const headers =
      "gerente_code,cuenta_raw,escenario,total\nACL,CCM,cierre_2026,150";
    const lines =
      "gerente_code,cuenta_raw,escenario,medio,monto,es_mundial\n" +
      "ACL,CCM,cierre_2026,tv,100,0\n" +
      "ACL,CCM,cierre_2026,mundial_tv,15,1";
    const rows = parseCierreCsvs(headers, lines);
    expect(rows.length).toBe(1);
    expect(rows[0].total).toBe(150);
    expect(rows[0].lineas).toContainEqual({
      medio: "mundial_tv",
      monto: 15,
      esMundial: true,
    });
    expect(rows[0].lineas).toContainEqual({
      medio: "tv",
      monto: 100,
      esMundial: false,
    });
  });

  it("handles quoted account names with embedded commas", () => {
    const headers =
      'gerente_code,cuenta_raw,escenario,total\nPMN,"CITY FRESKO, LA COMER",meta_2027,55';
    const lines =
      'gerente_code,cuenta_raw,escenario,medio,monto,es_mundial\nPMN,"CITY FRESKO, LA COMER",meta_2027,tv,55,0';
    const rows = parseCierreCsvs(headers, lines);
    expect(rows[0].cuentaRaw).toBe("CITY FRESKO, LA COMER");
    expect(rows[0].lineas[0]).toEqual({
      medio: "tv",
      monto: 55,
      esMundial: false,
    });
  });
});

describe("cierreCoachingSummary — branching on the account's shape", () => {
  it("zero-Mundial account: no World Cup bullet, no $0.0M, 'sin halo' framing", () => {
    loadCierreMetas([
      row("ACL", "COLGATE", "cierre_2026", 80, [["tv", 80, false]]),
      row("ACL", "COLGATE", "base_2026", 80, [["tv", 80, false]]),
      row("ACL", "COLGATE", "meta_2027", 90, [["tv", 90, false]]),
    ]);
    const f = frameForAccounts(resolveCierreAccounts("COLGATE").accounts)!;
    const s = cierreCoachingSummary("COLGATE", f);
    expect(f.mundial).toBe(0);
    expect(s).not.toContain("$0.0M");
    expect(s).not.toMatch(/Brecha Mundial/);
    expect(s).toMatch(/sin halo de Mundial/i);
  });

  it("base=0 account: net-new framing, no 'defend the base', no NaN", () => {
    loadCierreMetas([
      row("ACL", "NUEVA", "cierre_2026", 0, []),
      row("ACL", "NUEVA", "base_2026", 0, []),
      row("ACL", "NUEVA", "meta_2027", 50, [["tv", 50, false]]),
    ]);
    const f = frameForAccounts(resolveCierreAccounts("NUEVA").accounts)!;
    expect(f.crecimientoPct).toBeNull();
    const s = cierreCoachingSummary("NUEVA", f);
    expect(s).toMatch(/negocio nuevo/i);
    expect(s).not.toContain("Es lo que de verdad se defiende");
    expect(s).not.toMatch(/NaN|Infinity/);
  });

  it("always marks the summary as internal (never to client)", () => {
    loadCierreMetas(ccmRows());
    const f = frameForAccounts(resolveCierreAccounts("CCM").accounts)!;
    expect(cierreCoachingSummary("CCM", f)).toMatch(/\[Interno/);
  });
});

describe("cuenta delete — FK ON DELETE SET NULL", () => {
  it("unlinks closing history instead of blocking the delete (org-trim safe)", () => {
    loadCierreMetas(ccmRows()); // CCM linked to c-ccm
    const before = testDb
      .prepare(
        "SELECT cuenta_id FROM cierre_meta WHERE cuenta_norm='ccm' LIMIT 1",
      )
      .get() as { cuenta_id: string | null };
    expect(before.cuenta_id).toBe("c-ccm");

    // Org-trim deletes the cuenta. With foreign_keys=ON this must NOT throw.
    expect(() =>
      testDb.prepare("DELETE FROM cuenta WHERE id='c-ccm'").run(),
    ).not.toThrow();

    const after = testDb
      .prepare("SELECT cuenta_id FROM cierre_meta WHERE cuenta_norm='ccm'")
      .all() as { cuenta_id: string | null }[];
    expect(after.length).toBe(3); // closings retained
    expect(after.every((r) => r.cuenta_id === null)).toBe(true); // just unlinked
  });
});

describe("cierreMetasLoaded", () => {
  it("is false before load, true after", () => {
    expect(cierreMetasLoaded()).toBe(false);
    loadCierreMetas(ccmRows());
    expect(cierreMetasLoaded()).toBe(true);
  });
});
