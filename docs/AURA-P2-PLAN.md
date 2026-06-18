# Aura KB — P2 Execution Plan (RAG indexing + governance at recall)

> Prereq: P0–P1 done (`AURA-KB-OPERATIONALIZATION.md`). P2 wires `aura-kb/knowledge/` into the
> engine's existing hybrid RAG so the closing slice can retrieve brand intelligence under the
> firewall + RBAC + epistemic-tier rules. P2 is where engine **code + tests** land.
>
> **STATUS: IMPLEMENTED 2026-06-18.** Built: schema governance columns + `marca_norm`,
> `aura-kb-sync.ts` ingester (`npm run sync:aura-kb`), `aura-rbac.ts` clearance lattice, and
> `searchAuraKb` (firewall + RBAC in SQL at recall); the Drive RAG now excludes `source='aura-kb'`
> so VP's unfiltered search can't bypass governance. qa-auditor pass: **2 Criticals found + fixed**
> — (C1) the firewall trusted the operator-supplied `aislado` flag, now it gates on brand presence
> via a case/diacritic-folded `marca_norm`; (C2) ungoverned files (READMEs / no `rol_minimo`) were
> indexable, now skipped. Tests green (typecheck clean; 1240 in the `--changed` set). **Deferred:**
> metadata-filtered KNN _within_ a brand (mitigated by a large over-fetch + in-query FTS filtering);
> wiring `searchAuraKb` to an agent tool is **P3** (surfacing). The steps below are the as-built spec.

## Target surface (what already exists)

| Component       | File                                      | Note                                                                                                                  |
| --------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Ingest pipeline | `crm/src/doc-sync.ts` → `storeDocument()` | chunk (`chunkText`) → embed (`embedBatch`) → store                                                                    |
| Embeddings      | `crm/src/embedding.ts`                    | Dashscope `text-embedding-v3`, **1024-dim**                                                                           |
| Tables          | `crm/src/schema.ts`                       | `crm_documents` → `crm_embeddings` → `crm_vec_embeddings` (vec0) + `crm_fts_embeddings` (fts5, `remove_diacritics 2`) |
| Hybrid search   | `doc-sync.ts` → `searchDocuments()`       | vector KNN + FTS keyword + `reciprocalRankFusion()`                                                                   |
| RAG tool        | `crm/src/tools/rag.ts`                    | calls `searchDocuments`                                                                                               |

## Step 0 — Preconditions (verify before bulk work)

1. **Embedding provider is live.** Memory notes DashScope deprecated the operator's paid plan
   (inference moved to Fireworks). Confirm the _embedding_ endpoint (`embedding.ts`) still answers
   before embedding 969 findings — bulk embedding is the one irreversible cost. If DashScope embed
   is dead, point `embedding.ts` at a live 1024-dim provider (and re-embed must use one model).
2. **Estimate cost/volume:** 969 findings + doctrine/catalog, ~N chunks each → one-time embed batch.
   Print the chunk count before embedding.

## Step 1 — Schema migration (`crm/src/schema.ts`)

`crm_documents` today is persona-scoped with no governance columns and
`source CHECK(source IN ('drive','email','manual'))`. Extend it:

- Add `'aura-kb'` to the `source` CHECK (new installs via `CREATE TABLE`; existing DBs need a
  guarded table-rebuild migration — SQLite can't `ALTER` a CHECK).
- Add governance columns (guarded `ALTER TABLE ADD COLUMN` for existing DBs):
  `marca TEXT`, `rol_minimo TEXT`, `sensibilidad TEXT`, `aislado_por_cliente INTEGER DEFAULT 0`,
  `cuerpo TEXT`, `estabilidad TEXT`, `tier_evidencia TEXT`.
- Indexes: `idx_crm_docs_marca (marca)`, `idx_crm_docs_rolmin (rol_minimo)`.
- `persona_id` stays NULL for aura-kb docs (global corpus, not a salesperson's Drive).

## Step 2 — Aura-KB ingester (new `crm/src/aura-kb-sync.ts`)

- Walk `aura-kb/knowledge/**/*.md` (+ `doctrine/`, `catalogs/`). Parse YAML frontmatter →
  `{ marca, cuerpo, rol_minimo, sensibilidad, aislado_por_cliente, estabilidad, tier }`.
- Per finding: reuse `chunkText` + `embedBatch`; insert `crm_documents` (source `'aura-kb'`,
  `persona_id=NULL`, governance cols) + `crm_embeddings` + vec + fts (mirror `storeDocument`).
- **Idempotent** via `contenido_hash` (skip unchanged); safe to re-run on corpus change.
- Entry points: one-shot at bootstrap (guard: skip if already indexed) + a manual `syncAuraKb()`.

## Step 3 — Governance filters at recall (`doc-sync.ts`)

Extend `searchDocuments` / `searchDocumentsKeyword` / vector branch with
`{ marca?, userRole, includeAuraKb? }`, applied in the JOIN to `crm_documents` **before** RRF:

- **Firewall:** for `source='aura-kb'` rows, `WHERE (aislado_por_cliente = 0 OR marca = :sessionMarca)`.
  All 969 findings are `aislado=1`, so in practice **marca must equal the session's active brand** —
  a brand-A session can never surface brand-B intel.
- **RBAC:** `WHERE rol_minimo IN (:clearanceSet)` from Step 4.
- Keep existing persona/Drive behavior unchanged when `includeAuraKb` is false.

## Step 4 — Role-clearance map (new helper, e.g. `crm/src/aura-rbac.ts`)

Lattice (from `aura-kb/taxonomy/rol-acceso.yaml`, cumulative):
`transversal < comercial_kam < estrategia_research < restringido_senior < direccion_clevel`.

| CRM role     | Cleared floors                            |
| ------------ | ----------------------------------------- |
| AE (dormant) | transversal, comercial_kam                |
| Gerente      | + estrategia_research, restringido_senior |
| Director     | + estrategia_research, restringido_senior |
| VP           | + direccion_clevel (all)                  |

## Step 5 — Session brand context (firewall input)

The agent session must carry the **active brand** to enforce the firewall. Phase-1: the router
(`aura-amn`) IDs the brand from the conversation; persist it on the session ("una sesión = un
cliente"). Until a brand is established, aura-kb retrieval returns nothing (fail-closed).

## Step 6 — Epistemic tiers surfaced

Carry `tier_evidencia` (`CERTEZA_FUERTE` / `HIPOTESIS_FUNDAMENTADA` / `HIPOTESIS_POR_VALIDAR`)
alongside each retrieved chunk so the agent never presents a hypothesis as fact (reuse the CRM's
existing fabrication guards).

## Step 7 — Tests (`crm/tests/`)

- **Firewall:** a brand-A-scoped query never returns a brand-B finding (the load-bearing test).
- **RBAC:** AE clearance cannot retrieve `restringido_senior`; Gerente can.
- **Fail-closed:** no active brand → zero aura-kb results.
- **Ingester idempotency:** re-run changes nothing (hash skip).
- **RRF intact:** existing Drive RAG behavior unchanged when `includeAuraKb=false`.

## Acceptance (P2 done)

A Gerente session scoped to brand X retrieves only X's findings, filtered to its clearance, fused
and tier-tagged — proven by the test suite (green) **and** one live retrieval through `rag.ts`.

## Out of scope for P2 (→ P3)

The coaching state machine (router PREVENTA → ARMAGEDDON → DARK → STAKEHOLDERS), encoding the
SKILL.md bodies as engine modes, WhatsApp surfacing for Gerente/Director, and the proactive
near-close trigger. P2 makes the substrate retrievable; P3 drives it.
