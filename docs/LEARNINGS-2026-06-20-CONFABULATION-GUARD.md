# Anti-confabulation: never let a fabricated tool result reach the user — 2026-06-20

## Symptom

The operator reported the agent "suddenly can't fetch advertisers or brands —
looks like a DB issue." On WhatsApp the agent replied to "¿cómo viene Bayer de
México?" (and Nissan, Procter) with raw JSON sent verbatim to the chat:

```
{ "error": "No p se encontró la cuenta con nombre 'Bayer de México'.", "sugerencias": [ "BAYER", "BAYER Mexico" ] }
```

## Diagnosis — NOT a DB issue

Evidence ruled out every data/infra cause and pinned it on the **model**:

- `data/store/crm.db` — 207 MB, `integrity_check = ok`, correct Pulso-Aura DB
  mounted into the container. `cuenta` = 216 rows; `BAYER`, `NISSAN`,
  `PROCTER & GAMBLE` all present.
- The `crm_tool_usage` ledger showed `consultar_cuentas` ran four times in the
  failure window — **every one `success=1`, 1–2 ms.** The tool returned the full
  account list (Bayer included).
- The payload is fabricated, not a real tool error: (1) the typo **"No p se
  encontró"** — no code emits that; (2) the real tool error wording is `"No
encontré la cuenta \"X\" o no tienes acceso."` (different); (3) the
  `sugerencias` field **exists in no tool in the codebase**; (4) the suggestion
  `"BAYER"` is correct → the model SAW it in the real result, then wrapped it in
  a fake not-found instead of answering.

So the model (qwen3.7-plus) **mimicked the tool-result JSON it sees in its
context and emitted it as its own message** — a confabulation, while the tool
had actually succeeded.

A second, latent contributor: the singular account resolver `findCuentaId` used a
one-directional `nombre LIKE '%query%'`. The advertiser spelling "Bayer de
México" is a **superset** of the cartera name "BAYER", so the LIKE missed it →
genuine not-found on singular tools → fed the model's flailing.

## Fix (two layers + one prompt backstop)

### 1. Deterministic delivery guard (the hard backstop) — `engine/`

`engine/src/delivery-guard.ts` → `isRawToolResultLeak(text)`: if the whole
outbound message parses as a JSON object/array, it is a tool-result format leak
(a sales rep is never the audience for raw JSON). Wired into the delivery
boundary in `engine/src/index.ts`:

- If a chunk is a JSON leak → **suppress it** (don't send, don't mark
  `outputSentToUser`), log a warning, set `lastChunkWasSuppressedLeak`.
- Post-loop: if nothing real was sent → the existing never-go-silent fallback
  fires; else if the **final** deliverable was a suppressed leak → send a clean
  "tuve un problema al entregarte ese resultado, ¿me repites la consulta?" so the
  user is never left on an acknowledgment with the answer eaten.

This is model-independent: a fabricated tool-result JSON **cannot** reach the
user, ever. It is the structural guarantee behind "never confabulate."

### 2. Name-variant sweep into `findCuentaId` — `crm/src/tools/helpers.ts`

Mirrors `resolveCierreAccounts` (commit `d2c0d71`) — the same name-variant class,
swept into the general account resolver. After the unchanged substring LIKE
(step 1), three fallbacks on the in-scope rows: loose-exact (`matchNorm`),
advertiser path (`resolveAnunciante` → `cuenta.anunciante_norm`), and whole-token
subset ("Bayer de México" ⊇ "BAYER"). **Resolves only on a unique match** — >1
distinct account → `null` (no-guess). Single-token brand accounts are allowed in
the token-subset step because the unique-match guard is the safety net.

### 3. Prompt backstop — `crm/groups/global.md`

New "## Veracidad de datos — OBLIGATORIO" section: never invent/simulate tool
results, never emit raw JSON to the user, use real tool output, state empties
plainly. The point-of-use reinforcement for the natural-language confabulation
the delivery guard can't catch (a false claim in prose). Per the session's own
lesson, the prompt is the weak lever — the delivery guard is the hard one.

## Lessons

- **"Agent can't fetch X" is usually NOT a DB issue.** Pull the tool-usage ledger
  first — `success=1` on the tool call means the data flowed; the failure is
  downstream (the model). A typo or an unknown field in the "error" the user sees
  is the tell that the model fabricated it.
- **A reasoning model mimics the JSON it sees.** Feeding large raw tool-result
  blobs into context invites the model to emit tool-result-shaped JSON as its
  own message. The robust defense is a **deterministic guard at the delivery
  boundary**, not a prompt rule — a user message that is bare JSON is always a
  leak in a chat product; suppress it structurally.
- **Sweep the bug class, not the instance.** The one-directional-LIKE
  name-variant gap was fixed for cierre (`d2c0d71`) but left in the general
  resolver. Same class → sweep it. (Flagged, not fixed here: `personaIdFromName`
  in the same file has the identical one-directional LIKE — a latent recall gap,
  but it can no longer cause user-visible confabulation because the delivery
  guard is entity-agnostic.)

## Deploy

- `crm/src` (findCuentaId) is **baked into the agent image** (`Dockerfile` `COPY
src/` + `RUN npm run build`) → `npm run build:container` + container respawn.
- `crm/groups/global.md` → `npm run sync:templates` (regenerates
  `groups/crm-test/CLAUDE.md`) + respawn.
- `engine/src` (delivery guard) runs in the **host tsx process** → clear
  `/tmp/tsx-0/` + `crm-ctl restart`.

Tests: `engine/src/delivery-guard.test.ts` (9), `crm/tests/find-cuenta-id.test.ts`
(11), `crm/tests/templates.test.ts` (+3). qa-auditor PASS (0 Critical).
