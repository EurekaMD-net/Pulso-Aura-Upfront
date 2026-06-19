/**
 * Snowflake querier (P4).
 *
 * `SnowflakeQuerier` is the seam the rest of the layer depends on — a single
 * `query(sql, binds)` method — so reconciliation and factual queries are fully
 * unit-testable against a fake. The concrete adapter wraps the official
 * `snowflake-sdk` (an optionalDependency; operator runs `npm i snowflake-sdk` +
 * sets creds), behind a lazy dynamic import so this module compiles and the
 * scaffold tests run without the package installed.
 *
 * Read-only by intent: we retrieve facts, never write to Snowflake.
 */

import { CircuitBreaker } from "../circuit-breaker.js";
import { logger } from "../logger.js";
import { loadSnowflakeConfig, type SnowflakeConfig } from "./config.js";

export type SnowflakeRow = Record<string, unknown>;

export interface SnowflakeQuerier {
  /** Run a parameterized read query. `binds` map to `?` placeholders in order. */
  query<T = SnowflakeRow>(sql: string, binds?: unknown[]): Promise<T[]>;
}

export class SnowflakeNotConfiguredError extends Error {
  constructor() {
    super(
      "Snowflake is not configured — set SNOWFLAKE_* env vars and `npm i snowflake-sdk`.",
    );
    this.name = "SnowflakeNotConfiguredError";
  }
}

// --- Minimal local typing of the slice of snowflake-sdk we use ---------------
// Declared locally so this file type-checks without the package installed.
interface SdkStatement {}
interface SdkConnection {
  connect(cb: (err: unknown, conn: SdkConnection) => void): void;
  execute(opts: {
    sqlText: string;
    binds?: unknown[];
    complete: (err: unknown, stmt: SdkStatement, rows?: unknown[]) => void;
  }): void;
}
interface SnowflakeSdkModule {
  createConnection(opts: Record<string, unknown>): SdkConnection;
}

const breaker = new CircuitBreaker({
  name: "snowflake",
  failureThreshold: 3,
  cooldownMs: 60_000,
});

/** Adapter over the real snowflake-sdk. Connects lazily, reuses the connection. */
class SdkQuerier implements SnowflakeQuerier {
  private conn: SdkConnection | null = null;

  constructor(private readonly config: SnowflakeConfig) {}

  private async getConnection(): Promise<SdkConnection> {
    if (this.conn) return this.conn;
    // Variable specifier keeps tsc from resolving the optional dependency at
    // compile time; it loads only when a query actually runs in production.
    const spec = "snowflake-sdk";
    // snowflake-sdk is CommonJS — under ESM interop the API lands on `.default`.
    const mod = (await import(spec)) as { default?: SnowflakeSdkModule };
    const sdk = (mod.default ?? mod) as unknown as SnowflakeSdkModule;
    const conn = sdk.createConnection({
      account: this.config.account,
      username: this.config.username,
      password: this.config.password,
      // key-pair auth, if used, is configured via the privateKeyPath operator seam
      warehouse: this.config.warehouse,
      database: this.config.database,
      schema: this.config.schema,
      role: this.config.role,
    });
    await new Promise<void>((resolve, reject) => {
      conn.connect((err) => (err ? reject(err) : resolve()));
    });
    this.conn = conn;
    return conn;
  }

  async query<T = SnowflakeRow>(
    sql: string,
    binds: unknown[] = [],
  ): Promise<T[]> {
    if (breaker.isOpen()) {
      throw new Error("Snowflake circuit breaker open — skipping query");
    }
    try {
      const conn = await this.getConnection();
      const rows = await new Promise<unknown[]>((resolve, reject) => {
        conn.execute({
          sqlText: sql,
          binds,
          complete: (err, _stmt, rs) => (err ? reject(err) : resolve(rs ?? [])),
        });
      });
      breaker.recordSuccess();
      return rows as T[];
    } catch (err) {
      breaker.recordFailure(err);
      // Drop a possibly-stale connection so the next call reconnects (idle
      // disconnect / token expiry / network drop), instead of reusing a dead handle.
      this.conn = null;
      logger.error({ err }, "Snowflake query failed");
      throw err;
    }
  }
}

let singleton: SnowflakeQuerier | null = null;

/**
 * The shared querier, or null when Snowflake isn't configured. Callers (the
 * factual layer) treat null as a `not_configured` result, never a crash.
 */
export function getSnowflakeQuerier(): SnowflakeQuerier | null {
  if (singleton) return singleton;
  const config = loadSnowflakeConfig();
  if (!config) return null;
  singleton = new SdkQuerier(config);
  return singleton;
}

/** Test seam: inject a fake querier (or reset with null). */
export function _setSnowflakeQuerier(q: SnowflakeQuerier | null): void {
  singleton = q;
}
