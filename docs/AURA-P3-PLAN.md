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

### P3.5 — Anunciante portfolio layer ✅ DONE (must-have, added 2026-06-19)

Operator insight: the Upfront deal is closed with the **ANUNCIANTE** (advertiser), not the brand —
one budget, one committee, across the advertiser's whole brand portfolio. Aura was per-brand with no
advertiser concept (`categoria=por_definir` for all 969 findings); the CRM had the deal side (`cuenta`
= anunciante, `contacto` = committee, `contrato` = deal) but **no brand linkage**. P3.5 builds the bridge.

**Done.** (1) **Research:** 3 parallel agents derived `brand_key → anunciante + grupo` for all 320 brands,
grounded in each diagnostico (trust finding over slug) + web, with provenance — **0 nulls, 298 alta / 22
media**, 39 multi-brand portfolios (P&G 24, Nestlé 13, Danone 11…). Artifact: `aura-kb/anunciantes/brand-anunciante-map.json`
(commit `2178913`). (2) **Data:** `anunciante_marca` registry table + `cuenta.anunciante` link cols
(Phase-13 migration) + `syncAnuncianteMap` ingester (`npm run sync:anunciante-map`, pure upsert, no re-embed).
**Loaded + smoke-tested on the live DB: 320/320 brand_keys join to corpus docs, 0 orphans.** (3) **Retrieval:**
`resolveAnunciante` (ambiguous→candidates), `radiografiaForAnunciante` (portfolio rollup — per-brand cuerpo
availability + a bounded ≤600-char resumen, NOT full bodies; firewall/RBAC inherited per brand),
`committeeForAnunciante` (the real `contacto` committee). (4) **Tools (Ger/Dir):** `armar_radiografia_anunciante`
(portfolio) + `mapa_poder_anunciante` (STAKEHOLDERS over the real committee). (5) **Flow refactor:** Modo Cierre
now **anchors on the anunciante** — movement 1 confirms the advertiser + portfolio, Paso 1 = portfolio rollup →
per-brand drill-down → the **necesidad GLOBAL del anunciante** (the CFO allocates one budget to the portfolio,
not brand-by-brand), STAKEHOLDERS uses the real committee. "Una marca por hilo" → "Un anunciante por hilo".
qa-auditor **PASS** (firewall/RBAC airtight, no cross-advertiser leak). Counts Ger 57→59, Dir 68→70, unique 73→75,
tables 28→29; `anunciante.test.ts` (18 tests) + drift anchors; 291 affected tests green; `tsc` clean.

**Wiring-pending (tracked, degrade gracefully):** `cuenta.anunciante_norm` is not yet populated by any code path
(cuentas are empty in clean-start), so `mapa_poder_anunciante` returns `sin_comite` (→ coach from method) until
accounts are registered/linked to an anunciante. The account-registration flow should set `cuenta.anunciante`.

### P3.4 — Proactive trigger + delivery ✅ DONE

Proactive near-close nudge (reuse pipeline `etapa` + an overnight-style scan) and WhatsApp delivery
scoped to Gerente/Director. The never-to-client gate becomes **code** at the delivery boundary.

**Done.** Rides the existing `escalation.ts` rail (same `alerta_log` dedup + `registeredGroups()`
folder→jid + `deps.sendMessage`), so no new transport. (1) **Detection:** `nearcloseClusters()` in
`crm/src/nearclose.ts` — SQL sweep of `propuesta WHERE etapa IN ('en_negociacion','confirmada_verbal')`
(the closing zone; excludes early `en_discusion`, won `orden_recibida`, terminal), joined to `ae.reporta_a`
(the coach) and `cuenta`. **Anchored on the anunciante** (P3.5): groups by **(gerente, anunciante)**;
degrades to per-`cuenta` when `cuenta.anunciante_norm` is null (clean-start). (2) **Never-to-client gate
as code:** `resolveCoachingRecipient(personaId, deps)` — the ONLY path to a jid is an internal `persona`
with `rol ∈ {gerente,director}`, active, with a registered group. A `contacto` (client) has no `persona`
row → `not_a_persona` → blocked; AE/VP → `role_out_of_scope`; nothing reads `contacto.telefono`. qa-auditor
verified the gate **structurally airtight** (six sequential guards, jid assigned only on the all-pass path).
(3) **Nudge:** `composeNudge` — seller-language coaching (synthesize, never dump JSON), points to
`armar_radiografia_anunciante` + `mapa_poder_anunciante`, footer "_Material interno de guerra — jamás al
cliente ni al grupo._" (4) **Schedule:** one declarative entry in the unified `scheduler.ts` SCHEDULES
table (`crm_nearclose_coaching`, cron `0 7 * * 1` = Mon 7 AM MX; weekly cadence makes the daily `alerta_log`
dedup naturally once-per-cluster-per-week, no spam) → IPC case → `evaluateNearcloseCoaching(deps)`. No new
scheduler file, no engine change. (5) **Persona:** a "Disparador proactivo" line in manager/director.md so a
nudge-reply is recognized as closing intent (preserves the never-to-client framing). **No tool/schema/count
changes** (reuses `alerta_log`/`propuesta`/`cuenta`). `nearclose.test.ts` (20 tests — detection scope, the
gate's six branches incl. a contacto-with-real-phone, anunciante grouping + null-degrade, message contract,
dedup, sweep) + `templates.test.ts` +1 anchor; tsc clean. qa-auditor **PASS WITH WARNINGS** (0 Critical;
low-effort warnings applied — `STALE_DAYS` const, `::` entityId delimiter, dedup-design + count-semantics
docs). **Deferred (tracked, demo-safe at clean-start volume):** per-sweep/per-coach nudge cap before
real-volume deploy (W3/I2 — avoid blasting a coach on a data-quality spike); per-send timeout (mirrors the
`escalation.ts` rail, which also has none). **§7 acceptance gate** ("fledge fully") is an operator decision
after a deployed pilot — can't be validated live while the service is undeployed.

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
