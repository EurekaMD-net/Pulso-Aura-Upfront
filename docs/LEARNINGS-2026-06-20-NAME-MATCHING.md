# Name-matching: cartera vs advertiser spelling — 2026-06-20

## Symptom

VP asked about Coca Cola; the agent replied _"No se han encontrado metas de cierre
para Coca-Cola FEMSA"_ — read as "the agent knows nothing about Coca Cola." (It did
know: the radiografía worked. Only the **closing-metas** lookup failed.)

## Root cause — NOT the model

qwen3-32b was calling tools, disambiguating brand variants, and synthesizing
correctly. The failure was a **name-normalization gap** between two data sources:

- The cartera stores the account as **"COCA COLA"** → `normalizeMarca` → `coca cola`.
- The agent queried the **advertiser** spelling **"Coca-Cola FEMSA"**.
- `normalizeMarca` only strips accents + lowercases — it **keeps the hyphen**, so
  `coca-cola` ≠ `coca cola`, and the extra `FEMSA` token + the wrong advertiser
  entity (FEMSA the bottler vs "Coca-Cola México" the brand owner) meant **both**
  resolution paths (exact name, advertiser-norm) missed.

Confirmed by direct resolution test:

| query                         | before            | after                    |
| ----------------------------- | ----------------- | ------------------------ |
| `Coca Cola`, `COCA COLA`      | ok                | ok                       |
| `Coca-Cola`                   | **none** (hyphen) | ok                       |
| `Coca-Cola FEMSA`             | **none**          | ok                       |
| `Coca Cola Refrescos de Cola` | **none**          | ok                       |
| `Pepsi`, `Cola`, `fjkdslx`    | none              | none (no false positive) |

This is the [[entity_name_linking]] "hyphen / México naming" gap, concretely reproduced.
~52 of 164 cierre accounts are multi-word → exposed to the same class.

## Fix

`matchNorm()` in `aura-rbac.ts` — `normalizeMarca` **plus** folding `-_/` to spaces and
collapsing whitespace. **For COMPARISON ONLY** — never a stored key (stored norms use
`normalizeMarca`, hyphens preserved; changing that would require re-deriving every
stored norm). Wired into two resolvers:

- **`resolveCierreAccounts`** — after the exact match, three fallbacks on the in-scope
  rows (fetched once): (2) **loose-exact** (`matchNorm(cuenta_norm) === matchNorm(q)`),
  (3) **loose advertiser-norm**, (4) **whole-token subset** — a cierre account whose
  tokens all appear in the query (`Coca-Cola FEMSA` ⊇ `coca cola`). Whole-token, never
  substring; **≥2-token accounts only** so a lone common token can't over-match; `>1`
  match → `ambiguous` (the agent disambiguates). No-guess preserved.
- **`resolveAnunciante`** (grep-sweep — same gap) — added a **loose-exact** pass
  _before_ the existing substring `LIKE` fallback (precise, fewer false positives than
  the substring it precedes).

## Lessons

- **Two data sources, two spelling conventions.** The cartera writes plain
  ("COCA COLA"); the advertiser/corpus writes formal ("Coca-Cola México",
  "Coca-Cola FEMSA"). A resolver that bridges them must be punctuation- and
  extra-token-tolerant — but still no-guess (ambiguous over a wrong pick).
- **Loosen the COMPARISON, not the stored key.** Changing `normalizeMarca` globally
  would desync every stored `*_norm`. A comparison-only `matchNorm` is surgical.
- **Whole-token subset > substring.** Substring `LIKE %coca cola%` both misses (hyphen)
  and false-positives (LG ⊂ coLGate). Whole-token subset with a ≥2-token floor is the
  safe middle. → [[entity_name_linking]].
- **"Agent doesn't know X" is rarely the model.** Walk data presence → tool called? →
  resolution → before blaming inference. Here the radiografía proved the agent knew the
  brand; only one resolver missed.
