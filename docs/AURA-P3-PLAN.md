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

### P3.2 — ARMAGEDDON read-path (diagnosis → opportunity)

Wire the closing flow to READ existing brand findings (the 4 cuerpos) via P3.0 and assemble the
radiografía → preventa-2027 narrative. Skill bodies: `radiografia`, `preventa-2027`. (Build path =
read-first; the 4 mapping skills only run if findings are missing — they already exist for 320 brands.)

### P3.3 — DARK / STAKEHOLDERS (the closing slice, restringido_senior)

The war-room slice: `aura-dark` (committee/sequence/negotiation) → `aura-stakeholders` (person-by-person).
Gated to `restringido_senior` (Gerente/Director clear it). Enforce the sala-vs-1:1 gate (never to the
group/client) at the delivery boundary.

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
