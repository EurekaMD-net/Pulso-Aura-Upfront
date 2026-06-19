# Learnings — Aura P3.0 + P3.1 (re-hosting the router as engine retrieval + persona mode)

Context: the Aura corpus was authored for **claude.ai Projects** (copy-paste handoffs between
separate Project artifacts, `project_knowledge_search` for retrieval). P3 re-hosts it inside our
single-agent engine. P3.0 re-hosted **retrieval**; P3.1 re-hosted the **router** (`aura-amn`) as a
Gerente/Director persona mode. These are the non-obvious patterns.

## 1. Re-host translation table (claude.ai Projects → engine)

When porting a claude.ai-Projects skill into the engine persona, three behaviors are
**engine-impossible** and must be translated, not copied verbatim:

| Original (claude.ai)                             | Engine port                                                        |
| ------------------------------------------------ | ------------------------------------------------------------------ |
| `project_knowledge_search`                       | the registered tool (`buscar_inteligencia_marca`)                  |
| copy-paste skill-handoff prompts (Momento 1/2/3) | dropped — one agent drives the dialogue itself                     |
| "abre una conversación nueva / Claude/ChatGPT"   | reframed for WhatsApp (one brand per thread; re-confirm on switch) |

Grep the ported prose for the originals (`project_knowledge_search`, "copia y pega",
"conversación nueva") to confirm none leaked. The qa-auditor caught this as a verification axis.

## 2. Persona-mode placement: role files, not global.md

