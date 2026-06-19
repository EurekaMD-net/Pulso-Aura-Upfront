/**
 * Near-Close Coaching Tests (P3.4)
 *
 * Covers detection scope, the never-to-client gate (the headline), anunciante
 * grouping + graceful per-cuenta degradation, message contract, dedup, and the
 * full sweep. Mirrors escalation.test.ts harness (in-memory DB + fake deps).
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";
import type { IpcDeps } from "../../engine/src/ipc.js";

let testDb: InstanceType<typeof Database>;

vi.mock("../src/db.js", () => ({
  getDatabase: () => testDb,
}));

const noop = () => {};
const noopLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  fatal: noop,
  child: () => noopLogger,
};
vi.mock("../src/logger.js", () => ({
  logger: noopLogger,
}));

const {
  nearcloseClusters,
  resolveCoachingRecipient,
  composeNudge,
  evaluateNearcloseCoaching,
} = await import("../src/nearclose.js");
const { _resetStatementCache } = await import("../src/hierarchy.js");

// ---------------------------------------------------------------------------
// Harness
// ---------------------------------------------------------------------------

const sent: { jid: string; text: string }[] = [];

const fakeDeps: IpcDeps = {
  sendMessage: async (jid: string, text: string) => {
    sent.push({ jid, text });
  },
  registeredGroups: () => ({
    "jid-ger1": {
      folder: "ger-one",
      name: "GER1",
      trigger: "@bot",
      added_at: "x",
    } as any,
    "jid-dir1": {
      folder: "dir-one",
      name: "DIR1",
      trigger: "@bot",
      added_at: "x",
    } as any,
    "jid-ae1": {
      folder: "ae-one",
      name: "AE1",
      trigger: "@bot",
      added_at: "x",
    } as any,
    "jid-vp1": {
      folder: "vp-one",
      name: "VP1",
      trigger: "@bot",
      added_at: "x",
    } as any,
    // note: "ger-noreg" and "ger-four" folders are deliberately NOT registered
  }),
  registerGroup: () => {},
} as any;

function persona(
  id: string,
  rol: string,
  reporta_a: string | null,
  folder: string | null,
  activo = 1,
): void {
  testDb
    .prepare(
      `INSERT INTO persona (id, nombre, rol, reporta_a, whatsapp_group_folder, activo)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, id.toUpperCase(), rol, reporta_a, folder, activo);
}

function cuenta(
  id: string,
  nombre: string,
  ae_id: string,
  anunciante: string | null,
  anunciante_norm: string | null,
): void {
  testDb
    .prepare(
      `INSERT INTO cuenta (id, nombre, tipo, ae_id, anunciante, anunciante_norm)
       VALUES (?, ?, 'directo', ?, ?, ?)`,
    )
    .run(id, nombre, ae_id, anunciante, anunciante_norm);
}

function propuesta(
  id: string,
  cuenta_id: string,
  ae_id: string,
  etapa: string,
  valor = 1_000_000,
  dias = 0,
  fechaCierre: string | null = null,
): void {
  testDb
    .prepare(
      `INSERT INTO propuesta (id, cuenta_id, ae_id, titulo, valor_estimado, etapa, dias_sin_actividad, fecha_cierre_esperado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id, cuenta_id, ae_id, `Deal ${id}`, valor, etapa, dias, fechaCierre);
}

function setupDb(): void {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);
  _resetStatementCache();
  sent.length = 0;

  // Org chart
  persona("vp1", "vp", null, "vp-one");
  persona("dir1", "director", "vp1", "dir-one");
  persona("ger1", "gerente", "dir1", "ger-one");
  persona("ger2", "gerente", "dir1", "ger-noreg"); // folder set but unregistered
  persona("ger3", "gerente", "dir1", null); // no group folder
  persona("ger4", "gerente", "dir1", "ger-four", 0); // inactive
  persona("ae1", "ae", "ger1", "ae-one");
  persona("ae2", "ae", "ger1", "ae-two");
  persona("ae5", "ae", "ger2", "ae-five"); // reports to unregistered gerente
  persona("aed", "ae", "dir1", "ae-d"); // reports directly to a director

  // Accounts (c1/c2 linked to anunciante; c3 unlinked → degrades to per-cuenta)
  cuenta("c1", "Coca-Cola", "ae1", "Coca-Cola FEMSA", "coca-cola femsa");
  cuenta("c2", "Bimbo", "ae2", "Grupo Bimbo", "grupo bimbo");
  cuenta("c3", "Marca Suelta", "ae1", null, null);
  cuenta("c5", "Cuenta AE5", "ae5", "Anunciante X", "anunciante x");
  cuenta("cd", "Cuenta Dir", "aed", "Anunciante Dir", "anunciante dir");
}

beforeEach(setupDb);

// ---------------------------------------------------------------------------
// 1. Detection scope
// ---------------------------------------------------------------------------

describe("nearcloseClusters — detection scope", () => {
  it("includes only en_negociacion + confirmada_verbal", () => {
    propuesta("p1", "c1", "ae1", "en_negociacion");
    propuesta("p2", "c2", "ae2", "confirmada_verbal");
    // excluded stages:
    propuesta("p3", "c1", "ae1", "en_discusion");
    propuesta("p4", "c1", "ae1", "orden_recibida");
    propuesta("p5", "c1", "ae1", "completada");
    propuesta("p6", "c1", "ae1", "perdida");

    const clusters = nearcloseClusters();
    const ids = clusters.flatMap((c) => c.deals.map((d) => d.id)).sort();
    expect(ids).toEqual(["p1", "p2"]);
  });

  it("excludes deals whose AE is inactive", () => {
    persona("ae_off", "ae", "ger1", "ae-off", 0);
    cuenta("coff", "Off", "ae_off", "Anunciante Off", "anunciante off");
    propuesta("poff", "coff", "ae_off", "en_negociacion");
    expect(nearcloseClusters()).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 2. Anunciante grouping + degradation
// ---------------------------------------------------------------------------

describe("nearcloseClusters — grouping", () => {
  it("groups multiple deals of one anunciante under one cluster for the coach", () => {
    propuesta("p1", "c1", "ae1", "en_negociacion");
    propuesta("p2", "c1", "ae1", "confirmada_verbal");

    const clusters = nearcloseClusters();
    expect(clusters).toHaveLength(1);
    expect(clusters[0].recipientPersonaId).toBe("ger1"); // ae1's manager
    expect(clusters[0].anunciante).toBe("Coca-Cola FEMSA");
    expect(clusters[0].key).toBe("coca-cola femsa");
    expect(clusters[0].deals).toHaveLength(2);
  });

  it("degrades to per-cuenta when the account has no anunciante link", () => {
    propuesta("p1", "c3", "ae1", "en_negociacion");
    const clusters = nearcloseClusters();
    expect(clusters).toHaveLength(1);
    expect(clusters[0].anunciante).toBeNull();
    expect(clusters[0].cuentaNombre).toBe("Marca Suelta");
    expect(clusters[0].key).toBe("cuenta:c3");
  });

  it("a deal under an AE reporting to a director routes the coach to that director", () => {
    propuesta("p1", "cd", "aed", "en_negociacion");
    const clusters = nearcloseClusters();
    expect(clusters).toHaveLength(1);
    expect(clusters[0].recipientPersonaId).toBe("dir1");
  });
});

// ---------------------------------------------------------------------------
// 3. The never-to-client gate (headline)
// ---------------------------------------------------------------------------

describe("resolveCoachingRecipient — never-to-client gate", () => {
  it("allows an active gerente with a registered group", () => {
    const r = resolveCoachingRecipient("ger1", fakeDeps);
    expect(r.ok).toBe(true);
    expect(r.jid).toBe("jid-ger1");
    expect(r.persona?.rol).toBe("gerente");
  });

  it("allows an active director with a registered group", () => {
    const r = resolveCoachingRecipient("dir1", fakeDeps);
    expect(r.ok).toBe(true);
    expect(r.jid).toBe("jid-dir1");
  });

  it("BLOCKS an AE (out of Ger/Dir scope)", () => {
    const r = resolveCoachingRecipient("ae1", fakeDeps);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("role_out_of_scope");
    expect(r.jid).toBeUndefined();
  });

  it("BLOCKS a VP (out of Ger/Dir scope)", () => {
    const r = resolveCoachingRecipient("vp1", fakeDeps);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("role_out_of_scope");
  });

  it("BLOCKS an inactive gerente", () => {
    const r = resolveCoachingRecipient("ger4", fakeDeps);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("inactive");
  });

  it("BLOCKS a gerente with no group folder", () => {
    const r = resolveCoachingRecipient("ger3", fakeDeps);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_group");
  });

  it("BLOCKS a gerente whose folder is not a registered group", () => {
    const r = resolveCoachingRecipient("ger2", fakeDeps);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no_registered_group");
  });

  it("BLOCKS a client contacto (no persona row → never a recipient)", () => {
    // A contacto exists with a real phone, but it is NOT in the persona table.
    testDb
      .prepare(
        `INSERT INTO contacto (id, nombre, cuenta_id, rol, telefono) VALUES ('k1', 'Cliente', 'c1', 'decisor', '5215555555555')`,
      )
      .run();
    const r = resolveCoachingRecipient("k1", fakeDeps);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("not_a_persona");
    expect(r.jid).toBeUndefined();
  });

  it("BLOCKS a null/empty recipient id", () => {
    expect(resolveCoachingRecipient(null, fakeDeps).reason).toBe(
      "not_a_persona",
    );
    expect(resolveCoachingRecipient("", fakeDeps).reason).toBe("not_a_persona");
  });
});

// ---------------------------------------------------------------------------
// 4. Message contract
// ---------------------------------------------------------------------------

describe("composeNudge — message contract", () => {
  const cluster = {
    recipientPersonaId: "ger1",
    key: "coca-cola femsa",
    anunciante: "Coca-Cola FEMSA",
    cuentaNombre: "Coca-Cola",
    deals: [
      {
        id: "p1",
        titulo: "Upfront Coca",
        etapa: "en_negociacion",
        valorEstimado: 20_000_000,
        fechaCierreEsperado: "2027-01-15",
        diasSinActividad: 9,
      },
    ],
  };

  it("carries the never-to-client marker and points to the anunciante tools", () => {
    const msg = composeNudge(cluster);
    expect(msg).toContain("Cierre cercano");
    expect(msg).toContain("Coca-Cola FEMSA");
    expect(msg).toContain("armar_radiografia_anunciante");
    expect(msg).toContain("mapa_poder_anunciante");
    expect(msg).toContain("jamás al cliente");
  });

  it("synthesizes — never dumps raw JSON", () => {
    const msg = composeNudge(cluster);
    expect(msg).not.toContain('{"');
    expect(msg).not.toContain('"titulo"');
    expect(msg).not.toContain('"etapa"');
  });

  it("renders the cuenta name when there is no anunciante link", () => {
    const msg = composeNudge({
      ...cluster,
      anunciante: null,
      key: "cuenta:c3",
    });
    expect(msg).toContain("Coca-Cola"); // falls back to cuentaNombre
  });
});

// ---------------------------------------------------------------------------
// 5. Full sweep
// ---------------------------------------------------------------------------

describe("evaluateNearcloseCoaching — sweep", () => {
  it("sends one nudge per (gerente, anunciante) cluster to the registered group", async () => {
    propuesta("p1", "c1", "ae1", "en_negociacion"); // ger1 / coca-cola femsa
    propuesta("p2", "c2", "ae2", "confirmada_verbal"); // ger1 / grupo bimbo

    const result = await evaluateNearcloseCoaching(fakeDeps);
    expect(result.sent).toBe(2);
    expect(sent.every((s) => s.jid === "jid-ger1")).toBe(true);
    expect(sent.some((s) => s.text.includes("Coca-Cola FEMSA"))).toBe(true);
    expect(sent.some((s) => s.text.includes("Grupo Bimbo"))).toBe(true);
  });

  it("dedups: a second sweep the same day sends nothing", async () => {
    propuesta("p1", "c1", "ae1", "en_negociacion");
    const first = await evaluateNearcloseCoaching(fakeDeps);
    expect(first.sent).toBe(1);

    sent.length = 0;
    const second = await evaluateNearcloseCoaching(fakeDeps);
    expect(second.sent).toBe(0);
    expect(second.skipped).toBe(1);
    expect(sent).toHaveLength(0);
  });

  it("counts a blocked recipient and sends nothing to it", async () => {
    // ae5 reports to ger2 (folder unregistered) → blocked, no send.
    propuesta("p5", "c5", "ae5", "en_negociacion");
    const result = await evaluateNearcloseCoaching(fakeDeps);
    expect(result.sent).toBe(0);
    expect(result.blocked).toBe(1);
    expect(sent).toHaveLength(0);
  });
});
