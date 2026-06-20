# Learnings — Upfront closing goal (Cierres 2026 / Metas 2027) into Aura (2026-06-20)

Wiring the operator's closing-goal sheet into the agent so the closing companion has the
**number in the rep's context**: how much each account closed in 2026, how much of that was the
World Cup (Mundial) halo that won't recur, the recurring base, and the 2027 target — with the
retention argument built for a non-World-Cup year.

## 1. The sheet's three tabs ARE the three scenarios — store all three, don't recompute

The sheet had 3 tabs (`Base`, `2026`, `Metas 2027`) that map cleanly to 3 escenarios per account:
`cierre_2026` (actuals **incl.** Mundial), `base_2026` (recurring base, **ex-**Mundial), `meta_2027`
(target). The ex-Mundial base is **not** `cierre − mundial` — the operator also reallocates (e.g.
adds Roku) — so storing each tab's authoritative values beats deriving the base by subtraction.
The World Cup money to defend/replace = the `es_mundial` media lines of the `cierre_2026` tab
(`mundial_tv/digital/radio`), isolated with a flag so base/meta carry **zero** Mundial.

## 2. A composite (gerente, account) EXACT-norm key beats advertiser fuzzy-matching

The earlier seeding session fought advertiser-name fuzzy matching (the LG→Colgate trap). Here the
join key is `(gerente_code, normalized account name)` — and because the accounts were seeded from
the **same** cartera, an **exact** normalized-name match within the gerente links 126/132 with
**0 ambiguous**. Exact-norm is stricter and safer than whole-token-subset; reach for it when both
sides came from one source. The 6 unmatched are genuine coverage gaps (PRIME, CHANEL…), loaded
`cuenta_id NULL` (not dropped) and reported — same no-guess posture as [[feedback_entity_name_linking]].

## 3. Coaching prose must BRANCH on the data, not emit constants

First cut of `cierreCoachingSummary` hard-stated "of which $X was Mundial" and "lead with the
recurring base" for every account. The adversarial audit caught that **119/164 accounts have zero
Mundial** (→ a nonsensical "recover $0.0M") and **5 have a zero base** (→ "defend the base" on $0).
Fix: branch on `mundial > 0` and `base > 0` — drop the Mundial bullet when there's no halo, switch to
net-new framing when there's no base. This is the derive-explanations-from-data rule
([[feedback_derive_explanations_from_data]]): branch on the actual field, never interpolate a value
into a sentence that assumes it's non-zero.

## 4. A new FK's ON DELETE matters when the project has a known DELETE workflow

`cierre_meta.cuenta_id` defaulted to `ON DELETE NO ACTION`. With `foreign_keys=ON` (db.ts) that
**RESTRICTs** a parent delete — and this project **does org-trims that DELETE cuentas** (we ran one
this very session). A future trim would hard-block on all 126 linked rows. Fix: `ON DELETE SET NULL`
(the loader already tolerates `cuenta_id NULL`), via a guarded table-rebuild migration mirroring the
existing Phase-11/12 pattern (foreign_keys OFF → create `_new` → copy preserving `id` → drop → rename
→ recreate indexes → foreign_keys ON). When you add a FK, pick its ON DELETE against the project's
**actual** lifecycle, not the default.

## 5. built ≠ integrated: the live group folders are a SEPARATE layer from the templates

The tool was correctly registered in `getToolsForRole` (the model _could_ call it), but the persona
prompt that teaches _when_ to call it (the Modo Cierre Paso 1 weaving) lives in
`groups/<folder>/CLAUDE.md` — a **frozen copy** of `global.md + role.md` baked at registration. Editing
`crm/groups/*.md` does nothing for the running agent until those folders are regenerated. Built a
reusable `scripts/sync-group-templates.ts` (`npm run sync:templates`) for the Terminology-Protocol
layer-2 step; it also retroactively fixes folders generated before the gerente→manager.md mapping
([[fork_inherits_deploy_paths]] sibling: the deploy artifact is downstream of the source).

## 6. Roles gate features: VP is an observer, so the closing tools are Gerente + Director only

`VP_TOOLS` deliberately excludes the entire radiografia/closing toolchain (VP observes). Adding the
closing-goal tools to VP would have been inconsistent — the closing companion is **Dir + Ger**. The
audit verified `getToolsForRole`: gerente 61, director 72, vp 64 (unchanged), ae 51. Match a new
tool's role set to the _existing_ access pattern of its neighbors, not to "everyone senior."

## Audit outcome

5-dimension adversarial workflow (math, entity-linking, integration, coaching/safety, schema):
**1 critical** (stale live folders — fixed via sync), **3 warnings** (zero-Mundial prose, zero-base
prose, FK ON DELETE — all fixed), **10 infos** (8 no-op confirmations + 2 cosmetic count fixes).
Math reconciled exactly: 2026 **$8,499M** (WC **$1,228M**), base **$7,404M**, target **$7,844M**.
