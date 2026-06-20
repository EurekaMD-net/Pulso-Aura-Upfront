# VP C-level visibility + demo persona switch — 2026-06-20

## VP now sees the full closing-intelligence layer (read-only)

**Why:** "¿cómo viene Colgate para el cierre 2027?" is an obvious VP question, but the
VP persona had none of the closing tools — it saw Colgate only as an empty CRM account.

**Root cause:** the closing-intelligence tools were Gerente/Director-only in `VP_TOOLS`,
even though **VP clears `direccion_clevel` — the TOP RBAC floor** (`aura-rbac.ts`,
strictly above director). The intelligence was always meant to be VP-visible; the tools
were never wired in. The fix belongs in **role permissions, not the persona**.

**Change:** added the 6 **read-only** intelligence tools to `VP_TOOLS`
(`consultar_metas_cierre`, `consultar_metas_portafolio`, `buscar_inteligencia_marca`,
`armar_radiografia_marca`, `armar_radiografia_anunciante`, `mapa_poder_anunciante`).
VP **sees** everything (visibility); it does **not** run the operational Modo Cierre
coaching (ARMAGEDDON/DARK/STAKEHOLDERS) — that stays Ger/Dir.

- `crm/src/tools/index.ts` — VP_TOOLS 64→**70**; no mutation tools added.
- `crm/groups/vp.md` — "visibilidad C-level" section (observer framing); no operational tokens.
- `crm/groups/global.md` — dropped the stale "Solo Gerente/Director" qualifier (it would
  have made the VP agent refuse a tool it now holds — the confabulated-block trap).
- `templates.test.ts` — gate split: the operational closing-mode prohibition stays for
  AE+VP, but VP now legitimately carries the read-tool **names** (AE still gated out).
- `agent-runner.test.ts` — VP 70 tools + invariant tests (has the 6 read tools, **zero**
  mutation tools). AE/Ger/Dir unchanged (51/61/72).

Verified end-to-end against the live DB: VP global scope resolves Colgate
(2026 $115M, Mundial $0, base $121M, meta 2027 $127.65M).

## `crm-ctl set-persona` upgraded (the demo switch)

The base crm-ctl `set-persona` was hardwired to the `main` folder and **did not
regenerate the prompt** — so a _cross-role_ switch (vp→director) left a stale prompt
(tools changed, but the agent was never taught the new role's flow). Upgraded:

- Resolves the persona by **id OR name** (`crm-ctl set-persona "Juan Carlos Gamba"`).
- Auto-targets the live registered group's folder (falls back to `main`).
- **Regenerates the role prompt** via `copyRoleTemplate` (Modo Cierre for Ger/Dir,
  observer framing for VP), purges the session, kills the container → next message
  respawns as the new persona.

Demo trio on the Test VPS group: `VP Prueba` (observer), `Juan Carlos Gamba` (director,
sees his 4 gerentes), `ACL` (gerente, owns Colgate). Same data, three role lenses.

> The agent caches persona/tools/prompt at container startup, so a switch **must**
> respawn the container (kill it; the engine's `finally` clears state and the next
> message spawns fresh). No engine restart needed.
