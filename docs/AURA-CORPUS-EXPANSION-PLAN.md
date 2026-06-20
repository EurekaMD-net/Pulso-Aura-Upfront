# Aura Corpus Expansion Plan — covering the full cartera

**Status: plan (2026-06-20). Pilot proceeds on the 76 already-covered accounts; this
plan covers expanding brand intelligence to the rest of the national cartera.**

## 1. Why

The national cartera ("Cartera VN_Base 2025-2026") was seeded into the live CRM:
**60 personas + 299 accounts**. Of those, **76 accounts link to the Aura brand corpus**
(320 brands / 160 advertisers / 971 docs); **223 do not** — they are advertisers Aura has
**no intelligence for yet** (ABBOTT, BACARDI, CINEMEX, CLOROX, CONAGRA, DIAGEO, OXXO,
PFIZER, SEPHORA, …), confirmed genuinely-absent (not naming mismatches — reconciliation
recovered only 1 of 223). So the closing companion can run its full Aura play (radiografía →
ARMAGEDDON → DARK → STAKEHOLDERS) for ~26% of the book today. Expanding the corpus closes
that gap.

## 2. The unit of expansion (what already works — replicate it)

A brand dossier lives at `aura-kb/knowledge/brand-intelligence/<marca-slug>/`, **one file per
cuerpo (C1–C6)**, each with YAML frontmatter (`aura-kb/CONVENTIONS.md`) carrying its
`brand`/`marca`, `cuerpo`, `rol_minimo` (RBAC floor), `aislado_por_cliente` (firewall), etc.
The four cuerpos the radiografía read-path consumes (`crm/src/doc-sync.ts RADIOGRAFIA_CUERPOS`):

| cuerpo                    | content                                                    |
| ------------------------- | ---------------------------------------------------------- |
| `diagnostico_9fuentes`    | the 6-ROAS-factor diagnosis (the spine of the radiografía) |
| `buyer_personas`          | decision-maker personas (feeds STAKEHOLDERS)               |
| `campanas_temporalidades` | seasonality / tentpole calendar (feeds preventa timing)    |
| `inteligencia_social`     | social/competitive signal                                  |

(C5/C6 carry additional doctrine; firewall+RBAC are per-file.) **The expansion is: produce these
dossiers for the missing advertisers' brands, then run the existing pipeline.** No new engine
code — the retrieval, firewall, RBAC, radiografía, portfolio rollup, and tools already exist.

## 3. The build pipeline (already shipped — reuse end to end)

```
author dossiers → aura-kb/knowledge/brand-intelligence/<slug>/{C1..C6}.md   (frontmatter per CONVENTIONS.md)
  → npm run sync:aura-kb            # crm/src/aura-kb-sync.ts: parse + upsert into crm_documents
  → npm run deploy:aura-kb -- --reindex   # Fireworks qwen3-embedding-8b (1024-dim) -> crm_embeddings
  → npm run verify:aura-kb          # firewall holds, 0 leak, chunk counts
  → add brand_key->anunciante rows to aura-kb/anunciantes/brand-anunciante-map.json
  → npm run sync:anunciante-map     # load anunciante_marca
  → npm run backfill:cuenta-anunciante   # link the now-covered cartera accounts
```

Cost of the mechanical half is small (the original 320-brand embed was **~$0.90 one-time**).
**The cost driver is authoring** the dossiers (§5).

## 4. Scope & prioritization

~223 unlinked accounts → ~200 distinct advertisers (some are non-brand entities — see §7).
Do **not** boil the ocean. Tier by **cartera weight × closing relevance**:

- **Tier 0 — Pilot (now):** the **76 covered** accounts. No expansion needed. Narrow the
  closing pilot to these (the radiografía/portfolio tools return real intelligence only here).
- **Tier 1 — Top absent advertisers with active closing deals:** the big absent names a
  Director/Gerente is actually trying to close for Upfront 2027. Author these first. Target
  the ~20–30 highest-value (ABBOTT, DIAGEO, PFIZER, CONAGRA, OXXO, BACARDI, KELLOGG-class).
