# Aura P3 — Plan (make the agent USE the corpus)

> Prereq: P2 done + deployed (`AURA-P2-PLAN.md`). The Aura corpus is in `crm.db` (971 docs / 320
> brand_keys / 17,986 Fireworks chunks), retrievable via `searchAuraKb({ brand, role })` with the
> firewall (brand_key) + RBAC enforced and verified. **P2 made it retrievable; P3 makes the closing
> companion actually call it and run the Aura methodology.** Phase-1 scope = Gerente + Director.

## The substrate P3 builds on

- `crm/src/doc-sync.ts` → `searchAuraKb(query, { brand, role, limite? })` — firewall + RBAC, fail-closed.
  `brand` = the brand-intelligence folder slug (brand_key).
- `crm/src/aura-rbac.ts` → `clearedFloors(role)` / `clears(role, floor)` for the clearance lattice.
- Engine tool surface: handlers in `crm/src/tools/<module>.ts`, registry `crm/src/tools/index.ts`
  (role-based filtering: ae/gerente/director/vp), role templates `crm/groups/*.md`. Adding a tool =
  4 layers (handler, registry + role set, templates, count tests) — see CLAUDE.md "Adding a new tool".
- The skill bodies + routing live in `aura-kb/skills/<skill>/SKILL.md` + `dictionaries/skills-registry.md`.

## Increments (build in order; each ships + tests independently)

### P3.0 — Brand resolution + the retrieval tool ✅ DONE (`8789a80`, `8687602`)

The agent must turn a seller's free-text brand ("Coca Cola", "bonafont") into a `brand_key`, then call
`searchAuraKb`. Two pieces:

1. **`resolveBrandKey(input)`** (new, e.g. `crm/src/aura-brand.ts`): map free text → brand_key.
   Strategy, in order: exact `brand_key` match on slugified input; `marca_norm` match (normalizeMarca)
   → its brand_key; prefix/contains on brand_key; return `{ brandKey, candidates[] }` (ambiguous → list
   so the agent can disambiguate). All from `crm_documents` (source='aura-kb'). Pure SQL + JS, unit-test
   it (Coca Cola → coca-cola-\*, accents, ambiguous "bonafont" → the 3 bonafont keys).
2. **Tool `buscar_inteligencia_marca(marca, consulta)`** (`crm/src/tools/aura.ts`): resolve the brand,
   call `searchAuraKb` with `ctx.rol`, return findings (titulo, fragmento, cuerpo, similitud). If the
   brand is ambiguous/unknown, return the candidate list instead of guessing. Register for **gerente +
   director only**; add to `crm/groups/{manager,director}.md`; bump tool-count tests.

Acceptance: a Gerente can pull a brand's intelligence in one tool call; firewall/RBAC inherited from
P2; ambiguous brand returns choices, not a wrong brand.

### P3.1 — Coaching mode scaffold (the router as a persona mode) ✅ DONE

Encode `aura-amn`'s PREVENTA logic as a Gerente/Director **coaching mode** in the persona prompt:
recognize a closing/preventa intent, confirm the brand (via P3.0), present the 3-step architecture,
and drive turn-by-turn (it's a coaching dialogue, not a doc generator — per `AURA-PHASE1-DEFINITIONS.md`
§8). Source the mode text from `aura-kb/skills/aura-amn/SKILL.md` (reconciled to the real 19 skills).

**Done:** `### Modo Cierre (Preventa 2027)` block added under `## Comportamiento` in `crm/groups/manager.md`

