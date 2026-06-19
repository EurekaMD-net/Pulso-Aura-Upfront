/**
 * On-demand factual queries (P4) — status gating + result mapping against a fake
 * querier (no real Snowflake needed; the SQL is provisional but the LOGIC is real).
 */

import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createCrmSchema } from "../src/schema.js";
import { normalizeMarca } from "../src/aura-rbac.js";
import type { SnowflakeQuerier } from "../src/snowflake/client.js";

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

const { upsertSnowflakeMapping } =
  await import("../src/snowflake/anunciante-reconcile.js");
const { lastClosedAmount, inventoryMix, investmentOverTime } =
  await import("../src/snowflake/factual.js");

class FakeQuerier implements SnowflakeQuerier {
  calls: { sql: string; binds: unknown[] }[] = [];
  constructor(private readonly rows: Record<string, unknown>[]) {}
  async query<T>(sql: string, binds: unknown[] = []): Promise<T[]> {
    this.calls.push({ sql, binds });
    return this.rows as T[];
  }
}

const PG = normalizeMarca("Procter & Gamble México");

beforeEach(() => {
  testDb = new Database(":memory:");
  sqliteVec.load(testDb);
  testDb.pragma("foreign_keys = ON");
  createCrmSchema(testDb);
  upsertSnowflakeMapping({
    anuncianteNorm: PG,
    sfId: "SF-1",
    sfNombre: "P&G",
    matchMethod: "manual",
    confianza: "alta",
  });
});

describe("factual query status gating", () => {
  it("not_configured when the querier is null", async () => {
    const r = await lastClosedAmount(PG, null);
    expect(r.status).toBe("not_configured");
    expect(r.data).toBeNull();
  });

  it("unreconciled when the advertiser has no Snowflake mapping", async () => {
    const fake = new FakeQuerier([]);
    const r = await lastClosedAmount(normalizeMarca("Sin Mapeo SA"), fake);
    expect(r.status).toBe("unreconciled");
    expect(fake.calls).toHaveLength(0); // never queries Snowflake unmapped
  });

  it("binds the reconciled SF id (not our norm) into the query", async () => {
    const fake = new FakeQuerier([
      { monto: 1_000_000, moneda: "MXN", periodo: "2026-Q1" },
    ]);
    const r = await lastClosedAmount(PG, fake);
    expect(r.status).toBe("ok");
    expect(r.sfId).toBe("SF-1");
    expect(fake.calls[0].binds).toEqual(["SF-1"]);
    expect(r.data).toEqual({
      monto: 1_000_000,
      moneda: "MXN",
      periodo: "2026-Q1",
    });
  });
});

describe("inventoryMix", () => {
  it("computes the share of each inventory type (spot / programa / timeslot…)", async () => {
    const fake = new FakeQuerier([
      { tipo: "spot", monto: 60 },
      { tipo: "programa", monto: 30 },
      { tipo: "timeslot", monto: 10 },
    ]);
    const r = await inventoryMix(PG, fake);
    expect(r.status).toBe("ok");
    expect(r.data).toEqual([
      { tipo: "spot", monto: 60, share: 0.6 },
      { tipo: "programa", monto: 30, share: 0.3 },
      { tipo: "timeslot", monto: 10, share: 0.1 },
    ]);
  });

  it("shares are 0 when there is no spend (no divide-by-zero)", async () => {
    const fake = new FakeQuerier([{ tipo: "spot", monto: 0 }]);
    const r = await inventoryMix(PG, fake);
    expect(r.data?.[0].share).toBe(0);
  });
});

describe("investmentOverTime", () => {
  it("maps the descarga / pacing time series", async () => {
    const fake = new FakeQuerier([
      { periodo: "2026-W01", monto: 100 },
      { periodo: "2026-W02", monto: 250 },
    ]);
    const r = await investmentOverTime(PG, fake);
    expect(r.status).toBe("ok");
    expect(r.data).toEqual([
      { periodo: "2026-W01", monto: 100 },
      { periodo: "2026-W02", monto: 250 },
    ]);
  });
});
