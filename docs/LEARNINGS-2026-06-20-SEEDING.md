# Learnings — Sales-force + accounts seeding (2026-06-20)

Seeding the national cartera ("Cartera VN_Base 2025-2026") into the live CRM, then trimming
the org to the closing-pilot scope. Patterns worth keeping.

## 1. Entity linking by SUBSTRING is a silent-false-positive trap

The first advertiser-link pass used the existing `resolveAnunciante` (exact-norm → `LIKE
'%input%'`). It produced **false links**: `LG` → "Colgate-Palmolive" (because "co**LG**ate"
contains "lg"), while **missing real matches** (`COCA COLA`/`DANONE`/`KELLOGGS` → the corpus
holds "Coca-Cola FEMSA"/"Danone México"/"Kellanova México", which substring-from-the-input
can't reach). Fix: **whole-token subset matching** — tokenize both sides (strip accents,
`México`/`de`/`grupo`… stopwords), link only when the account's significant tokens are a
**subset** of the advertiser's tokens. `lg` is a token, never a substring of "colgate", so the
false positive disappears; and it catches the real ones. Posture: **never guess** — a name
matching >1 advertiser is left unlinked + reported (operator/heuristic decides), exactly like
the P3.5 anunciante derivation. Multi-entity advertisers (Coca-Cola, PepsiCo, Bimbo) get a
**transparent parent-pick** (fewest parens → fewest tokens → shortest), reported for override.

## 2. Corpus coverage is the real ceiling, not the matcher

After clean matching: **76 of ~290 accounts (~26%)** link to the 320-brand Aura corpus. A
reconciliation pass over the 223 unlinked recovered **1** — the rest (PFIZER, DIAGEO, BACARDI,
SEPHORA, CONAGRA…) are **genuinely absent** from the corpus, not naming bugs. Lesson: before
spending on a fuzzy/agent reconciliation, confirm whether the misses are _naming_ (fixable) or
_coverage_ (needs corpus expansion) — a cheap `/`-segment + token pass tells you, and here it
showed an agent pass would recover ~nothing. Expansion plan: `docs/AURA-CORPUS-EXPANSION-PLAN.md`.

## 3. A closing companion's org excludes the doers

Aura serves **Director + Gerente** (VP = observer). When the operator confirmed the pilot org,
the move was: **purge all ejecutivos**, and **roll account ownership up** — `cuenta.ae_id`
nulled, ownership carried by `gerente_id`/`director_id`. Deleting a non-relevant director
cascades: remove the director, its gerentes, **and its accounts** (out-of-scope portfolios).
Model the org around _who the agent talks to_, not the full headcount.

## 4. role enum ≠ template filename (`gerente` vs `manager.md`)

`register.ts copyRoleTemplate` resolved `${role}.md`, so role `gerente` looked for
`gerente.md` — which doesn't exist (the template set names it `manager.md`). Gerente folders
silently shipped with **only `global.md`** (no Manager/Modo-Cierre persona). The primary users
would've had a lobotomized agent. Fixed: map `gerente → manager`. **When an enum value and a
file/asset name can diverge by language or convention, assert they resolve** (the test now
proves `gerente` loads `manager.md`).

## 5. Parsing a pivot-table export

The cartera was a `DIRECTOR → GERENTE → EJECUTIVO → CUENTA` pivot flattened to one comma
string — column positions were unrecoverable, but the **`Total <name>` subtotal markers** were
not. A state machine that resets `ejecutivo→gerente→director` to null when it sees `Total
<that-name>` and fills `dir→ger→ejec→cuenta` in order parsed all 300 rows cleanly (one
post-filter for a mid-unit ejecutivo with no Total marker). When a flattened export loses
structure, the **subtotal labels often re-encode it**.

## 6. Seeding ops

- DB-only scripts (`register-team`, `seed:cuentas`) still hit `bootstrapCrm`'s `validateEnv` —
  pass **dummy** `INFERENCE_*`/`HINDSIGHT_*` (the scripts never call inference) rather than the
  guarded real `.env`.
- **Snapshot the DB before a destructive migration** (`cp crm.db crm.db.pre-orgtrim-…`); it's
  the irreplaceable store.
- Real rosters are **PII** → `seed/.gitignore` tracks only `*.example.*`; keep `seed/*.csv`
  re-aligned to the live org so a re-seed reproduces the source of truth.
