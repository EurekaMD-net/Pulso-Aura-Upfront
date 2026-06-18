# Learnings — Aura KB ingestion (2026-06-18)

Session: acquired the Aura methodology corpus from Drive, verified/normalized it into `aura-kb/`,
designed the operationalization, and prepped P2. Lessons that generalize:

## 1. Headline counts can check out while the corpus is internally inconsistent

The corpus matched its own stated numbers **exactly** (320 brands / 969 findings / 19 skills), which
is reassuring and misleading. Underneath: 3 taxonomy values used but never registered (`estable`,
`campanas_temporalidades`, `inteligencia_social`), 2 brand folders with spaces breaking kebab-case,
and the router naming 9 skills that don't exist. **Verify a delivered corpus against its own
taxonomy and its own cross-references, not just its counts.** Counts are necessary, never sufficient.

## 2. Machine-checked invariants pass while human prose drifts

`gen_registry.py` verifies the skill graph (`depende_de`/`alimenta_a`/`acompana_a`) has zero broken
edges — and it was clean. But the router's natural-language catalog named 9 nonexistent skills
(`nexus-ctv`, `futbol-liga-mx`, `aria`, …). The structured layer was coherent; the prose layer was a
larger, older vision. **Check both the machine-verified frontmatter and the free prose; an agent that
drives off the prose will try to invoke skills that aren't there.**

## 3. The authoring environment is a design constraint hiding in the content

The methodology was written for **claude.ai Projects**: handoffs are "pega el prompt," retrieval is
`project_knowledge_search`, "una sesión = un cliente." That's not decoration — it dictates that
operationalizing = **re-hosting copy-paste orchestration into an autonomous engine**, not "load the
files." **Read delivered content for its execution assumptions, not only its domain.**

## 4. Derive governance from the data; don't assume it

Grepping the corpus turned soft rules into enforceable facts: the firewall is **universal** (969/969
`aislado_por_cliente=true`), and `rol_minimo` forms a clean cumulative lattice
(`transversal < comercial_kam < estrategia_research < restringido_senior`), with `direccion_clevel`
unused. Those greps fixed the load-bearing RBAC decision (Gerente/Director must clear
`estrategia_research`, else 75% of brand intel goes dark) and the firewall design — facts, not guesses.

## 5. Don't execute unvetted scripts shipped inside a delivered corpus

The auto-mode classifier blocked running `gen_registry.py` (external code from a Drive zip). Correct
call — I re-implemented the graph/taxonomy verification read-only with my own transparent checks.
**A delivered corpus's tooling is also untrusted; reproduce its checks, don't run its code.**

## 6. A formatter that pads markdown tables defeats exact-match editing

Prettier aligned the table columns after each edit, so `Edit`'s exact `old_string` match kept failing
on the variable padding. The robust tool there was a line-anchored delete (`sed '/^| .../d'`) — but
only after verifying the dedicated edit tool genuinely couldn't do it cleanly. **Match the tool to the
formatter's behavior; verify the default tool fails before reaching for the sharp one.**

## 7. Make IP changes reversible and explicit

Cutting the 9 phantom skills from the router could have erased the operator's roadmap. Instead the cut
left an explicit "deferred availability" note listing all 9, and the corpus was committed verbatim
first (recoverable from the Drive zip) with the deltas in a change log. **When normalizing someone
else's IP, prefer reversible, documented edits over silent deletion.**
