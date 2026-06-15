# Azteca-Aura — Phase 1 Definitions

> Status: **DEFINITION STAGE** (2026-06-15). Scope is set; the Aura methodology
> content is still being transferred to the operator. No functionality built yet.
> This document is the contract that new functionality + retrieval must satisfy.

## 1. What this is

**Azteca-Aura, Phase 1 = a _closing companion_**, not the full CRM.

TV Azteca will adopt the `crm-azteca` codebase **but deliberately not as originally
intended**. Instead of deploying the whole zero-data-entry / full-pipeline CRM, Phase 1
deploys a narrow, high-value slice: an agent that helps **close deals** for the
**Upfront 2027** selling cycle.

## 2. Temporal scope — Upfront 2027

- The 2027 upfront runs **earlier than usual this year**: selling/closing season is
  **August 2026 → February 2027**.
- "Next year's deals" = the **2027 advertising year** being sold during that window.
- Everything in Phase 1 is oriented around closing within this cycle.

## 3. Users in scope

| Role           | Phase 1 status                                            |
| -------------- | --------------------------------------------------------- |
| **Director**   | ✅ Active user — closing companion                        |
| **Gerente**    | ✅ Active user — closing companion                        |
| AE (Ejecutivo) | ⛔ Out of scope in Phase 1 (dormant)                      |
| VP             | 👁 Acceptance evaluator / observer (not a daily user yet) |

Role-scoping is a hard invariant (see crm-azteca architectural invariants). Phase 1
narrows the active surface to **Gerente + Director** only.

## 4. Job to be done

When a deal is **at / approaching closing**, the agent helps Gerentes and Directores:

1. **Tell a good story** — narrative framing of the deal / account / value.
2. **Elaborate closing arguments** — structured, persuasive argumentation to close.

Both are produced **using the _Aura methodology_** (see §6).

## 5. Explicitly NOT in scope (Phase 1)

Dormant until the acceptance gate (§7) passes — code is inherited but not surfaced:

- Full pipeline tracking / zero-data-entry capture
- AE-level tooling and personas
- Overnight commercial engine, package builder, cross-agent patterns as primary surface
- New TV-Azteca data connectors (Cubo, inventory, contracts, programming) unless required
  to feed a closing argument

The base capabilities still exist in the codebase; Phase 1 simply does not lead with them.

## 6. The Aura methodology (core IP — PENDING TRANSFER)

- A **named methodology** for **storytelling + closing argumentation**.
- **Status: being transferred to the operator now.** Content (frameworks, steps, argument
  structures, examples, language) is **not yet available**.
- **Design implication:** the closing-companion engine must be **methodology-pluggable** —
  scaffold the interface, role-scoping, and the inputs Aura will consume now; encode the
  actual Aura frameworks/prompts once received.
- **This is the substantive blocker** for authoring the closing-argument generation. We can
  build everything around it; we cannot fill it in until the methodology lands.

## 7. Acceptance gate → full rollout

- If Azteca-Aura (the closing companion) is **accepted by the sales reps and the VP**,
  we **"fledge fully"** — unlock the complete `crm-azteca` functionality for Azteca.
- Acceptance criteria / decision owner: **TBD** (business gate).

## 8. Working model (operator-confirmed 2026-06-15)

Azteca-Aura is a **coaching agent, not a document generator**. It runs an
**interactive, step-by-step Aura-methodology dialogue** — asking guiding questions and
**co-building the account's story + closing arguments turn by turn**.

- **Engagement = BOTH on-demand and proactive:**
  - On-demand: the manager pulls it in WhatsApp ("ayúdame a cerrar la cuenta X").
  - Proactive: it watches deals nearing close and nudges the manager to start a session.
- **Grounding = hybrid:** the existing CRM data we already hold (account, proposal/deal,
  relationship, inventory) **+** the specifics the manager supplies mid-dialogue.
- **Output = the coached dialogue itself** (turn-by-turn), not a one-shot brief.

### Build implications (all pluggable around the pending Aura method)

1. **Aura encodes as a guided dialogue flow** — a coaching state machine (questions →
   co-build), not a prompt template. This is the core IP slot.
2. **Proactive trigger** needs a deal-stage / "near-close" signal — reuse the inherited
   pipeline `etapa` + an overnight-style scan.
3. **Delivery reuses the existing WhatsApp agent**, scoped to Ger/Dir, with the coaching
   flow as a mode.
4. **Retrieval** leans on the inherited schema (no new live connectors required for
   Phase 1) + in-dialogue rep input.

## 9. Still open

1. **Aura methodology content** — form (framework / steps / worked examples) + ETA. The
   substantive blocker; everything above is built around it.
2. **Acceptance criteria** for the §7 gate (what makes reps + VP say yes).
