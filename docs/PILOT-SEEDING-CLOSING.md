# Pilot Seeding — Closing companion (cierres) stage

What to seed before the **closing companion** pilot, and nothing more. Scope is the cierres/Modo
Cierre path only (P3.0→P3.5 + the P3.4 proactive trigger). The Snowflake factual layer (P4) is
**additive and not required here** — the companion runs without it (factual queries return
`unreconciled`, gracefully).

## The narrowing insight

The **intelligence side needs zero seeding.** `buscar_inteligencia_marca`, `armar_radiografia_marca`,
and `armar_radiografia_anunciante` read the already-loaded Aura corpus (320 brands / ~17,986 chunks) +
the `anunciante_marca` map (320 rows). So this seed exists only to:

1. **Make the proactive near-close trigger fire** — the weekly sweep needs `persona` + `cuenta` +
   `propuesta` rows in the closing zone, or it produces zero nudges.
2. **Resolve the real committee** for `mapa_poder_anunciante` — needs `cuenta` + `contacto`, else it
   degrades to `sin_comite` (coach-from-method).

Everything else the closing tools touch is already in the DB.

## Seed in this order (FK chain)

### 1. `persona` — the closing chain

- [ ] **1 Director** + **1–2 Gerentes** (`activo=1`) — they run Modo Cierre and receive the near-close nudge.
- [ ] The **AEs** under each Gerente (`reporta_a` = the gerente's `id`) — the sweep walks
      `propuesta.ae_id → ae.reporta_a` to find the coach.
- [ ] **`whatsapp_group_folder`** on every Ger/Dir (and AE) — the nudge resolves the recipient through it.
- [ ] `id`, `nombre`, `rol` (ae/gerente/director/vp), `telefono`, `email`, `activo=1`.
- Path: `npm run register-team` (from your real org chart). Build **top-down** (Dir → Ger → AE) for the
  `reporta_a` self-FK.

### 2. `cuenta` — pilot advertisers (anunciante-linked)

- [ ] A handful of **pilot anunciantes** — favor **multi-brand portfolios** (P&G, Nestlé, Danone…) so the
      portfolio rollup is non-trivial.
- [ ] `nombre` must **match the advertiser as it appears in the anunciante map** (so it auto-links, and
      later reconciles to Snowflake). `tipo` ∈ directo/agencia.
- [ ] Assign `ae_id` / `gerente_id` / `director_id` to the seeded team.
- [ ] Confirm **`anunciante` / `anunciante_norm` got set** — auto via `solicitar_cuenta`, or run
      `npm run backfill:cuenta-anunciante` after a bulk insert.

### 3. `contacto` — the real committee (strongly recommended)

- [ ] Per pilot cuenta: the **real decision-makers** — `nombre`, `cuenta_id`, `rol`
      (comprador/planeador/decisor/operativo), `seniority` (junior/senior/director).
- [ ] Aim for the **3 who actually decide** (the STAKEHOLDERS war-room ponders these).
- Without this: `mapa_poder_anunciante` returns `sin_comite` and the agent coaches from method only —
  a valid degrade, but a real committee is the point of a closing pilot.

### 4. `propuesta` — deals in the closing zone (the trigger's fuel)

- [ ] Several real in-flight deals at **`etapa IN ('en_negociacion','confirmada_verbal')`** — nothing in
      these stages = the Monday sweep produces zero nudges.
- [ ] Spread them across the pilot AEs/anunciantes so multiple **(gerente, anunciante)** clusters form.
- [ ] `titulo`, `cuenta_id`, `ae_id`, `etapa`, `valor_estimado`, `fecha_cierre_esperado`.

## Wiring (not tables, but closing won't deliver without these)

- [ ] **Register the WhatsApp groups** on the engine — folder names **exactly matching**
      `persona.whatsapp_group_folder` for each Ger/Dir. Delivery + the never-to-client gate resolve
      through `registeredGroups()`. **If these don't match, every nudge silently goes nowhere** — the
      single most common deployment foot-gun.
- [ ] **Verify the link** — every pilot cuenta has `anunciante_norm` set (powers `mapa_poder`, the
      near-close grouping, and the future SF reconcile join).

## Verify before declaring the pilot live

- [ ] Fire the `crm_nearclose_coaching` sweep once (or wait for Monday 07:00 MX) and confirm a nudge
      lands in the correct **Ger/Dir** group — and in **no** client/AE channel.
- [ ] In a Ger/Dir thread, run a closing intent and confirm `armar_radiografia_anunciante` +
      `mapa_poder_anunciante` return the portfolio + the real committee for a seeded anunciante.

## Explicitly NOT needed this stage

- ❌ `cuota`, `contrato`, `descarga`, `inventario` — power quota/gap/package features, not closing.
- ❌ `anunciante_snowflake_map` / Snowflake creds — next stage; the companion runs without it.
- ❌ Relationship intelligence (`relacion_ejecutiva`, …) and all runtime-generated tables
  (`actividad`, `alerta_log`, `insight_comercial`, `perfil_usuario`, templates, …).
- ❌ **Do not hand-seed factual actuals** (last closed amount, inventory mix, descarga over time) — those
  are Snowflake's system-of-record, fetched on demand in P4. Seeding them creates a stale second source.

## Minimum viable closing pilot

1 Dir → 2 Ger → ~4 AEs · ~5–8 anunciante cuentas (linked) · committees on each · ~10–15 propuestas in
`en_negociacion`/`confirmada_verbal` · WA groups registered for the Ger/Dir.
