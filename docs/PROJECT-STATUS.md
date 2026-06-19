# Pulso — Project Status

> ## ⚠️ FORK NOTICE — Pulso-Aura-Upfront (2026-06-15)
>
> This repo is an **independent fork** of `EurekaMD-net/crm-pulso`, created to wake the
> system up for **TV Azteca**. **Phase 1 = "Azteca-Aura", a CLOSING COMPANION** for
> **Directores + Gerentes only**, scoped to **Upfront 2027** (selling season Aug 2026 →
> Feb 2027): help tell a good story + elaborate closing arguments via the **Aura
> methodology** (core IP — **LANDED + ingested 2026-06-18** in `aura-kb/`; design in
> **`docs/AURA-KB-OPERATIONALIZATION.md`**, next step **`docs/AURA-P2-PLAN.md`**). Full scope:
> **`docs/AURA-PHASE1-DEFINITIONS.md`**.
> Fork + clean-start lessons: **`docs/LEARNINGS-2026-06-15.md`**, **`docs/LEARNINGS-2026-06-18.md`**.
>
> Everything **below this banner is INHERITED status** from the crm-azteca / Imagen-TV
> base (full CRM, agentic-crm service, crm-backup/mirror) — much of it no longer applies
> to this fork (the service was undeployed and `crm-azteca` wiped to code-only in the
> clean-start). Treat the body as the capability inventory we forked from, not live state.

