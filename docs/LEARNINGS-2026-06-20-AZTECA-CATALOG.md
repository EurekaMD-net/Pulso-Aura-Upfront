# Recommendations grounded in Azteca's real catalog — 2026-06-20

## Problem

The agent was (a) a bit verbose and (b) recommending channels Azteca doesn't sell
("refuerza inversión en Disney+ y YouTube Premium"). The Modo Cierre prompt said _"la
recomendación es **siempre multimedia**"_ with **no bound on what "multimedia" means**,
so the model filled it from the open market (YouTube, Amazon, Netflix). The `inventario`
table is empty → no grounding.

## Two corrections from the operator (important)

1. **Disney+ IS Azteca's.** Azteca resells third-party streaming/CTV — it's not just its
   own channels. My first guardrail wrongly forbade Disney+.
2. **Only the 2027 sheet is sellable.** The source of truth is the **`meta_2027`
   escenario**. There is **no AMX and no Mundial in 2027** (those are 2026-only).

## Source of truth

`cierre_meta_linea.medio` for `escenario='meta_2027'`:
**TV · Disney+ · CTV · Roku · Fox · Digital · Radio** (7 media). NOT 2027: `mundial_*`
(World-Cup halo, the _gap to replace_), `amx`, `promoespacio` (2026-only).

## Fix

- **Guardrail** (`crm/groups/global.md`, shared by all roles): recommendations come ONLY
  from the 2027 catalog; "multimedia" = that catalog; the `consultar_metas_cierre` "fruta
  al alcance" (what the advertiser already buys) is where to grow first; out-of-catalog
  channels (YouTube/Amazon/Netflix) appearing in the radiografía are **diagnosis**
  (whitespace to capture _with_ Azteca media), never a buy option; Mundial reframed as the
  brecha to replace.
- **Brevity** rule: lead with the concrete option; context is the minimum that supports it
  (keeps _some_ context — the operator values it — but not an essay).
- **Dynamic catalog injection** (no hardcoded list — it was corrected twice):
  `sellable2027Catalog()` in `crm/src/cierre/query.ts` queries the live `meta_2027` medios
  and labels them (`MEDIO_LABEL`); `copyRoleTemplate` (`register.ts`) substitutes the
  `{{CATALOGO_2027}}` placeholder in the prompt at sync/registration time. Re-seed the
  sheet + `npm run sync:templates` → the prompt's allowlist updates itself. Guarded
  fallback if metas aren't loaded.

## Lessons

- **Ground "recommendations" in the sellable inventory, never the model's market
  knowledge.** An unbounded "be multimedia" invites the open market; bind it to the
  catalog data.
- **The sellable set is the SHEET, not a hand-maintained list.** A hardcoded allowlist
  got corrected twice in one session. When a list mirrors data that changes, inject it
  from the data (placeholder substituted at template-build time) — the per-account tool
  output (`consultar_metas_cierre` medios) is the runtime source of truth; the injected
  catalog is the prompt-level backstop, and both come from `meta_2027`.
- **Don't assume "Azteca = only Azteca's own channels."** They resell (Disney+, Roku,
  Fox). Confirm the catalog from the data before writing a denylist.
- The unbounded directive lived in `manager.md`/`director.md` ("siempre multimedia"); the
  bound now lives in the shared `global.md` so it can't drift per role.

## Follow-up — the guardrail didn't stick on qwen3-32b (model adherence)

After deploying the catalog guardrail, the agent KEPT suggesting off-catalog channels —
first YouTube, then TikTok/Instagram/Amazon/influencers. Verified: the guardrail WAS in the
running container's prompt (deployment fine), and the radiografía data has **zero** YouTube
mentions — the model was **free-associating the open-market playbook from its training**.

**Root cause:** a guardrail buried in a ~45KB system prompt doesn't hold on a 32B model
asked to "propose a strategy." Two fixes, layered:

1. **Constraint at the POINT OF USE.** `cierreCoachingSummary` (returned by
   `consultar_metas_cierre`) now ends with a hard line: _"MEDIOS VENDIBLES 2027 (los ÚNICOS
   …): TV · Disney+ · … NO propongas NADA fuera: YouTube, TikTok, Instagram, Amazon …"_.
   In the tool output (conversation), it's far more salient than a system-prompt rule.
   Also bounded the `manager.md`/`director.md` "siempre multimedia" line explicitly.
2. **Stronger model.** Inverted the providers — **primary → Fireworks `qwen3.7-plus`**,
   fallback → Groq `qwen3-32b` (`scripts/set-inference-providers.ts fireworks`, now
   parameterized; bumps `INFERENCE_MAX_TOKENS`→4000 for the reasoning). qwen3.7-plus had the
   best instruction-following + synthesis in the benchmark; the latency cost (≈0.9s→4.2s) is
   worth correct in-catalog behavior for a closing companion.

**Lesson:** for a hard behavioral constraint, **a system-prompt rule is the weakest lever**.
Put it in the tool output (point of use), and if the model still free-associates, the model
is too weak — escalate. Don't keep re-wording a prompt a model can't follow (the 3-strike
rule applies to prompt-tweaking too). → [[feedback_inference_provider_thinking_mode]].
