# Learnings — 2026-06-21 — Corpus reconciliation: "sin meta de cierre" ≠ "desconocido"

## Symptom

The live agent was asked for Nissan's closing metas. `consultar_metas_cierre("Nissan")`
ran cleanly (`success=1`, 17ms) and returned `status: "no_encontrada"`. The agent told the
user Nissan was not found — _"puede que esté registrada con otro nombre… ¿quieres que busque
en todo el portafolio?"_ — implying the advertiser is unknown.

## Diagnosis (not a bug in the tool — a missing reconciliation)

Nissan genuinely has **no row in `cierre_meta`** (492 rows; Nissan absent — the closing
portfolio simply never loaded it). So `no_encontrada` was _truthful_. But Nissan **is** in
the corpus on three other surfaces:

- `anunciante_marca`: advertiser **Nissan Mexicana**, brand_key `nissan-automotriz`
- `crm_documents` (source `aura-kb`): **4 intelligence cuerpos** (buyer_personas,
  campañas_temporalidades, diagnostico_9fuentes, inteligencia_social)
- `cuenta`: `cta-nissan`

The closing-goals table and the intelligence corpus are **separate datasets**. A researched
advertiser can have zero closing metas. Reporting "no encontrada" conflated the two and made
a known advertiser read as unknown.

**We did NOT fabricate a Nissan meta** — that would violate the truth principle. The fix is
at the **response layer**: distinguish "known advertiser, no meta loaded" from "unknown name".

## Fix

1. **`corpusPresence(input, role?)`** in `crm/src/anunciante.ts` — reconciles the three
   surfaces a name can live in (advertiser via `resolveAnunciante`, brand intelligence via
   `crm_documents` aura-kb count, accounts via `cuenta.anunciante_norm`) into one verdict:
   `conocido`, `anunciante`, `candidatos` (ambiguous), `marcasConInteligencia`,
   `docsInteligencia`, `cuentas`. No-guess: an ambiguous name returns `candidatos`, never a
   silently-picked advertiser.

2. **`consultar_metas_cierre` `none`-path** now consults `corpusPresence(raw, ctx.rol)`:
   - known advertiser → **`status: "sin_meta_cierre"`** with `tiene_inteligencia` +
     `marcas_con_inteligencia` and a directive mensaje: offer the radiografía, never call it
     unknown, **never invent a meta**.
   - ambiguous → `sin_meta_cierre` + `opciones`.
   - truly absent → sharpened `no_encontrada` ("no aparece como anunciante ni marca en el
     corpus").

3. **`crm/groups/global.md`** — backstop subsection "### Sin meta de cierre NO significa
   desconocido" documenting the two empty-states (injected into every closing persona).

## The non-obvious part — the _symmetric_ bug (why `role` is threaded in)

The qa-auditor flagged that the intel **count** wasn't role-floor-filtered. It's not a leak
(count + names only, advertiser's own brands, Ger/Dir/VP audience). But filtering by role
closes a _second instance of the same bug class_: if `tiene_inteligencia: true` counted docs
above the caller's `rol_minimo`, the agent would **offer a radiografía that comes back empty
for that persona** — "promised data, got nothing" all over again. So `corpusPresence(input,
role)` filters the count with the same `rol_minimo IN clearedFloors(role)` lattice as
`radiografiaForAnunciante`. `tiene_inteligencia` now means _"intel THIS persona can actually
pull."_ Omitting `role` gives a raw corpus-existence check (ops/debug).

## Durable lessons

- **"Agent can't fetch X" → pull the `crm_tool_usage` ledger first.** `success=1` means the
  tool ran; a "not found" the user sees is downstream of the DB. (Same discipline as the
  2026-06-20 confabulation guard.)
- **An empty result has two meanings.** Any name-resolution tool that returns empty should
  distinguish "unknown to the whole CRM" from "known, but no data in THIS view." Collapsing
  them misrepresents known entities.
- **Reconcile at the seam, don't fabricate.** The truthful answer is "known advertiser, no
  meta loaded — here's the intelligence I do have," not an invented number.
- **Fix the bug class, not the instance.** The role-aware count is the symmetric twin of the
  reported bug; both ship together.

## Tests

- `crm/tests/anunciante.test.ts` — `corpusPresence`: known+intel, known-no-intel, unknown,
  ambiguous, blank-cuerpo, **role-scoped count** (C-level doc invisible to Director).
- `crm/tests/cierre.test.ts` — tool: `sin_meta_cierre` with/without intel, `no_encontrada`,
  happy-path `ok` intact.
- `crm/tests/templates.test.ts` — global.md rule present.

All green (scoped runs); `tsc --noEmit` clean; container rebuilt + verified
(`agentic-crm-agent:latest` `449ceb50c33f` carries `corpusPresence` + `rol_minimo IN` +
`sin_meta_cierre`).

## Verified live — 2026-06-21

Operator confirmed the live WhatsApp round-trip (the one thing tests couldn't cover): on the
crm-test group, an advertiser with intelligence but no loaded closing meta now reads as
_"anunciante conocido, sin meta de cierre cargada — ¿quieres la radiografía?"_ instead of
_"no encontrada."_ The reconciliation closes the loop end-to-end: ledger diagnosis →
response-layer fix → live behavior. Shipped in `f23e381`.
