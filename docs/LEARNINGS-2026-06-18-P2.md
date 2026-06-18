# Learnings — Aura P2 build + firewall fix (2026-06-18)

P2 = indexing the Aura corpus into the engine's hybrid RAG with firewall + RBAC at recall, the
qa-audit that found two criticals, the deploy, and the brand-key fix the operator's challenge
triggered. Lessons, headline first.

## 1. A per-document free-text field is unreliable as a scoping/security key — key on structure

The firewall first keyed on `marca`. But **254/320 brand folders (79%) tag their findings with 2–4
different marca strings** — case, accents, typos (`Lievité`), mojibake (`Levit#U00e9`), wording
(`Bonafont` vs `Bonafont Agua Natural`). Normalizing case/accent (`marca_norm`) only got it from 684
to 629; it can't unify wording/typos. So a brand's findings were split across values and a session
**silently retrieved 50–75% of its own brand**. Secure (zero leak) but incomplete. The fix was to key
on the **folder slug** (`brand-intelligence/<slug>/` — one folder = one brand, always consistent).
**Takeaway:** when you need a stable key, use the stable structural fact (the folder), never a field
authored per-document by humans.

## 2. Don't gate security on an operator-supplied flag

The firewall originally trusted `aislado_por_cliente`; a single finding mislabeled `aislado=0` would
have leaked cross-brand. Gate on the **intrinsic** fact (the finding HAS a brand → it's locked to it),
with the flag only as a secondary signal. One mislabel must not defeat the boundary. (qa-auditor C1.)

## 3. Two corpora in one table → the least-restrictive consumer bypasses the other's governance

Aura docs share `crm_documents` with the persona-scoped Drive RAG. A **VP** Drive search uses an empty
persona filter (no filter) — so it would have surfaced aura-kb docs (persona_id NULL), bypassing the
firewall + RBAC entirely. Fix: exclude `source='aura-kb'` on every shared query. **Audit the most
permissive caller, not the typical one.** (qa-auditor C1b.)

## 4. Measure where the problem actually is before fixing it

The `#UXXXX` mojibake looked pervasive (257 files). Grepping showed it was **99% in `archivo_origen`,
a frontmatter field that is never indexed** — the body was clean and only **12 `titulo`s** (of 971)
were affected. A reflexive "clean + re-embed everything" would have mis-prioritized. One grep
(`where does it appear: titulo vs archivo_origen vs body`) reframed the whole task.

## 5. Separate the cheap fix from the expensive one

The firewall fix (brand_key) needed **no re-embedding** — `backfillBrandKeys()` is a pure `UPDATE`
keyed by `source_id`, so the live DB's firewall was corrected instantly at zero cost, while the good
Fireworks vectors were untouched. The content cleanup (12 titulos) needed a re-embed, deferred to a
`--reindex`. **Don't couple a free metadata fix to a paid re-embed** — and never run an incremental
sync over edited content with no embedding provider (it would overwrite real vectors with the local
hash fallback).

## 6. Migration ordering: index a migrated column AFTER its ALTER, not in the CREATE block

`CREATE INDEX … ON crm_documents(brand_key)` sat in the CREATE-TABLE block. On a fresh DB that's fine.
On an **existing** DB, `CREATE TABLE IF NOT EXISTS` is a no-op, the column doesn't exist yet (the ALTER
that adds it runs later in the migration section), so the index creation threw `no such column:
brand_key`. The live backfill surfaced it immediately. **Governance/added-column indexes belong in the
migration section, after the ALTERs.**

## 7. Run qa-auditor as a gate on security-critical code

The adversarial pass found two criticals the as-written tests missed (the flag-trust leak and
ungoverned README indexing). On a firewall, the cost of the audit is trivially repaid.

## 8. Trust the domain owner's "that number is wrong"

"684 brands is double the real count" → investigating it revealed the marca inconsistency and the
under-retrieval defect behind it. The count wasn't just cosmetically wrong; chasing _why_ it was wrong
found a real bug. When the operator challenges your output, dig into the cause, don't defend the number.

## 9. Operationalizing claude.ai-Projects content = re-hosting, not loading

The corpus assumed human copy-paste orchestration (`project_knowledge_search`, "pega el prompt"). P2
re-hosts retrieval into the engine's RAG; P3 re-hosts the orchestration (the skill bodies become a
coaching state machine). Read delivered content for its execution assumptions, not just its domain.