- **Tier 2 — The rest of the recognizable advertisers** (national brands): batch-author.
- **Tier 3 — Long tail / promo / local / non-brand** (`*-PROM`, `*-ORION`, `AJUSTES`, `CCM`,
  `VIRTUALES`, `COMPLEMENTARIOS`, `ALCOHOLICOS ANONIMOS`, fundaciones): likely **never** get a
  brand dossier — they're not brand-intelligence targets. Leave unlinked by design.

Rank Tier 1/2 off the cartera once names/values are confirmed (the sheet + any revenue data).

## 5. Authoring — the real work (decision needed)

The original 320 dossiers were authored via the **proprietary Aura method** (the "9 fuentes"
diagnostic, the 19-skill claude.ai-Projects system). Reproducing that depth per brand is the
expensive part. Three routes (pick per tier):

1. **Agent-assisted authoring (recommended for Tier 1/2):** an orchestrated pass per brand —
   research the 9 sources → draft the 6 cuerpos to the CONVENTIONS.md frontmatter + the
   diagnostic structure → human review of `diagnostico_9fuentes` (the load-bearing cuerpo)
   before embed. Mirrors how the `anunciante` map was derived (grounded research agents, no
   fabrication). Throughput: batchable; cost scales with brand count × depth.
2. **Analyst authoring (highest fidelity, slowest):** the Aura team authors Tier-1 brands by
   hand, agent assists Tier-2. Best where the closing stakes are highest.
3. **Thin bootstrap + enrich:** author only `diagnostico_9fuentes` + `campanas_temporalidades`
   first (enough for a basic radiografía + preventa timing), defer buyer_personas/social.
   Gets coverage up fast; STAKEHOLDERS depth lags until enrichment.

**Quality gate (non-negotiable):** every cuerpo must carry correct `rol_minimo` +
`aislado_por_cliente` (the firewall/RBAC key on the _intrinsic_ brand fact, never a free-text
flag — the P2 lesson), and `diagnostico_9fuentes` must be reviewed before deploy (it drives the
preventa thesis). No fabricated stats — same posture as the existing corpus.

## 6. Phasing & checkpoints

- **Phase A (now):** pilot on Tier 0 (76). Fill the roster sheet (names). Wire WA groups for the
  Dir/Ger whose accounts are in the 76. Run the closing pilot; gather acceptance signal (§7 gate).
- **Phase B:** author Tier 1 (~20–30 brands) → run the §3 pipeline → re-`backfill` → coverage
  jumps. Verify firewall after each `--reindex`.
- **Phase C:** Tier 2 batch authoring; re-deploy; re-backfill. Re-evaluate Tier 3 (most stay out).

After each phase: `verify:aura-kb` (0 leak) + spot-check a radiografía for a newly-covered brand.

## 7. Open decisions for the operator

1. **Tier-1 list:** which absent advertisers have live Upfront-2027 closing deals? (drives order)
2. **Authoring route** per tier (§5): agent-assisted, analyst, or thin-bootstrap?
3. **Source data:** the "9 fuentes" — are those sources agent-reachable (web/research) or do they
   need proprietary Aura inputs? (gates whether agent-authoring is viable for Tier 1)
4. **Non-brand entities** (`*-PROM`, `*-ORION`, fundaciones, internal codes): confirm these stay
   out of the brand corpus (they're deal accounts, not brand-intelligence targets).
5. **`tipo` (directo/agencia)** on accounts — currently all `directo`; refine if it matters for
   the play.

## 8. What's already done (no expansion needed)

- 60 personas + 299 accounts seeded; ownership chains wired; gerente folders carry the Manager
  persona (Modo Cierre). 76 accounts linked to brand intelligence (clean, no false positives).
- Tooling: `scripts/seed-cuentas.ts` + `crm/src/cuenta-seed.ts` (+ tests), `docs/SEEDING-RUNBOOK.md`,
  the whole-token relinker logic. Roster names sheet handed to the operator.

## 9. Known fix to land alongside (code)

`crm/src/register.ts copyRoleTemplate` resolves `${role}.md`, so role `gerente` looks for
`gerente.md` (absent — the template is `manager.md`); gerente folders were corrected at runtime
this session but the **code** still needs the `gerente→manager` mapping (else the next
`register-team` re-introduces the gap). Small, in-scope for the seeding workstream.
