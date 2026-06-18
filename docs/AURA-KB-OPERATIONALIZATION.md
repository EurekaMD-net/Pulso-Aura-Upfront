# Aura KB — Operationalization Design

> Status: **P0–P1 done** (2026-06-18). The Aura methodology corpus is ingested, verified, and
> normalized in `aura-kb/`. This doc is the contract for wiring it into the Pulso engine (P2–P3).
> It supersedes the "single coaching state machine / content PENDING" assumption in
> `AURA-PHASE1-DEFINITIONS.md` §6 + §8 — what landed is bigger and more structured than that spec
> imagined (see §2).

## 1. What landed

The Drive folder `aura-kb-completo.zip` (11.18 MB, verified byte-exact) unpacked to `aura-kb/`:

- **`knowledge/`** — RAG substrate. **320 brands / 969 findings** (`brand-intelligence/`), plus 1
  doctrine file (`efectividad-ise-6-factores.md`), 1 catalog (`formatos-tv-lineal.md`), and a
  `platform-intelligence/README.md`. Most doctrine actually lives in `skills/*/references/`.
- **`skills/`** — **19 skill cards** (+`_TEMPLATE`), each `SKILL.md` = activation + KB-routing
  frontmatter + methodology body, many with rich `references/` subfolders. Governed by `_RULES.md`.
- **`taxonomy/`** (7 controlled vocabularies), **`dictionaries/`** (glossary, skills-registry),
  **`sops/`** (`cierre-preventa-2027`), **`experiments/`** (learning loop).
- Counts verified exact. Validation green after the P1 fixes in §7.

## 2. The two-brain architecture

|       | **Pulso** (this repo's `engine/` + `crm/`)         | **AURA** (`aura-kb/`)                          |
| ----- | -------------------------------------------------- | ---------------------------------------------- |
| Knows | the **QUÉ** — the account, what already happened   | the **CÓMO** — doctrine, skills, effectiveness |
| Kind  | endogenous (CRM data: 28 tables, pipeline, warmth) | exogenous (curated KB + 19 skills)             |
| Role  | the runtime, retrieval, delivery, memory           | the methodology it reasons _with_              |

Pulso is the host; AURA is the brain it indexes and runs. Operationalizing = **fusing them**:
the engine's existing hybrid RAG indexes `aura-kb/knowledge/`, and the 19 skills become the
orchestration + persona layer.

## 3. The skill graph (closing path in bold)

Router **`aura-amn`** → diagnosis (`brandmap`/`buyermap`/`campaignmap`/`socialmap`; `briefer`
fast path) → **`aura-armageddon`** (orchestrator: `radiografia` → `preventa-2027` → tactical
`tv-lineal`/`ctv`/`radio`/`digital-azteca` → `tactico-comercial-excel`) → **`aura-dark`** →
**`aura-stakeholders`**. Transversals `apex`/`radar`/`ada` auto-accompany and translate jargon;
the seller never invokes them. Full plane: `aura-kb/dictionaries/skills-registry.md`.

**Phase-1 closing slice = `aura-amn` (PREVENTA mode) → `aura-armageddon` → `aura-dark` →
`aura-stakeholders`**, reading existing brand findings. All present; nothing blocks it.

## 4. Governance as code (must be enforced, not prompted)

`_RULES.md` is the constitution. Five enforcements and where they land in the engine:

| Rule                                          | Source field                                                                                            | Engine enforcement point                                                                   | Phase-1       |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------- |
| **Firewall** — intel never crosses brands     | `aislado_por_cliente` (**true on all 969**)                                                             | retrieval filter keyed to the session's active brand; "una sesión = un cliente"            | **mandatory** |
| **RBAC** — clearance floor per asset          | `rol_minimo`                                                                                            | role→clearance filter at retrieval + tool gating                                           | **mandatory** |
| **Sensibilidad** — `alta` never client-facing | `sensibilidad` (findings all `baja` today; DARK/STAKEHOLDERS are war-material via `restringido_senior`) | output/delivery boundary; never render restricted content into a client artifact           | mandatory     |
| **Sala vs 1:1 gate**                          | SOP `gate`                                                                                              | DARK/STAKEHOLDERS only in the manager's 1:1 session, never a group/sala                    | mandatory     |
| **Epistemic tiers**                           | `CERTEZA_FUERTE` / `HIPOTESIS_FUNDAMENTADA` / `HIPOTESIS_POR_VALIDAR`                                   | preserve + surface tags; never present a hypothesis as fact (reuse CRM fabrication guards) | mandatory     |

### Role-clearance lattice (the load-bearing decision)

`rol-acceso.yaml` orders the KB roles as an ascending lattice; clearance is **cumulative**:

`transversal` ⊂ `comercial_kam` ⊂ `estrategia_research` ⊂ `restringido_senior` ⊂ `direccion_clevel`

Mapping CRM roles → highest KB floor they clear:

| CRM role             | Clears up to         | Why                                                                                                   |
| -------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- |
| AE (dormant Phase 1) | `comercial_kam`      | commercial floor only                                                                                 |
| **Gerente**          | `restringido_senior` | closing companion — needs brand intel (`estrategia_research`, 724 findings) **and** DARK/STAKEHOLDERS |
| **Director**         | `restringido_senior` | same closing slice                                                                                    |
| VP (evaluator)       | `direccion_clevel`   | full clearance (`direccion_clevel` floor is currently unused)                                         |

This is what lets the closing slice stand on the research-tier corpus instead of seeing 75% of it
go dark. **Confirm this mapping before P2 wiring.**

## 5. Re-hosting: claude.ai Projects → autonomous engine

The corpus was authored for **claude.ai Projects** (human copy-pastes prompts between skills). The
engine runs it autonomously, so three translations are the substance of P3:

1. **`project_knowledge_search` → the engine's hybrid RAG** (`crm/src/doc-sync.ts`: vector KNN +
   FTS5 + RRF) over `aura-kb/knowledge/`, with the §4 filters applied at recall.