- `director.md` (NOT `global.md` — closing mode is genuinely Ger/Dir-only; `global.md` is read by all
  4 roles). Re-host reconciliations: `project_knowledge_search` → `buscar_inteligencia_marca`; copy-paste
  skill-handoffs dropped (one agent drives the dialogue); PREVENTA recognition encoded as trigger phrases
  (engine-native, mirroring the briefing-trigger pattern). Guardrails: always-multimedia, never-fabricate
  (honors the tool's `encontrada:false`), ambiguous→ask (`ambigua:true`), **synthesize don't dump raw JSON**,
  closing material stays internal/1:1, one-brand-per-thread. Gated at **two layers**: registry (`buscar_inteligencia_marca`
  ∈ GERENTE_TOOLS + DIRECTOR_TOOLS only — VP/AE lack it) + prose (drift-guard test asserts the closing anchors
  present in both Ger/Dir templates, absent in `ae.md`/`vp.md`). qa-auditor PASS (no Critical/Warning).
  Tests: `templates.test.ts` +32 closing-mode assertions (95 in-file, all green). No source code / no new tool.
  P3.1 runs recognition + architecture + **Step 1 (intelligence pull) live**; the deep ARMAGEDDON/DARK/STAKEHOLDERS
  read-paths land in P3.2/P3.3. **NEXT = P3.2.**

### P3.2 — ARMAGEDDON read-path (diagnosis → opportunity) ✅ DONE

Wire the closing flow to READ existing brand findings (the 4 cuerpos) via P3.0 and assemble the
radiografía → preventa-2027 narrative. Skill bodies: `radiografia`, `preventa-2027`. (Build path =
read-first; the 4 mapping skills only run if findings are missing — they already exist for 320 brands.)

**Done:** the 4 cuerpos are deterministically tagged (`crm_documents.cuerpo` ∈ `diagnostico_9fuentes`,
`buyer_personas`, `campanas_temporalidades`, `inteligencia_social`) → the read-path is a **deterministic
pull by `brand_key` + `cuerpo`**, not semantic search. `radiografiaForBrand(brandKey, role)` in
`doc-sync.ts` returns `{ dimensiones, faltantes }` (firewall on `brand_key`, RBAC on `rol_minimo` via
`clearedFloors`; body reassembled from `crm_embeddings` by `chunk_index`). Tool `armar_radiografia_marca(marca)`
(Ger/Dir only) wraps it (resolveBrandKey reuse: ambiguous→opciones, unknown→encontrada:false, partial→mensaje).
Modo Cierre Paso 1 extended in manager/director.md with the radiografía (6 ROAS factors, **diagnoses-not-prescribes**,
whitespaces) → preventa-2027 thesis (**defend 2027 volume factor-by-factor, not reach**; año non/no Mundial).
qa-auditor PASS — firewall is intentionally **stricter** than `searchAuraKb` (mandatory `brand_key`, no
`aislado`-flag branch → closes the P2 content-trust weakness). `aura-radiografia.test.ts` (pull/reassembly/
faltantes/firewall/RBAC) + tool tests; counts Ger 56→57, Dir 67→68, unique 72→73. **NEXT = P3.3.**

### P3.3 — DARK / STAKEHOLDERS (the closing slice, restringido_senior) ✅ DONE

The war-room slice: `aura-dark` (committee/sequence/negotiation) → `aura-stakeholders` (person-by-person).
Gated to `restringido_senior` (Gerente/Director clear it). Enforce the sala-vs-1:1 gate (never to the
group/client) at the delivery boundary.

**Done — PROMPT-ONLY (no tool/code/ingestion).** Key structural fact: DARK/STAKEHOLDERS are **method-only**
skills — there is NO per-brand war-room content (every brand folder has only the 4 diagnostic cuerpos) and
the corpus has **zero `restringido_senior` data** (all brand content ≤ `estrategia_research`). So there's
nothing to _retrieve_; P3.3 re-hosts the **method** as two new Modo Cierre steps in manager.md + director.md:
**Paso 2 — DARK** (3 altitudes Campaña/Cuenta/Sala, architect-of-consensus, the Vértice clock = pre-close
volume before the rival's upfront [2-4mo window], posture-is-platform, science-vs-folklore, ethics-as-calculation)
and **Paso 3 — STAKEHOLDERS** (person-as-unit, ponderar the 3 who really decide, per-person ficha
[driver/barrier/what-they-must-hear], mold-not-fabricate, dos-pistas sala-vs-1:1 with the −59%-if-hyperpersonalized
rule; built on the radiografía's buyer-personas). The **never-to-client gate** is hardened (material interno de
guerra, jamás al cliente/grupo). **Gating is structural** — the war-room lives only in the Ger/Dir personas
(the restringido_senior-clearing roles); the gate test excludes `Sala Invisible`/`Material interno de guerra`/
`(DARK)`/`STAKEHOLDERS` from `ae.md`/`vp.md`. qa-auditor PASS — every load-bearing claim (incl. the −59% and the
2-4-month window) traces **verbatim** to the source skills; zero invented stats. Drift-guard: +8 closing anchors
in both role files (`templates.test.ts`, 125 in-file green); `tsc` clean. No count bumps (no tool).
**Deferred enhancement:** ingest the DARK/STAKEHOLDERS references (`doctrina_vertice`, `cinco_frentes`,
`mapa_stakeholders`, …) as retrievable **general doctrine** (brand_key NULL, `rol_minimo=restringido_senior`) +
a method-retrieval tool — only if the in-persona coaching depth proves insufficient. **NEXT = P3.4.**

### P3.4 — Proactive trigger + delivery

Proactive near-close nudge (reuse pipeline `etapa` + an overnight-style scan) and WhatsApp delivery
scoped to Gerente/Director. The acceptance gate (§7 of the spec) decides "fledge fully".

## Deferred / dependencies

- The 9 phantom skills (cut from the router prose in P1) stay deferred unless the full preventa motion
  (PUSH/PULL day-to-day, multi-deliverable) comes into scope.
- Tactical Excel (`tactico-comercial-excel`) + the 4 media skills are post-closing-slice.
- A `--reindex` re-deploy is only needed when corpus content changes (not for P3 code).

## Open questions for the operator

1. Brand disambiguation UX: when "bonafont" matches 3 brand_keys, ask the seller to pick, or default to
   the highest-coverage one?
2. Does the closing companion surface raw findings, or only the synthesized coaching narrative?
3. Acceptance criteria for the §7 gate (what makes Gerente/Director + VP say "fledge fully").