Live persona = `global.md` + `<role>.md` concatenated (`register.ts:copyRoleTemplate`). `global.md`
is read by **all four** roles. A capability gated to Gerente/Director (closing mode — they hold the
tool, AE/VP don't) belongs in the **role files**, even though that duplicates ~40 lines across
`manager.md` + `director.md`. Putting it in `global.md` would pollute the AE/VP hot path with prose
they can never action. The duplication's drift risk is the price; neutralize it with a test (§3).

## 3. Drift-guard test for duplicated role blocks

When the same canonical block lives in two near-identical role files, a single test that asserts the
**shared anchors present in both** turns the duplication from a liability into a checked invariant.
Pattern (in `templates.test.ts`): one `CLOSING_ANCHORS` array, looped over both `managerMd` +
`directorMd`; the files may legitimately diverge only on un-anchored text (role noun, role-specific
framing), so the guard never false-fails on intended divergence. Pair it with a **gate** assertion
(`GATED_OUT` absent from `ae.md`/`vp.md`).

## 4. Gate at two layers, and make the prose gate mirror the registry gate

The real enforcement is the **tool registry** (`buscar_inteligencia_marca` ∈ `GERENTE_TOOLS` +
`DIRECTOR_TOOLS` only — AE/VP literally can't call it, so even if they saw closing prose they couldn't
act). But also assert the **prose gate** (the tool name + closing tokens absent from `ae.md`/`vp.md`),
so the two stay self-documenting and a future edit can't silently leak closing content into AE/VP
without tripping a test. Verify the registry gate by reading `tools/index.ts` role arrays — don't
trust the prose alone.

## 5. Gated-out token specificity: bind short tokens to context

A gate that asserts a **short** token absent (`"DARK"`) is latently fragile — any future word
containing it as an uppercase substring false-fails. Bind it to its context (`"(DARK)"` /
`"Acercamiento (DARK)"`). Long unambiguous tokens (`ARMAGEDDON`, `STAKEHOLDERS`) are fine bare.
(qa-auditor Info item, applied.)

## 6. Synthesize, don't dump — encode it in the mode, not just hope

A retrieval tool returns structured findings (JSON). Left unguided, the agent pastes them. The
coaching mode (§8: "coaching, not a doc generator") must **explicitly** instruct: synthesize the
findings into seller-language coaching, never dump the raw JSON. This also answers the operator's
open question #2 (raw findings vs synthesized narrative) — the mode chooses synthesis.

## 7. Honesty hooks map to tool contract fields

The mode's "never fabricate" / "ambiguous → ask" rules are only credible if they map to real tool
outputs: `encontrada:false` (no brand in KB → say so), `ambigua:true` + `opciones` (→ ask which
brand). Reference the actual return-shape fields in the prose so the instruction is actionable, and
confirm those fields exist in the handler (`tools/aura.ts`) — not phantom.

## 8. Deterministic pull by dimension tag ≫ semantic search for a structured read-path (P3.2)

When the corpus carries a **structural tag** for the thing you need (here `crm_documents.cuerpo` ∈
the 4 diagnostic dimensions), pull by that tag — don't issue N semantic searches and hope all N
dimensions surface. The radiografía needs _all four_ cuerpos, complete; `searchAuraKb` (KNN+FTS+RRF,
consulta-driven) would rank chunks by similarity and could miss or duplicate a dimension. A
deterministic `WHERE brand_key=? AND cuerpo IN (...)` returns exactly the four, and a missing one is
a real, reportable `faltante` — not a search miss. Lesson: check whether the data is already tagged
before reaching for embeddings; semantic search is for open-ended questions, not "give me these N
known parts."

## 9. The body lives in the chunks, not the document row (P3.2)

`crm_documents` holds metadata (titulo, cuerpo, rol_minimo, …) but **no full-body column** — the text
is chunked into `crm_embeddings.contenido`. To return a document's full body, reassemble
`SELECT contenido … WHERE document_id=? ORDER BY chunk_index`. The `UNIQUE(document_id, chunk_index)`
schema constraint guarantees no gaps/dupes, so the ordered join is sound. (Don't assume a row has its
own text just because it has a title.)

## 10. A new read-path can be STRICTER than the search path — and should be (P3.2)

`radiografiaForBrand` uses `brand_key = ?` (mandatory) and omits `searchAuraKb`'s
`(brand_key IS NULL AND aislado=0) OR …` general-doc branch. That's correct: a diagnostic cuerpo is
always brand-tagged, so a NULL-brand row is never a valid radiografía input. Side benefit (qa-auditor
flagged): it **closes the P2 content-trust weakness** — a mis-tagged `aislado_por_cliente=0` can't
leak through a path that requires `brand_key`. Don't "harmonize" a stricter governed path back to a
looser shared clause later; stricter-where-the-data-allows is a feature.

## 11. Let the corpus shape the increment — retrieval vs prompt is a data question (P3.3)

P3.2 was a retrieval increment because the brand had per-dimension _data_ (the 4 tagged cuerpos).
P3.3 (DARK/STAKEHOLDERS) is **prompt-only** because the corpus check said so: every brand folder has
only the 4 cuerpos, and `grep rol_minimo aura-kb/knowledge/` returns **zero `restringido_senior`** —
the war-room skills are _method_, not per-brand content. So there's nothing to retrieve; the faithful
move is to re-host the method as persona steps. Lesson: before designing a retrieval path, grep the
corpus for the thing you'd retrieve. If it isn't there, retrieval is scaffolding for an empty table —
encode the method in the prompt and log "ingest-as-doctrine" as a _deferred_ enhancement, not a P0.

## 12. When there's no data to RBAC-filter, the gate is structural — and that's fine (P3.3)

The plan said "gated to `restringido_senior`," but there is no `restringido_senior` _data_ to filter.
The gate is satisfied **structurally**: the war-room lives only in the Ger/Dir personas (the roles that
clear that floor), and AE/VP never receive it. The test enforces both directions (anchors present in
Ger/Dir, absent in AE/VP). Don't manufacture an RBAC query for a floor with no rows — place the
capability where only the cleared roles can see it, and assert the absence. (The _delivery-boundary_
enforcement of the never-to-client gate — code, not prose — lands with P3.4 when WhatsApp send exists.)

## 13. Model the COMMERCIAL unit, not just the content unit (P3.5)

Aura is authored per-brand, so the whole pipeline was per-brand — but the deal is closed with the
**anunciante** (one budget, one committee, whole portfolio). The content unit (brand) and the deal
unit (advertiser) are different, and the closing companion has to operate on the deal unit. The tell
was already in the CRM: `propuesta`/`contrato` reference `cuenta_id` (account-level) and carry **no
brand** — the schema knew the deal was account-level before we did. Lesson: when wiring a workflow,
find who signs / holds the budget and anchor on that; per-item intelligence is a drill-down, not the
spine. Hierarchy here: grupo (holding) → anunciante → marcas.

## 14. Derive missing data with grounded research agents — provenance, not fabrication (P3.5)

The advertiser field didn't exist in the corpus. Rather than hand-map 320 brands or guess, we fanned
out 3 research agents, each grounding in the brand's own `diagnostico-9fuentes` (which names the
parent in its competitive context — **trust the finding over the slug**: `abuelita-chocolate`→Nestlé,
`ades`→Coca-Cola FEMSA), web for the ambiguous, and **provenance per row** (confidence/basis/evidencia).
Result: 320/320, 0 nulls, 298 alta. Keys to not fabricating: a primary grounded source, a confidence
tier (22 `media` rows surfaced for operator review, not silently merged), and `anunciante=null` allowed
when unresolvable. The map is a versioned, auditable artifact — not embedded magic.

## 15. Built ≠ integrated — run the producer and smoke-test the join, don't just write it (P3.5)