2. **Copy-paste handoffs → programmatic invocation.** The router's "Arquitectura de 3 Pasos" and
   "Modo PREVENTA" become a coaching state machine; each skill's `SKILL.md` body becomes that
   mode's system-prompt content.
3. **"Una sesión = un cliente" → a brand-scoped engine session** — which also satisfies the firewall.

Delivery reuses the existing WhatsApp surface scoped to Gerente/Director.

## 6. Phased plan

- **P0 — Acquire** ✅ corpus in `aura-kb/`, verified 320/969/19, zip gitignored.
- **P1 — Governance + taxonomy as code** ✅ taxonomy reconciled, naming fixed, router reconciled,
  role-clearance lattice defined (§4). See §7.
- **P2 — Index `knowledge/` into the hybrid RAG** ✅ **BUILT 2026-06-18** — schema governance
  columns + `marca_norm`, `aura-kb-sync.ts` ingester (`npm run sync:aura-kb`), `aura-rbac.ts`
  clearance lattice, `searchAuraKb` firewall+RBAC at recall; the Drive path excludes `source='aura-kb'`
  so VP's unfiltered search can't bypass it. Detail + audit fixes in `AURA-P2-PLAN.md`.
  **Deploy-time:** point `EMBEDDING_MODEL` at a live 1024-dim provider, then
  `npm run sync:aura-kb -- --reindex` to embed the 969 findings.
- **P3 — Closing slice as a coaching mode**: encode `aura-amn` PREVENTA → ARMAGEDDON → DARK →
  STAKEHOLDERS using the SKILL.md bodies; light up for Gerente/Director; rest dormant behind the
  acceptance gate.
- **Later** — author the 9 deferred skills (§7) if the full preventa motion comes into scope;
  wire the `experiments/` learning loop.

## 7. P1 change log (what was normalized vs. delivered)

The corpus is committed **verbatim first**, then these P1 fixes (auditable in git):

- **Naming:** renamed 2 brand folders with spaces → kebab-case (`neurobion-doloneurobion-…`,
  `canesten-v`); fixed the matching row in `COBERTURA_GLOBAL.md`. _(Note: both folders internally
  mix several `marca:` identities — a content-conflation question for the operator, left as-is.)_
- **Taxonomy** (per CONVENTIONS "add the value first"): added `estable` (503 findings) to
  `estabilidad.yaml`; added `campanas_temporalidades` (245) and `inteligencia_social` (221) to
  `cuerpo.yaml`. Validation now green: every value in-vocab.
- **Router prose reconciled** (`skills/aura-amn/SKILL.md`): cut 9 skills named in prose that don't
  exist in the shipped 19 (`propuestas-360`, `nexus-ctv`, `azteca-digital`, `futbol-liga-mx`,
  `aria`, `geo-authority`, `estrategico-maestro-word`, `imagenes-storyboards`,
  `estructura-presentacion-ppt`). They survive only inside an explicit "deferred availability"
  note, so the cut is reversible. Other 18 cards reference no phantoms.

## 8. Open decisions

1. **Role-clearance mapping (§4)** — confirm Gerente + Director clear `restringido_senior`.
2. **Brand conflation** — are `neurobion`/`dolo-neurobion` and `canesten`/`canesten-v`/`salud-íntima`
   one brand each or several? Affects firewall granularity.
3. **Deferred skills** — author the 9 later, or leave the full preventa motion out of scope?
