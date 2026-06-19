# Aura P4 — Snowflake factual-data bridge (the QUÉ-real)

> **The two-source model.** Pulso already fuses Aura (exogenous brand intelligence — the **CÓMO**)
> with the CRM's own deal side (anunciante / cuenta / contacto — the **QUÉ-interno**). P4 adds the
> third source: the **factual / transactional truth** (what was actually closed, on what inventory,
> how the investment paced) that lives in an external **Snowflake** instance. It is queried **on
> demand** during a closing conversation, never copied wholesale into the CRM. The **anunciante** is
> the join key across all three — which is why the P3.5 anunciante layer + the registration wiring had
> to land first.

## What lives where

| Source                                         | Holds                                                                                                                                | Access                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | ---------------------- |
| Aura corpus (`crm_documents`/`crm_embeddings`) | brand intelligence, diagnósticos, war-room method                                                                                    | local, firewall + RBAC |
| CRM (`cuenta`/`contacto`/`propuesta`)          | the deal: advertiser, committee, pipeline stage                                                                                      | local                  |
| **Snowflake (P4)**                             | **last closed amount, inventory mix (spot vs. programa vs. timeslot vs. otras propiedades), descarga / investment pacing over time** | **remote, on demand**  |

## P4.0 — Connection scaffold ✅ DONE (this commit)

The structural foundation, built + tested against fakes (no creds/SDK needed to compile or test):

- **Config** — `crm/src/snowflake/config.ts`: `loadSnowflakeConfig()` from `SNOWFLAKE_*` env (account,
  username, warehouse, database, schema, role + password **or** key-pair); `isSnowflakeConfigured()`
  returns false until set, so everything downstream degrades to a clear `not_configured` signal.
- **Client** — `crm/src/snowflake/client.ts`: `SnowflakeQuerier` interface (the testable seam,
  `query(sql, binds)`); `SdkQuerier` adapter wraps the official `snowflake-sdk` (an
  **optionalDependency**) behind a **lazy dynamic import** (variable specifier → compiles without the
  package) and a **circuit breaker** (reuses `circuit-breaker.ts`). Read-only by intent.
  `getSnowflakeQuerier()` returns null when unconfigured.
- **Reconciliation** — `crm/src/snowflake/anunciante-reconcile.ts` + `anunciante_snowflake_map` table
  (Phase-14 migration). `reconcileAnunciantes(sfRows)` matches a batch of Snowflake advertisers to ours
  by **normalized name** (`normalizeMarca` on both sides; exact-norm auto-maps with `confianza='alta'`),
  reporting `unmatched` for operator review — **never a fuzzy guess** (same posture as the P3.5 brand
  map). `snowflakeKeyForAnunciante(anuncianteNorm)` returns the SF id, or null when unreconciled.
  `upsertSnowflakeMapping` for manual overrides.
- **Factual queries** — `crm/src/snowflake/factual.ts`: `lastClosedAmount`, `inventoryMix`,
  `investmentOverTime`. Each resolves OUR `anunciante_norm` → SF id (via reconciliation), runs a
  parameterized query, maps rows to a typed shape, and returns an explicit `status`
  (`ok` / `unreconciled` / `not_configured`). **`FACTUAL_SQL` is PROVISIONAL** — it encodes the intent
  - the bind (`WHERE <advertiser> = ?` on the SF id) + the expected output columns, but the real
    table/column names must be confirmed against the live schema (P4.2).
- Tests: `snowflake-reconcile.test.ts` + `snowflake-factual.test.ts` (status gating, the SF-id bind,
  result mapping incl. inventory shares, no divide-by-zero, idempotent upsert) — all against a fake
  querier; `tsc` clean. Table count 29→30.

## Operator inputs needed before P4 runs live

1. **Credentials** — set `SNOWFLAKE_*` in `.env` (operator-managed; never committed). Choose password
   or key-pair auth. Use a **read-only** Snowflake role.
2. **Install the driver** — `npm i snowflake-sdk` (it's an optionalDependency; the scaffold compiles
   without it but won't connect until installed).
3. **The real schema** — the actual table + column names for closed deals, orders/inventory, and
   descargas, so `FACTUAL_SQL` can be finalized (P4.2).
4. **The SF advertiser list** — a `SELECT id, nombre FROM <advertisers>` to feed `reconcileAnunciantes`
   (P4.1), then operator review of the `unmatched` list.

## Increments (build in order)

- **P4.1 — Populate the reconciliation map.** Pull the SF advertiser list, run `reconcileAnunciantes`,
  hand the `unmatched` to the operator (or a researched/fuzzy pass with provenance, like P3.5) +
  `upsertSnowflakeMapping` overrides. A `npm run reconcile:snowflake` runner (mirrors
  `sync:anunciante-map`).
- **P4.2 — Finalize `FACTUAL_SQL`** against the confirmed Snowflake schema; verify each query returns
  the expected shape on a real connection (smoke-test like the P3.5 join check).
- **P4.3 — Agent tools (Ger/Dir, on demand).** Wrap the factual functions as tools
  (`consultar_hechos_anunciante` / per-metric), registered for Gerente + Director only, surfacing the
  `unreconciled` / `not_configured` status to the agent as coaching ("aún no reconciliado — pídelo al
  operador"). Gated behind `isSnowflakeConfigured()` so dead tools never surface. Wire into Modo Cierre
  Paso 1 so the radiografía is grounded in **real spend**, not just intelligence.
- **P4.4 — Caching / freshness.** On-demand queries are slow + metered; add a short-TTL cache keyed on
  (anunciante, metric) so a single closing conversation doesn't re-hit Snowflake per turn.

## Notes / guards

- **Reconcile before query** is structural: `factual.*` returns `unreconciled` (never empty-as-if-zero)
  when no mapping exists — the agent must not present "no data" as "no spend".
- **Read-only** — no code path writes to Snowflake.
- The map is a join key, **not** a data cache — factual values are never persisted in the CRM (freshness +
  no stale-money risk).
- **Join invariant (hardened in P4.0):** the reconcile match (`normalizeMarca(sf.nombre)` vs
  `anunciante_marca.anunciante_norm`) and the consumer key (`cuenta.anunciante_norm` =
  `normalizeMarca(resolved.anunciante)`) must be the same normalization of the same advertiser. The P3.5
  ingester now **derives** `*_norm` via `normalizeMarca(anunciante)` instead of trusting the JSON, so this
  holds by construction (verified: 320/320, 0 violations) — a guard test fails CI if a future map drifts.

### Deferred (scaffold-acceptable, for the production pass)

- `SdkQuerier.close()` for graceful shutdown (the read connection is intentionally held for process life).
- A test exercising the circuit breaker **through** `SdkQuerier.query` (currently the breaker is unit-tested
  in isolation; the querier path needs SDK dependency-injection to test).
- Key-pair auth wiring (`privateKeyPath` is accepted by config but not yet passed to `createConnection`).
