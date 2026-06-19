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

## Deferred / next

- P3.1 ships the recognition + architecture + **Step 1 (intelligence pull) live**. The deep
  ARMAGEDDON radiografía→preventa assembly is **P3.2**; DARK/STAKEHOLDERS war-room read-path is
  **P3.3**; proactive near-close trigger + WhatsApp delivery is **P3.4**.
- Live `groups/*/CLAUDE.md` regenerate from these templates at deploy (`register.ts`) — never
  hand-edit the live files; edit the templates.