> Quick-retrieval status file. Updated each `/session-wrap`.
> Last updated: 2026-06-19 (**Aura P3.4 SHIPPED — the proactive near-close trigger + WhatsApp delivery, with the never-to-client gate as code.** The closing companion now reaches OUT instead of only answering. Rides the existing `escalation.ts` rail (same `alerta_log` dedup + `registeredGroups()` folder→jid + `deps.sendMessage`) — no new transport. **(1) Detection:** `nearcloseClusters()` in new `crm/src/nearclose.ts` sweeps `propuesta WHERE etapa IN ('en_negociacion','confirmada_verbal')` (the closing zone; excludes early `en_discusion`, won `orden_recibida`, terminal), joined to `ae.reporta_a` (the coach) + `cuenta`. **Anchored on the anunciante** (P3.5): groups by **(gerente, anunciante)**, degrading to per-`cuenta` when `anunciante_norm` is null (clean-start). **(2) Never-to-client gate as CODE:** `resolveCoachingRecipient(personaId, deps)` — the ONLY path to a jid is an internal `persona` with `rol ∈ {gerente,director}`, active, registered group; a `contacto` (client) has no `persona` row → blocked; AE/VP → out of scope; **nothing reads `contacto.telefono`**. qa-auditor verified **structurally airtight** (six sequential guards; jid assigned only on the all-pass path). **(3) Nudge:** `composeNudge` — seller-language coaching (synthesize, never dump JSON), points to `armar_radiografia_anunciante` + `mapa_poder_anunciante`, footer "_Material interno de guerra — jamás al cliente ni al grupo._" **(4) Schedule:** ONE declarative entry in the unified `scheduler.ts` SCHEDULES table (`crm_nearclose_coaching`, cron `0 7 * * 1` = Mon 7 AM MX; weekly cadence → daily `alerta_log` dedup is naturally once-per-cluster-per-week) → IPC case → `evaluateNearcloseCoaching(deps)`. No new scheduler file, no engine change. **(5) Persona:** a "Disparador proactivo" line in manager/director.md so a nudge-reply is recognized as closing intent (preserves never-to-client framing). **No tool/schema/count changes** (reuses `alerta_log`/`propuesta`/`cuenta`). `nearclose.test.ts` (20 — gate's six branches incl. contacto-with-real-phone, detection scope, anunciante grouping + null-degrade, message contract, dedup, sweep) + `templates.test.ts` +1 anchor; tsc clean; 23 ipc-handler tests green. **qa-auditor PASS WITH WARNINGS** (0 Critical; low-effort warnings applied — `STALE_DAYS` const, `::` entityId delimiter, dedup-design + count-semantics docs). Deferred (demo-safe at clean-start volume): per-sweep nudge cap before real-volume; per-send timeout (mirrors the rail). **§7 "fledge fully" gate = operator decision after a deployed pilot** (service undeployed). Learnings §16 in `LEARNINGS-2026-06-19-P3.md`. **P3 closing-companion arc COMPLETE (P3.0→P3.5).** Earlier P3.5 entry below)
> Last updated: 2026-06-19 (**Aura P3.5 SHIPPED — the ANUNCIANTE portfolio layer (operator-identified must-have).** The Upfront deal is closed with the **anunciante** (advertiser), not the brand — one budget, one committee, across the whole brand portfolio. Aura was per-brand with NO advertiser concept (`categoria=por_definir` for all 969 findings); the CRM had the deal side (`cuenta`=anunciante, `contacto`=committee) but **no brand linkage**. P3.5 builds the bridge + rollup + wires STAKEHOLDERS to the real committee. **(1) Research:** 3 parallel agents derived `brand_key→anunciante+grupo` for all 320 brands, grounded in each diagnostico (trust finding over slug, e.g. abuelita→Nestlé, ades→Coca-Cola FEMSA vs bonafont→Danone) + web, with provenance — **0 nulls, 298 alta/22 media**, 39 multi-brand portfolios (P&G 24, Nestlé 13, Danone 11…). Artifact `aura-kb/anunciantes/brand-anunciante-map.json` (commit `2178913`). **(2) Data:** `anunciante_marca` registry + `cuenta.anunciante` link cols (Phase-13) + `syncAnuncianteMap` ingester (`npm run sync:anunciante-map`, pure upsert). **Loaded + smoke-tested on the live 206MB DB: 320/320 brand_keys join to corpus, 0 orphans; P&G resolves to its 25-brand portfolio.** **(3) Retrieval:** `resolveAnunciante`, `radiografiaForAnunciante` (portfolio rollup — per-brand availability + bounded ≤600-char resumen, NOT full bodies; firewall/RBAC inherited per brand), `committeeForAnunciante` (real `contacto`). **(4) Tools (Ger/Dir):** `armar_radiografia_anunciante` + `mapa_poder_anunciante`. **(5) Flow refactor:** Modo Cierre now **anchors on the anunciante** — confirm advertiser+portfolio → per-brand drill-down → **necesidad GLOBAL del anunciante** (CFO allocates ONE budget to the portfolio, not brand-by-brand) → STAKEHOLDERS over the real committee. "Una marca por hilo"→"Un anunciante por hilo". **qa-auditor PASS** (firewall/RBAC airtight, no cross-advertiser leak; 2 Warnings = integration gaps). Counts Ger 57→59, Dir 68→70, unique 73→75, tables 28→29; `anunciante.test.ts` (18) + drift anchors; 291 affected tests green; `tsc` clean. **Wiring-pending:** `cuenta.anunciante_norm` not yet populated (cuentas empty) → committee path returns `sin_comite` (coach-from-method) until account registration sets it. Learnings §13-15 in `LEARNINGS-2026-06-19-P3.md`. NEXT = **P3.4 proactive trigger + WhatsApp delivery**. Earlier P3.3 entry below)
> Last updated: 2026-06-19 (**Aura P3.3 SHIPPED — the DARK / STAKEHOLDERS war-room slice. PROMPT-ONLY.** Key structural fact: DARK/STAKEHOLDERS are **method-only** skills — NO per-brand war-room content (every brand folder has only the 4 diagnostic cuerpos) and the corpus has **zero `restringido_senior` data** (all ≤ `estrategia_research`), so there's nothing to _retrieve_. P3.3 re-hosts the **method** as two new Modo Cierre steps in manager/director.md: **Paso 2 — DARK** (3 altitudes Campaña/Cuenta/Sala, architect-of-consensus not the alpha closer, the Vértice clock = pre-close volume before the rival's upfront [2-4mo window], posture-is-platform, science-vs-folklore, ethics-as-calculation) and **Paso 3 — STAKEHOLDERS** (person-as-unit, ponderar the 3 who really decide, per-person ficha [driver/barrier/what-they-must-hear], **mold-not-fabricate**, dos-pistas sala-vs-1:1 with −59%-if-hyperpersonalized; built on the radiografía's buyer-personas). **Never-to-client gate hardened** (material interno de guerra, jamás al cliente/grupo). **Gating is structural** — war-room lives only in the Ger/Dir personas (the restringido_senior-clearing roles); gate test excludes `Sala Invisible`/`Material interno de guerra`/`(DARK)`/`STAKEHOLDERS` from `ae.md`/`vp.md`. **qa-auditor PASS** — every load-bearing claim (incl. the −59% and the 2-4-month window) traces **verbatim** to the source skills; zero invented stats. Drift-guard +8 closing anchors in both role files (`templates.test.ts`, 125 in-file green); `tsc` clean. No new tool/code/ingestion, no count bumps. Deferred: ingest DARK/STAKEHOLDERS references as retrievable `restringido_senior` doctrine + a method-retrieval tool, only if in-persona depth proves insufficient. Learnings §11-12 in `LEARNINGS-2026-06-19-P3.md`. NEXT = **P3.4 proactive trigger + WhatsApp delivery** (+ the sala-vs-1:1 gate hard-enforced at the delivery boundary). Earlier P3.2 entry below)
> Last updated: 2026-06-19 (**Aura P3.2 SHIPPED — the ARMAGEDDON read-path (radiografía → preventa-2027).** The 4 diagnostic cuerpos are deterministically tagged (`crm_documents.cuerpo` ∈ diagnostico_9fuentes / buyer_personas / campanas_temporalidades / inteligencia_social), so the read-path is a **deterministic pull by `brand_key` + `cuerpo`**, NOT semantic search. New `radiografiaForBrand(brandKey, role)` in `doc-sync.ts` → `{ dimensiones, faltantes }` (firewall on `brand_key`, RBAC on `rol_minimo` via `clearedFloors`; body reassembled from `crm_embeddings` by `chunk_index`). New tool `armar_radiografia_marca(marca)` (Gerente/Director only) wraps it (resolveBrandKey reuse: ambiguous→opciones, unknown→encontrada:false, partial→mensaje). Modo Cierre **Paso 1** extended in manager/director.md with the radiografía method (**6 factores causales del ROAS**, diagnoses-not-prescribes, whitespaces) → preventa-2027 thesis (**defend 2027 volume factor-by-factor, not reach**; año non, sin Mundial). **qa-auditor PASS** — the new firewall is intentionally **stricter** than `searchAuraKb` (mandatory `brand_key`, no `aislado`-flag branch → closes the P2 content-trust weakness); zero invented claims vs the source skills. New `aura-radiografia.test.ts` (pull / reassembly-order / faltantes / firewall / RBAC) + tool tests; counts Ger 56→57, Dir 67→68, unique 72→73; `tsc` clean, 167 affected tests green. Learnings appended to `LEARNINGS-2026-06-19-P3.md`. NEXT = **P3.3 DARK/STAKEHOLDERS** (restringido_senior, sala-vs-1:1 gate). Earlier P3.0+P3.1 entry below)
> Last updated: 2026-06-19 (**Aura P3.0 + P3.1 SHIPPED — the agent can now retrieve AND coach a brand's closing.** P3.0: `resolveBrandKey()` (free-text marca → `brand_key` folder slug) + agent tool `buscar_inteligencia_marca` (Gerente/Director only; inherits the P2 firewall+RBAC; ambiguous→options, unknown→`encontrada:false`) — commits `8789a80`, `8687602`. P3.1: re-hosted `aura-amn`'s PREVENTA logic as a **`### Modo Cierre (Preventa 2027)`** coaching mode in `crm/groups/manager.md` + `director.md` (recognize trigger phrases → confirm brand via the tool → present the 3-step architecture **ARMAGEDDON → DARK → STAKEHOLDERS** → drive turn-by-turn; coaching, not a doc generator, per §8). Placed in the role files, NOT `global.md` (closing mode is genuinely Ger/Dir-only; `global.md` is read by all 4 roles). Re-host reconciliations: `project_knowledge_search`→the tool, copy-paste skill-handoffs dropped, PREVENTA recognition as trigger phrases. Guardrails: always-multimedia, never-fabricate, ambiguous→ask, **synthesize don't dump raw JSON**, closing material internal/1:1, one-brand-per-thread. Gated at **two layers**: registry (tool ∈ GERENTE/DIRECTOR_TOOLS only — AE/VP lack it) + prose (drift-guard test: closing anchors present in both Ger/Dir templates, absent in `ae.md`/`vp.md`). **qa-auditor PASS** (no Critical/Warning). `templates.test.ts` +32 closing-mode assertions, all green; `tsc` clean. No source code / no new tool in P3.1. Learnings: `LEARNINGS-2026-06-19-P3.md`. NEXT = **P3.2 ARMAGEDDON read-path**. Earlier P2-firewall-fix entry below)
> Last updated: 2026-06-18 (**Aura P2 firewall fix + re-index DONE; P3 planned.** Operator challenged "684 brands" → it was distinct `marca` STRINGS (real brand count = **320 folders**); the marca-keyed firewall **under-retrieved** — 254/320 folders (79%) disagree on `marca` across their findings (typos `Lievité`, accents, mojibake `Levit#U00e9`, wording) → a session silently missed 50–75% of its own brand. **FIXED:** firewall now keys on **`brand_key` = the brand-intelligence folder slug** (`searchAuraKb({brand,role})`, `brandKeyForFile()`, schema `brand_key` col + migration; also fixed a latent CREATE-block-index-before-ALTER migration bug). Live DB backfilled via `backfillBrandKeys()` (**pure UPDATE, no re-embed**) → 320 clean brand keys, VERIFY PASS, 0 leak. Cleaned `#UXXXX` mojibake in 257 source files (99% in non-indexed `archivo_origen`; 12 indexed titulos). Full **`--reindex` re-deploy done**: all 17,986 chunks re-embedded via Fireworks (0 fallbacks), VERIFY PASS — live index now clean + brand_key. 826 tests green; commit `53213e0` + this doc batch. **P3 planned (`AURA-P3-PLAN.md`): P3.0 brand-resolution + `buscar_inteligencia_marca` tool → P3.1 coaching mode → ARMAGEDDON → DARK/STAKEHOLDERS.** Learnings: `LEARNINGS-2026-06-18-P2.md`. Earlier P2-SHIPPED entry below)
> Last updated: 2026-06-18 (**Aura P2 SHIPPED — RAG indexing + firewall/RBAC at recall.** Built the aura-kb retrieval substrate inside the engine: governance columns (marca, marca_norm, rol_minimo, sensibilidad, aislado_por_cliente, cuerpo, estabilidad, tier_evidencia) on `crm_documents` + a CHECK-rebuild migration; `crm/src/aura-kb-sync.ts` ingester (flat-YAML frontmatter parser, idempotent, clean-reindex; `npm run sync:aura-kb`); `crm/src/aura-rbac.ts` cumulative clearance lattice + `normalizeMarca`; `searchAuraKb` in `doc-sync.ts` enforcing **firewall** (brand-locked on normalized `marca_norm`, NOT the operator-supplied `aislado` flag) + **RBAC** (`rol_minimo ∈ cleared floors`) + fail-closed on no brand; Drive RAG now excludes `source='aura-kb'` so VP's unfiltered search can't bypass governance. Embedding provider is already env-configurable (`EMBEDDING_URL`/`EMBEDDING_MODEL`) — Fireworks-ready. qa-auditor pass found **2 Criticals** (firewall trusted the flag; ungoverned README/no-rol_minimo files indexable) + W3 (ASCII LOWER vs accents) + W4 — all fixed and regression-tested. typecheck clean; **1240 tests green** (`--changed`); `npm run build` OK. **Deploy:** point `EMBEDDING_MODEL` at a live 1024-dim provider, then `npm run sync:aura-kb -- --reindex` to embed the 969 findings. NEXT = P3 (coaching state machine + wire `searchAuraKb` to an agent tool). Plan: `docs/AURA-P2-PLAN.md`. Earlier same-day below)
> Last updated: 2026-06-18 (**Aura methodology LANDED.** Acquired the `aura-kb` corpus from Drive (11.18 MB zip, byte-verified), ingested + normalized into `aura-kb/`: **320 brands / 969 findings / 19 skills**, counts exact. P1 done — taxonomy reconciled (validation green), 2 brand folders kebab-fixed, router prose cut to the real 19 (9 phantom skills → reversible deferred note); governance read off the data (firewall **universal** 969/969 `aislado_por_cliente=true`; `rol_minimo` cumulative lattice; `direccion_clevel` unused). Design contract: `AURA-KB-OPERATIONALIZATION.md` (two-brain Pulso⊕AURA, governance-as-code, CRM↔KB role-clearance lattice, claude.ai-Projects→engine re-hosting). Spec reconciled (`AURA-PHASE1-DEFINITIONS.md` §status+§6: methodology is a 19-skill system, not one prompt slot). **No engine code touched** — corpus + docs only; P2 (`AURA-P2-PLAN.md`) wires `knowledge/` into the hybrid RAG with firewall+RBAC filters. Commits `4f25a68` (corpus), `3c7e81d` (design), + this doc/learnings/P2-plan batch. Earlier 2026-05-05)
> Last updated: 2026-05-05 (Inference provider migration: DashScope deprecated operator's paid plan, primary moved to **Fireworks AI** for `accounts/fireworks/models/qwen3p6-plus` — sole Western host of proprietary Qwen 3.6 Plus, $0.50 in / $3.00 out per 1M. Fallback moved to **Groq** `qwen/qwen3-32b` (OSS, $0.29 in / $0.59 out, sub-second). Bootstrap allowlist at `crm/src/bootstrap.ts:20` extended with `api.fireworks.ai`. CRM live; first WhatsApp test message returned full structured response in ~27s end-to-end. **Hindsight LLM also migrated** in third pass — was stuck in 22h startup-restart loop because Docker bakes env at container creation (`docker run -e`) and `--restart unless-stopped` was relaunching the same dead DashScope key on every cycle; `crm-ctl hindsight-stop && hindsight-start` cycle re-baked Fireworks env, container now healthy on `accounts/fireworks/models/qwen3p6-plus` for consolidation (~6× slower per call than dashscope's qwen3-coder-plus but async). VPS also upgraded to Hostinger KVM4 same day — 4 CPU / 15Gi RAM / 193G disk, all services rebooted clean. Migration scripts at `/root/configure-fallbacks.sh` + `/root/rotate-hindsight-fireworks.sh`. Lessons captured in `feedback_provider_migration_qwen` memory (now 6 lessons, added "Docker `--restart` policy bakes env at creation time" lesson 5b). Earlier 2026-04-26)
> Last updated: 2026-04-26 (engine evolution arc closed. Phases 1 + 2 fully shipped; Phase 3 deferred indefinitely as pull-driven per original doctrine. Engine is a permanent fork of NanoClaw. Phase 1 (`799b6b9`): deleted 86 vestigial artifacts, re-anchored docs as fork owner. Phase 2a (`24dcec6`): container resource limits via env (`CONTAINER_MEMORY`/`CPUS`/`PIDS_LIMIT`, defaults 512m/1/256, `--pids-limit` closes audit gap, `'0'` skips flag). Phase 2b (`3ee0c7e`): bootstrap sequence extracted to `engine/src/bootstrap.ts`. Phase 2c (`38dbf53`, Option B): container active visibility — `getActiveContainers()` + 5-min periodic log + localhost-only `GET /api/v1/containers/active`. **Phase 3 closed with no items pulled** — the four candidates (per-group resource quotas, per-container CPU/mem observability, end-to-end streaming, image/voice improvements) stay on the shelf as "what we'd build if needed," each with a specific trigger documented in `docs/ENGINE-EVOLUTION-2026-04-26.md`. Re-open only when a real CRM pain point hits one of those triggers. **All 1183 tests, 67 test files green** (1166 baseline + 17 across Phase 2). Audit fully closed. Only deferred audit §7 items remain: `BUDGET_ENFORCE` default flip + per-deployment resource-limit tuning policy — both pending user discussion. Pushed: `34411c0`, `6703f85`, `7c8faa9`, `c0bd6f9`, `6afe88d`, `1e4ba9a`, `99954ff`, `3f4d386`, `799b6b9`, `24dcec6`, `3ee0c7e`, `38dbf53`, plus this arc-closure commit. Earlier: `53f42da`, `a923eff`, `a38b228`, `24af7e8`, `4d0cfda`, `85475d8`)
> Companion docs: `VISION.md`, `TECHNICAL-EVOLUTION-PLAN.md`, `COMPETITIVE-ASSESSMENT.md`, `AUDIT-2026-04-14.md`, `LEARNINGS-2026-04-21.md`, `LEARNINGS-2026-04-24.md`, `LEARNINGS-2026-04-26.md`

## Phase Tracker

### Foundation (Complete)

| #   | Phase                | Status | Summary                                                                                | Date    |
| --- | -------------------- | ------ | -------------------------------------------------------------------------------------- | ------- |
| 1   | Zero Data Entry      | Done   | Auto-capture from WhatsApp conversations                                               | 2026-02 |
| 2   | Pipeline & Proposals | Done   | Full sales pipeline with quota tracking                                                | 2026-02 |
| 3   | Google Workspace     | Done   | Email, Calendar, Drive integration                                                     | 2026-03 |
| 4   | Scale & Reliability  | Done   | Parallel tools, Docker optimizations, web search                                       | 2026-03 |
| 5   | Events & Inventory   | Done   | Event management, inventory tracking                                                   | 2026-03 |
| 6   | Escalation & Alerts  | Done   | Alert system, management escalation chain                                              | 2026-03 |
| 7   | Intelligence Layer   | Done   | RAG + sqlite-vec + historical analysis + cross-sell + agent swarm (5 parallel recipes) | 2026-03 |

### Pulso Evolution (Planned)

| #   | Phase                     | Status   | Summary                                                                                                                                             | Sessions  | Weeks |
| --- | ------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ----- |
| 8   | Exoskeleton Core          | **Done** | Voice pipeline, EOD wrap-up, sentiment, confidence calibration, enhanced briefings, VP glance dashboard                                             | 1–6       | 1–4   |
| —   | Hindsight Adaptations     | **Done** | Circuit breaker (inference + embedding), Hindsight long-term memory (3 banks, 3 tools), hybrid RAG (FTS5 + reciprocal rank fusion)                  | —         | —     |
| 9   | Relationship Intelligence | **Done** | 3 tables, 6 contacto columns, 7 Dir/VP tools, warmth engine, briefing integration, nightly recomputation                                            | 7–10      | 5–8   |
| 10  | Workspace Abstraction     | Planned  | Provider interface + Google refactor (Phase A now). Microsoft 365 via MS Graph (Phase B when Azure AD ready)                                        | 10.A–10.C | 7–9   |
| 11  | Creative Intelligence     | **Done** | Overnight engine (5 analyzers), proposal drafts, cross-agent patterns (5 detectors), feedback loop, package builder. 12 new tools across 5 sessions | 11.1–11.5 | 9–14  |
| 12  | Data Connectors           | Planned  | Cubo, inventory, contracts, programming schedule, SharePoint. Parallel with Phase 11                                                                | 14–20     | 10–16 |
| 13  | A2A Foundation            | Planned  | Structured action layer + approval flow, REST API expansion, A2A protocol readiness                                                                 | 21–23     | 15–20 |
| 14  | Polish & Scale            | Planned  | Adaptive personality, LLM migration (self-hosted Qwen 3.5), performance hardening, load testing                                                     | 24–26     | 18–24 |

---

## Phase 8: Exoskeleton Core — Session Breakdown

> Goal: Make the existing system feel like the cognitive partner described in VISION.md

| Session | Deliverable                                                                                                                                                                                                  | Est. Hours | Dependencies  | Status   |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ------------- | -------- |
| 1       | Voice transcription pipeline — Whisper provider abstraction, Baileys media hook, `actividad` schema extension (`audio_ref`, `transcription`)                                                                 | 2–3h       | None          | **Done** |
| 2       | EOD wrap-up workflow — 6:30 p.m. scheduled task, daily reflection prompt, consultar_resumen_dia tool, carry-over analysis                                                                                    | 1–2h       | None          | **Done** |
| 3       | Sentiment extraction — LLM auto-classification on activities, `sentimiento_score` column, `consultar_sentimiento_equipo` tool (Gerente+), coaching escalation includes urgente                               | 2–3h       | Session 2     | **Done** |
| 4       | Confidence calibration — `dataFreshness` helper, `data_freshness` metadata on pipeline/descarga/cuota responses, calibration section in all 5 persona templates                                              | 1h         | None          | **Done** |
| 5       | Enhanced morning briefings — `generar_briefing` tool (4 role dispatchers), rewritten briefing prompts, carry-over/recency/path-to-close/sentiment/compliance/revenue-at-risk                                 | 2–3h       | Sessions 2, 3 | **Done** |
| 6       | VP glance dashboard — Single-screen mobile-friendly view: revenue pulse, pipeline health, quota heatmap, sentiment pulse, alerts, inventory utilization. Single `/api/v1/vp-glance` endpoint + `glance.html` | 3–4h       | None          | **Done** |

**Schema changes:** +4 columns on `actividad` (audio_ref, transcripcion, sentimiento_score, tipo_mensaje)
**New tools:** +3 (consultar_resumen_dia, consultar_sentimiento_equipo, generar_briefing) — 34 total
**New API endpoints:** +1 (`/api/v1/vp-glance`) — 7 total
**New dashboard pages:** +1 (`glance.html`) — VP mobile glance view
**New tests:** +78 so far (543 CRM tests passing)

---

## Hindsight Adaptations (2026-03-14) — Cross-cutting improvements

> Goal: Port resilience, memory, and retrieval patterns from mission-control's Hindsight integration (v2.8)

| Deliverable        | Description                                                                                                                                                                                                                                                                                                                                                             | Status   |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Circuit breaker    | Reusable `CircuitBreaker` class (3 failures → 60s cooldown → half-open). Per-provider breaker in `inference-adapter.ts` (skips open Dashscope, falls to MiniMax). Module-level breaker in `embedding.ts` (fast-forwards to local trigram fallback)                                                                                                                      | **Done** |
| Hindsight sidecar  | `HindsightClient` HTTP wrapper, `HindsightMemoryBackend` with circuit breaker + lazy bank creation, `SqliteMemoryBackend` fallback, singleton factory. Docker sidecar managed via `crm-ctl hindsight-*`. Container networking via `--add-host`                                                                                                                          | **Done** |
| Agent memory tools | 3 new tools: `guardar_observacion`, `buscar_memoria`, `reflexionar_memoria`. 3 CRM-specific memory banks: `crm-sales` (patterns, objections, client preferences), `crm-accounts` (relationship history, stakeholder preferences), `crm-team` (coaching, performance patterns). ACI-quality descriptions in Spanish                                                      | **Done** |
| Hybrid RAG         | FTS5 virtual table (`unicode61 remove_diacritics 2` tokenizer for Spanish) alongside sqlite-vec KNN. `searchDocumentsKeyword()` with query sanitization. `reciprocalRankFusion()` (k=60, ported from Hindsight). `searchDocuments()` runs both strategies in parallel, fuses via RRF. Graceful degradation: FTS5 compensates when embedding API circuit breaker is open | **Done** |

**Schema changes:** +2 tables (`crm_memories`, `crm_fts_embeddings`) — 18 total
**New tools:** +3 (guardar_observacion, buscar_memoria, reflexionar_memoria) — 37 total
**New tests:** +35 (578 CRM tests passing, 27 test files)
**New files:** 10 (circuit-breaker, 5 memory service, memoria tools, 3 test files)
**Modified files:** 17 (inference-adapter, embedding, schema, doc-sync, tools/index, bootstrap, container-runner, agent-runner, crm-ctl, 5 group templates, 3 test files)

---

## Phase 9: Relationship Intelligence — Session Breakdown

> Goal: The director and VP relationship agenda — net-new capability

| Session | Deliverable                                                                                                                                                                                                                                                                                           | Est. Hours | Dependencies  | Status |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ------------- | ------ |
| 7       | Relationship schema — 3 new tables (`relacion_ejecutiva`, `hito_contacto`, `interaccion_ejecutiva`) + indexes, migration logic                                                                                                                                                                        | 1–2h       | None          | —      |
| 8       | Relationship tools — 6–8 new Dir/VP tools: `log_executive_interaction`, `query_relationship_health`, `query_upcoming_milestones`, `add_executive_contact`, `add_milestone`, `query_relationship_map`, `suggest_contact_opportunity`, `update_strategic_notes`. Warmth computation (decay + frequency) | 3–4h       | Session 7     | —      |
| 9       | Relationship-aware briefings + nightly monitor — Warmth recomputation batch, staleness alerts in director/VP briefings, milestone alerts, contact opportunity suggestions, briefing template updates                                                                                                  | 2–3h       | Sessions 7, 8 | —      |
| 10      | Contacto enhancement — 6 new columns (`es_ejecutivo`, `titulo`, `organizacion`, `linkedin_url`, `notas_personales`, `fecha_nacimiento`), auto-milestone creation for birthdays                                                                                                                        | 1h         | Session 7     | —      |

**Schema changes:** +3 tables, +6 columns on `contacto`
**New tools:** ~6–8 (relationship management, Dir/VP only)
**New tests:** ~80–100

---

## Record Creation Approval Workflow (2026-03-16)

> Goal: Prevent duplicates and ensure data quality — AE→Gerente→Director approval chain with cascading assignment

| Deliverable          | Description                                                                                                                    | Status   |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------- |
| Schema               | +1 table (`aprobacion_registro`), +3 cols each on `cuenta`/`contacto` (`estado`, `creado_por`, `fecha_activacion`), +2 indexes | **Done** |
| 6 approval tools     | `solicitar_cuenta`, `solicitar_contacto`, `aprobar_registro`, `rechazar_registro`, `consultar_pendientes`, `impugnar_registro` | **Done** |
| Cascading assignment | Gerente assigns AE, Director assigns Gerente (Ger then assigns AE), VP assigns Director (chain cascades down)                  | **Done** |
| Estado filtering     | `estadoFilter()` hides non-active records except from creator. Applied to pipeline, cuentas, cuenta detail, findCuentaId       | **Done** |
| IPC notifications    | `crm_approval_notification` IPC type routes to specific folders or `__ALL__`                                                   | **Done** |
| Alert evaluators     | `alertAprobacion24hExpiry()` auto-promotes after 24h, `alertPendientesAprobacion()` reminds approvers                          | **Done** |

**Schema changes:** +1 table, +6 columns, +2 indexes — 22 tables total
**New tools:** +6 (solicitar_cuenta, solicitar_contacto, aprobar_registro, rechazar_registro, consultar_pendientes, impugnar_registro) — 52 total
**Role counts:** AE:38, Gerente:35, Director:45, VP:43
**New tests:** +52 (660 CRM tests passing, 30 test files)
**New files:** 2 (`crm/src/tools/aprobaciones.ts`, `crm/tests/aprobaciones.test.ts`)
**Modified files:** 16 (schema, tools/index, tools/helpers, tools/consulta, alerts, ipc-handlers, 5 group templates, CLAUDE.md, 3 test files, global CLAUDE.md)

---

## Phase 10: Workspace Abstraction — Session Breakdown

> Goal: Unified provider interface for Google + Microsoft. Enables SharePoint connector in Phase 12.
> Plan detail: `docs/WORKSPACE-ABSTRACTION-PLAN.md`

| Session | Deliverable                                                                                                                                                                    | Est. Hours | Dependencies            | Status  |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- | ----------------------- | ------- |
| 10.A    | Provider interface + Google refactor — `WorkspaceProvider` interface, extract Google code behind abstraction, rewrite 8 tool handlers as thin wrappers. Zero behavioral change | 3–4h       | None                    | —       |
| 10.B    | Schema + config cleanup — Rename `google_calendar_id` → `calendar_id`, `google_event_id` → `external_event_id`, generic terminology in CLAUDE.md templates                     | 1–2h       | Session 10.A            | —       |
| 10.C    | Microsoft 365 provider — Azure AD auth, Outlook mail/calendar via Graph, SharePoint files via Graph. **Blocked on Azure AD app registration**                                  | 4–5h       | Session 10.A + Azure AD | Blocked |

**Schema changes:** 2 column renames
**New tools:** 0 (same tools, different backend)
**New tests:** ~30–40

---

## Phase 11: Creative Intelligence — Session Breakdown

> Goal: The agent thinks commercially — proposing deals, not just tracking them
> Status: **Complete** (all 5 sessions done)

| Session | Deliverable                                                                                                                                                                                                                                                                                   | Status   |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| 11.1    | Overnight analysis engine — 5 analyzers (calendar, inventory, gap, cross-sell, market), `insight_comercial` table, 3 tools (consultar_insights, actuar_insight, consultar_insights_equipo), shared analysis modules (media-mix.ts, peer-comparison.ts), overnight scheduler (2 AM MX via IPC) | **Done** |
| 11.2    | Proposal draft engine — `borrador_agente` etapa, proposal-drafter.ts (value/media derivation), convertir action in actuar_insight, 2 tools (revisar_borrador, modificar_borrador)                                                                                                             | **Done** |
| 11.3    | Cross-agent intelligence — 5 pattern detectors (vertical, holding, inventory, winloss, concentration), `patron_detectado` table, 2 tools (consultar_patrones, desactivar_patron)                                                                                                              | **Done** |
| 11.4    | Feedback loop — `feedback_propuesta` table (draft-vs-final delta tracking), learning engine, 2 tools (consultar_feedback, generar_reporte_aprendizaje)                                                                                                                                        | **Done** |
| 11.5    | Package builder — `package-builder.ts` (historical mix, peer benchmark, inventory, rate cards), 3 tools (construir_paquete, consultar_oportunidades_inventario, comparar_paquetes)                                                                                                            | **Done** |

**Schema changes:** +3 tables (`insight_comercial`, `patron_detectado`, `feedback_propuesta`), +2 columns on `propuesta`
**New tools:** +12 (3 insight + 2 draft + 2 pattern + 2 feedback + 3 package)
**New src files:** 6 (`overnight-engine.ts`, `proposal-drafter.ts`, `cross-intelligence.ts`, `feedback-engine.ts`, `package-builder.ts`, `tools/package-tools.ts`)
**New test files:** 5 (`overnight-engine`, `proposal-drafter`, `cross-intelligence`, `feedback-engine`, `package-builder`)
**Role counts after Phase 11:** AE:45, Gerente:48, Director:57, VP:55
**Tests after Phase 11:** 761 CRM tests (35 files)

---

## Phase 12: Data Connectors — Session Breakdown

> Goal: Connect the agent to every data source it needs. Runs parallel with Phase 11.

| Session | Deliverable                                                                                                                                              | Est. Hours | Dependencies           | Status |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------------- | ------ |
| 14      | Connector architecture — Base `CrmConnector` interface, connector registry, health monitoring, local cache strategy                                      | 2h         | None                   | —      |
| 15      | Cubo connector — Descargas, financials, cross-area visibility. Discovery-first (API/DB view/file export?)                                                | 3–4h       | Session 14             | —      |
| 16      | Inventory connector — Available slots, pricing, tentpoles. Discovery-first                                                                               | 3–4h       | Session 14             | —      |
| 17      | Contracts connector — Closed contracts, remaining budget, spend velocity                                                                                 | 2–3h       | Session 14             | —      |
| 18      | Programming schedule connector — Linear media programming, special events                                                                                | 2–3h       | Session 14             | —      |
| 19      | SharePoint connector — Decks, presentations, past proposals. Extends RAG pipeline. Benefits from Phase 10 workspace abstraction                          | 3–4h       | Session 14, Phase 10.A | —      |
| 20      | Connector-enriched briefings — Wire real connector data into briefing engine + overnight analysis. Actual inventory, real pricing, contract expiry dates | 2–3h       | Sessions 15–19         | —      |

**Schema changes:** None (connectors populate existing tables or use local cache)
**New tools:** ~5–8 (per-connector query tools)
**New tests:** ~40–60 per connector

---

## Phase 13: A2A Foundation — Session Breakdown

> Goal: Build the protocol layer now, activate later

| Session | Deliverable                                                                                                                                                                       | Est. Hours | Dependencies     | Status |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------- | ------ |
| 21      | Structured action layer — New table `accion_agente`, approval flow via WhatsApp (pending → approved → executed), audit logging. Human approval gate on all external actions       | 3–4h       | Phase 8 complete | —      |
| 22      | REST API expansion — Full CRUD endpoints (contacts, proposals, activities, relationships, inventory, actions), JWT auth, role-based scoping. Extends existing dashboard API infra | 4–5h       | Session 21       | —      |
| 23      | A2A protocol readiness — Structured JSON serialization for proposals + actions, agent identity, `external_ref` columns on `propuesta`/`contrato`/`actividad`                      | 1–2h       | Session 22       | —      |

**Schema changes:** +1 table (`accion_agente`), +3 columns (`external_ref` on 3 tables)
**New tools:** ~3 (approve/reject/list pending actions)
**New tests:** ~60–80

---

## Phase 14: Polish & Scale — Session Breakdown

> Goal: Production hardening for the 70% adoption threshold

| Session | Deliverable                                                                                                                                                                                    | Est. Hours | Dependencies     | Status |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | ---------------- | ------ |
| 24      | Adaptive personality — New table `preferencia_agente` (verbosity, formality, push frequency, briefing/wrap-up times), dynamic persona injection, preference learning from interaction patterns | 2–3h       | Phase 8 complete | —      |
| 25      | LLM migration prep — Benchmarking harness across providers, prefix caching strategy, vLLM deployment config for self-hosted Qwen 3.5-122B-A10B                                                 | 2–3h       | None             | —      |
| 26      | Performance & reliability — Sub-3s latency for common queries, batch job monitoring, index optimization, WAL mode, connector error fallbacks, 45-agent load test harness                       | 3–4h       | All phases       | —      |

**Schema changes:** +1 table (`preferencia_agente`)
**New tools:** 0
**New tests:** ~30–40

---

## Cumulative Evolution

| Metric               | Current (Now)             | Phase 14 (Target) | Remaining |
| -------------------- | ------------------------- | ----------------- | --------- |
| SQLite tables        | 29                        | 31                | +2        |
| CRM tools            | 71                        | ~78               | +7        |
| Test files           | 61                        | ~64               | +3        |
| Tests passing        | 1119                      | 1200+             | +81       |
| Persona templates    | 8                         | 8 (dynamic)       | —         |
| Role counts          | AE:51 Ger:55 Dir:66 VP:64 | —                 | —         |
| Claude Code sessions | ~24                       | 26                | ~2        |
| Estimated hours      | —                         | 65–85h            | —         |

### New Tables by Phase

| Table                   | Phase     | Purpose                                                         |
| ----------------------- | --------- | --------------------------------------------------------------- |
| `crm_memories`          | Hindsight | Long-term agent memory (3 banks)                                |
| `crm_fts_embeddings`    | Hindsight | FTS5 keyword search for hybrid RAG                              |
| `relacion_ejecutiva`    | 9         | Executive peer relationships (persona ↔ contacto)               |
| `hito_contacto`         | 9         | Contact milestones (birthdays, promotions, appointments)        |
| `interaccion_ejecutiva` | 9         | Executive interaction log (calls, lunches, events)              |
| `aprobacion_registro`   | Approvals | Approval workflow audit trail                                   |
| `insight_comercial`     | 11        | Overnight commercial insights                                   |
| `patron_detectado`      | 11        | Cross-agent detected patterns (holding shifts, category trends) |
| `feedback_propuesta`    | 11        | Draft-vs-final delta tracking for learning                      |
| `accion_agente`         | 13        | Structured agent actions with human approval gate               |
| `preferencia_agente`    | 14        | Per-AE communication preferences                                |

---

## Adoption Alignment

| Adoption Phase (VISION.md)   | Technical Phases                                | What Users Get                                                                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pilot (Months 1–3)**       | 8 + Hindsight + 9 + Approvals + 11 **complete** | Voice, briefings, sentiment, VP dashboard, long-term memory (Hindsight), hybrid RAG, relationship intelligence, Google Workspace, approval workflows, overnight proposals, creative packages, cross-agent patterns, feedback loop |
| **Evangelists (Months 3–6)** | 10, 12 in progress                              | Workspace abstraction, data connectors (Cubo, inventory, contracts)                                                                                                                                                               |
| **Standard (Months 6–9)**    | 10, 12–13 complete                              | Full data integration, workspace abstraction, action layer, approval flow, API foundation                                                                                                                                         |
| **Ecosystem (Months 9–12+)** | 14 complete                                     | Adaptive personality, self-hosted LLM, production hardening, A2A readiness                                                                                                                                                        |

---

## Architectural Invariants

These rules hold across ALL phases:

1. **`engine/` is never modified** beyond the 5 documented hook points. All CRM code lives in `crm/`.
2. **Schema migrations are additive.** `ALTER TABLE ADD COLUMN`, `CREATE TABLE`. Never `DROP` or modify existing columns.
3. **Tools follow the existing registration pattern.** Every new tool goes through the same inference adapter.
4. **Role scoping is mandatory.** Every new tool, endpoint, and data query respects `hierarchy.ts`. Any resolution of a name parameter (`persona_nombre`, `cuenta_nombre`, etc.) to an id MUST re-apply scope via `isInScope()`-style helper — never trust LLM-supplied names to bypass the role filter.
5. **Tests accompany every change.** No session ends without tests for the new code.
6. **CLAUDE.md personas are updated with every capability change.** A tool the agent doesn't know about doesn't exist.
7. **External actions require human approval.** No exceptions in any phase.
8. **All data has provenance.** Every number the agent cites is traceable to a source table and timestamp.
9. **Mexico City timezone is the user-facing contract.** For user-facing timestamps use `datetime('now','-6 hours')` in SQL (matches schema default shape) or `getMxDateStr()`/`getMxDateTimeStr()` in JS. Never mix `new Date().toISOString()` (UTC) with columns that other code reads in MX time. `hierarchy.ts`, `warmth-scheduler.ts`, `tools/perfil.ts`, `proposal-drafter.ts`, `budget.ts`, `overnight-engine.ts`, `cross-intelligence.ts` are the reference patterns.
10. **No blocking FS calls on the inference hot path.** Everything called from `inference-adapter.ts` per round (injection guard, eviction, compression) must use `fs/promises` or hold zero FS calls at all. Periodic cleanup belongs on a scheduled interval from `bootstrap.ts`, not probabilistically inlined.
11. **Every external call has a timeout.** Google Workspace, Dashscope, Hindsight, Jarvis, Brave, OpenMeteo, NagerHolidays — each call site wraps a `Promise.race`/`AbortSignal`/`withTimeout` with a bounded value. A partial outage must never stall the agent loop.

---

## Blocked Items

| Item                                          | Waiting On                                              | Affects Phase                                                |
| --------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------ |
| Workspace Abstraction Phase B (Microsoft 365) | Azure AD app registration (IT admin)                    | 10.C                                                         |
| ~~Multimodal vision~~                         | ~~VL model endpoint~~                                   | ~~Done (2026-03-22, qwen3.5-plus natively supports vision)~~ |
| Data connector specifics                      | Discovery of cubo/inventory/contracts system interfaces | 12 (sessions 15–18)                                          |

---

## External Dependencies

| Service                   | Status      | Notes                                                                                                                                                                               |
| ------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashscope (GLM-5)         | Active      | Primary inference (text-only). Empty response detection + auto-fallback (2026-03-24)                                                                                                |
| Dashscope (Qwen 3.5 Plus) | Active      | Fallback inference + vision-capable + text-embedding-v3 for RAG                                                                                                                     |
| Brave Search API          | Active      | Web search tool                                                                                                                                                                     |
| Google Workspace          | **Active**  | Email (send+read), Calendar (events+read), Drive (full), Slides API, Sheets API. Service account: crm-azteca-agent@crm-azteca.iam.gserviceaccount.com. Test user: fede@eurekamd.net |
| WhatsApp (Baileys)        | Active      | Main risk — unofficial API                                                                                                                                                          |
| Whisper (transcription)   | **Active**  | Groq `whisper-large-v3` configured                                                                                                                                                  |
| Hindsight                 | **Active**  | Long-term memory sidecar running on crm-net Docker network. 3 banks (crm-sales, crm-accounts, crm-team). 29+ memories seeded                                                        |
| Azure AD                  | Not started | Needed for Phase 10.C                                                                                                                                                               |

---

## Infrastructure

- **Server**: Test VPS, Node 22.22.0, Docker 29.3.0
- **Service**: `agentic-crm.service` (systemd), managed via `crm-ctl`
- **Timezone**: `America/Mexico_City` (hardcoded default in config.ts + systemd `TZ` env var)
- **Credential Proxy**: Port 7462 (containers get placeholder keys, proxy injects real credentials)
- **Container**: `agentic-crm-agent:latest` (rebuilt 2026-03-19, Lightpanda browser replaces Chromium — 1.16GB vs 2.27GB)
- **Hindsight**: `crm-hindsight` Docker sidecar on `crm-net` network (port 8888 API, 9998 UI), persistent volume at `data/hindsight/`. Qwen LLM + local embeddings
- **WhatsApp**: Authenticated (5215530331051)
- **Dashboard**: Port 3000 open (UFW), short links via Bitly

---

## Recent Changes

| Commit    | Description                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| —         | ops: container rebuild after 1-week outage (agentic-crm-agent:latest image missing since recent commits; all spawns exiting 125). Built engine base + CRM image, verified end-to-end message flow. Documented in LEARNINGS-2026-04-21.md                                                                                                                                                                           |
| —         | ops: disk cleanup — deleted stale /root/backups/ Claude tarballs (502 MB), compressed syslog.1 (228 MB), docker builder prune (1.75 GB). Disk 77% → 74%                                                                                                                                                                                                                                                            |
| `d16d172` | fix: audit — 7 fixes from code review (injection scan before eviction, ZERO_WIDTH_RE lastIndex bug, sanitizeToolPairs delegates to repairSession, buildResult helper, recordCost logging, single-query getThreeWindowStatus, mkdirSync guard)                                                                                                                                                                      |
| `9974ddf` | feat: inference resilience — 8 modules ported from mission-control (session-repair, doom-loop, tool-eviction, context-compressor, injection-guard, tool-metrics, preflight, budget) + cost_ledger table, 101 new tests                                                                                                                                                                                             |
| `7eefde3` | feat: consultar_cuentas tool — account overview with agency info (46 tools)                                                                                                                                                                                                                                                                                                                                        |
| `f5e08cd` | fix: agencies are NOT clients — fix data model and system prompt                                                                                                                                                                                                                                                                                                                                                   |
| `928a5ba` | feat: HTML email template — proper paragraph spacing, clean layout                                                                                                                                                                                                                                                                                                                                                 |
| `8024bd1` | fix: Hindsight client API paths + seeded 29 memories                                                                                                                                                                                                                                                                                                                                                               |
| `7683cfe` | fix: Docker network for container→Hindsight connectivity                                                                                                                                                                                                                                                                                                                                                           |
| `37a8e6f` | fix: agent memory — context window 12→30, active memory protocol                                                                                                                                                                                                                                                                                                                                                   |
| `1833241` | feat: disambiguation protocol in agent system prompt                                                                                                                                                                                                                                                                                                                                                               |
| `e3fe247` | fix: Slides object IDs >= 5 chars (Google API requirement)                                                                                                                                                                                                                                                                                                                                                         |
| `a9af920` | fix: split Gmail scopes — send-only vs compose, fallback on draft fail                                                                                                                                                                                                                                                                                                                                             |
| `ecbefd8` | fix: add email send/draft tools to Director and VP roles                                                                                                                                                                                                                                                                                                                                                           |
| `286621d` | feat: populate Slides and Sheets content on creation (Slides API + Sheets API)                                                                                                                                                                                                                                                                                                                                     |
| `6b81c1b` | feat: crear_documento_drive — create Google Docs, Sheets, Slides                                                                                                                                                                                                                                                                                                                                                   |
| `a1604d4` | fix: add GOOGLE\_\* to secrets pipeline (3-place pattern)                                                                                                                                                                                                                                                                                                                                                          |
| `056357e` | feat: add full Drive scope + getDriveWriteClient                                                                                                                                                                                                                                                                                                                                                                   |
| `99062e4` | feat: Phase 9 Session 9 — briefing integration + nightly warmth recomputation                                                                                                                                                                                                                                                                                                                                      |
| `0447445` | feat: Phase 9 Session 8 — relationship tools + warmth computation (7 tools, 44 total)                                                                                                                                                                                                                                                                                                                              |
| `7ff8ca4` | feat: Phase 9 Session 7 — relationship schema (3 tables + contacto enhancement)                                                                                                                                                                                                                                                                                                                                    |
| `b752b85` | feat: Hindsight adaptations — circuit breaker, long-term memory, hybrid RAG (18 tables, 37 tools, 578 tests)                                                                                                                                                                                                                                                                                                       |
| `63cf2e3` | fix: voice transcription — wrong import path + bad extension parsing                                                                                                                                                                                                                                                                                                                                               |
| `83a1226` | feat: Phase 8 Session 6 — VP glance dashboard (vp-glance API, glance.html, 543 tests)                                                                                                                                                                                                                                                                                                                              |
| `c531662` | feat: Phase 8 Session 5 — enhanced briefings (generar_briefing, 34 tools, 524 tests)                                                                                                                                                                                                                                                                                                                               |
| `144c492` | feat: Phase 8 Session 4 — confidence calibration (dataFreshness, 505 tests)                                                                                                                                                                                                                                                                                                                                        |
| `f7ab07e` | feat: Phase 8 Session 3 — sentiment extraction pipeline (33 tools, 490 tests)                                                                                                                                                                                                                                                                                                                                      |
| `a91a843` | feat: add daily activity seeder and update Phase 8 status docs                                                                                                                                                                                                                                                                                                                                                     |
| `b7a5cbb` | feat: Phase 8 Session 2 — EOD wrap-up workflow                                                                                                                                                                                                                                                                                                                                                                     |
| `b0162d4` | feat: Phase 8 Session 1 — voice transcription pipeline (Groq Whisper)                                                                                                                                                                                                                                                                                                                                              |
| `4989428` | feat: add crm-add-tool and crm-deploy Claude Code skills                                                                                                                                                                                                                                                                                                                                                           |
| `42404dc` | docs: add Pulso vision, technical plan, and updated roadmap (Phases 8-14)                                                                                                                                                                                                                                                                                                                                          |
| —         | feat: NanoClaw upstream sync — credential proxy (containers never see real API keys), PROXY_BIND_HOST + hostGatewayArgs, group-queue runningTaskId tracking                                                                                                                                                                                                                                                        |
| —         | fix: timezone — hardcode America/Mexico_City default, TZ in systemd + .env                                                                                                                                                                                                                                                                                                                                         |
| —         | feat: replace Chromium+agent-browser with Lightpanda headless browser (MCP, 10 tools). Image 2.27→1.16GB, runtime 200→24MB RAM                                                                                                                                                                                                                                                                                     |
| —         | fix: UTC timestamps in message XML — toLocalTime() converts to MX timezone before LLM sees them. refreshSystemDate() keeps date fresh in long-lived containers                                                                                                                                                                                                                                                     |
| —         | feat: WhatsApp image vision — CRM agent-runner reads image attachments as base64, builds OpenAI multimodal content arrays (text + image_url), sends to qwen3.5-plus. GLM-5 auto-skipped for image requests (vision-capable provider routing in inference adapter). Session files strip base64 to prevent bloat. (2026-03-22)                                                                                       |
| `5a59f9e` | feat: template scoring system + ACE-inspired self-improvement                                                                                                                                                                                                                                                                                                                                                      |
| `8e39a40` | fix: replace TinyURL with Bitly for dashboard link shortening                                                                                                                                                                                                                                                                                                                                                      |
| `3324739` | fix: agent ignores "Cómo vamos?" — briefing trigger phrases in all 4 role templates + global disambiguation, daily seeder links activities to proposals (fixes perpetual staleness), template sync                                                                                                                                                                                                                 |
| `c522aa9` | fix: doc-sync never runs on host — readEnvFile() doesn't populate process.env, so Google key was invisible to host-side doc-sync. auth.ts now falls back to reading .env directly                                                                                                                                                                                                                                  |
| `34ffa36` | fix: strip CJK characters leaked by GLM-5 (stripCJK in writeOutput), auth.ts direct .env read for container build compat                                                                                                                                                                                                                                                                                           |
| `f7354a3` | fix: prospect tool bloat — content-similarity dedup (>60% word overlap), 5 source cap, 150-char descriptions, compact JSON keys                                                                                                                                                                                                                                                                                    |
| `2aad2d4` | fix: client confidentiality firewall — hard rule in global.md (never cross-reference competitors), inline aviso in prospect tool for new accounts                                                                                                                                                                                                                                                                  |
| `78106f3` | fix: reporting framework — anti-repetition prompt rules, buscar_web 150-char cap, pipeline 20-result cap. Prevents 3-4x content duplication in briefs                                                                                                                                                                                                                                                              |
| `362b69c` | feat: jarvis_pull tool — CRM agents request strategic analysis from Jarvis                                                                                                                                                                                                                                                                                                                                         |
| `a530384` | feat: jarvis_pull auto-creates Google Doc with formatted analysis                                                                                                                                                                                                                                                                                                                                                  |
| `a1a8d75` | feat: add Jarvis section to CRM persona templates                                                                                                                                                                                                                                                                                                                                                                  |
| `60f00b3` | perf: unified cron scheduler + event-driven IPC (fs.watch)                                                                                                                                                                                                                                                                                                                                                         |
| `266a0e0` | fix: QA audit — scheduler crash recovery, IPC shutdown cleanup                                                                                                                                                                                                                                                                                                                                                     |
| `81b3a55` | fix: CRM→Jarvis — 90s timeout + Google Docs HTML formatting                                                                                                                                                                                                                                                                                                                                                        |
| `3942763` | fix: enforce Mexico City timezone across all user-facing dates and dedup logic                                                                                                                                                                                                                                                                                                                                     |
| —         | feat: inference resilience port from mission-control — 8 modules: session repair, 4-layer doom-loop detection, graduated escalation, context compression (L0+L1), tool result eviction, CCP3 injection defense, pre-flight validation, budget tracking + tool metrics. +1 table (cost_ledger), +101 tests (1119 total, 61 files)                                                                                   |
| `d16d172` | fix: audit — 7 fixes from code review (injection scan order, regex state leak, SQL CASE-WHEN, helper extraction)                                                                                                                                                                                                                                                                                                   |
| `b0d6c51` | fix: full 6-dimension system audit — 58 fixes across speed, resilience, logic, memory, intelligence, security (hierarchy activo filter, pairDrain inner-loop bound, context limit 60k→100k, MX timezone sweep in 8 modules, tool-eviction async port, consulta CTE merge, Google API timeouts, scope guards, Spanish homoglyphs, ACI description rewrites). 1119/1119 tests green. See `docs/AUDIT-2026-04-14.md`. |