The first cut had `syncAnuncianteMap` with no npm script and no caller, and `cuenta.anunciante_norm`
written by nothing — so `anunciante_marca` would be **empty on every real DB** and both tools would
return `encontrada:false`. qa-auditor flagged both as the producer-consumer gap. The fix isn't just
"add the script" — it's **run it against the live DB and verify the join**: `npm run sync:anunciante-map`
→ 320 rows → SQL spot-check that all 320 brand_keys join to corpus docs (0 orphans), P&G resolves to
its portfolio. A retrieval layer over an unloaded table passes its unit tests and still does nothing in
production. (W2 — `cuenta.anunciante_norm` population — genuinely can't be closed until accounts exist;
it degrades gracefully to `sin_comite`→coach-from-method, and is tracked for the account-registration flow.)

## 16. A safety gate is a resolver that returns a reason, not a boolean sprinkled at call sites (P3.4)

The never-to-client guarantee is the load-bearing property of proactive delivery. The faithful way to
express it is **one function that resolves a recipient or refuses with a reason** —
`resolveCoachingRecipient(personaId, deps) → { ok, jid } | { ok:false, reason }` — not a scatter of
`if (isClient) return` checks at each send site. Two properties make it airtight: (a) the only input is a
`persona` id, and a `contacto` (client) **has no row in `persona`**, so `getPersonById` returns undefined →
blocked — a client can't even be addressed; (b) **nothing in the module reads `contacto.telefono` or
`persona.telefono`** — the sole phone-adjacent read is `whatsapp_group_folder`, which resolves to a _group_
jid, never an individual number. The six guards run in sequence and a jid is assigned **only** on the
all-pass path, so the gate is structural, not behavioral. qa-auditor's job became "try to find a path to a
jid that skips a guard" — and there wasn't one. Lesson: when a property must hold, make it impossible to
violate by construction (no code path exists), then test each refusal branch — don't rely on a correct
runtime check that a future edit could move or weaken.

## 17. Ride the rail — find the existing delivery path before building a new one (P3.4)

P3.4 looked like "build WhatsApp push + a scheduler." Recon found `escalation.ts` already does the exact
shape (scan a condition → resolve recipient via the `reporta_a` hierarchy → dedup via `alerta_log` →
`findJid(folder)` from `registeredGroups()` → `deps.sendMessage`), and the unified `scheduler.ts` is a
**declarative `SCHEDULES` cron table**. So the build collapsed to: a 5th evaluator on the same rail + **one
table entry** + one IPC case. No new scheduler file, no engine change, no new transport. Two corollaries:
(a) match the new feature's dedup to the rail's existing grain — a **weekly** cron (`0 7 * * 1`) makes the
rail's **daily** `alerta_log` dedup yield once-per-cluster-per-week for free, no dedup-schema change; (b)
mirroring a working rail is a feature, not debt — when the audit flagged that the dedup check omits
`grupo_destino` (a column on the unique index), the right call was to _document the deliberate divergence_
(entityId already embeds the recipient) rather than diverge from the rail escalation.ts established. Always
grep for the existing producer/consumer before designing a parallel one.

## 18. Anchor the proactive layer on the deal unit, degrade gracefully on the unpopulated link (P3.4)

The proactive trigger groups near-close deals by **(gerente, anunciante)** — the anunciante is the deal unit
(P3.5), so the coach gets one nudge per hot advertiser, not per brand or per deal. But `cuenta.anunciante_norm`
is unpopulated at clean-start (P3.5's tracked wiring gap), so the cluster key degrades to `cuenta:<id>` and
the nudge renders the cuenta name — same graceful-degradation posture as P3.5's `sin_comite`→coach-from-method.
Lesson: a new layer should anchor on the _correct_ unit even when the link feeding it isn't populated yet, as
long as it degrades to a sensible lower grain — don't block the feature on the upstream data gap, and don't
silently anchor on the wrong unit because the right one is empty today.

## Deferred / next

- P3.1 recognition+architecture+Step 1; **P3.2** ARMAGEDDON read-path; **P3.3** DARK/STAKEHOLDERS
  war-room (prompt-only). Remaining: **P3.4** proactive near-close trigger + WhatsApp delivery, where
  the never-to-client gate becomes a code concern at the delivery boundary.
- **Deferred (P3.3b, only if needed):** ingest the DARK/STAKEHOLDERS references (`doctrina_vertice`,
  `cinco_frentes`, `mapa_stakeholders`, `registro_por_driver`, …) as retrievable **general doctrine**
  (brand_key NULL + `aislado=0` so they're cross-brand, `rol_minimo=restringido_senior`) + a
  method-retrieval tool. `searchAuraKb` already supports the general-doc branch; this would create the
  first real `restringido_senior` content and give the agent deep method on demand. Needs an ingester
  change + a re-embed/deploy — only worth it if in-persona coaching depth proves thin.
- `radiografiaForBrand` returns full cuerpo bodies (faithful to "read completos"); payload can be
  large but tool-eviction backstops it and the persona mandates synthesize-don't-dump.
- Live `groups/*/CLAUDE.md` regenerate from these templates at deploy (`register.ts`) — never
  hand-edit the live files; edit the templates.
