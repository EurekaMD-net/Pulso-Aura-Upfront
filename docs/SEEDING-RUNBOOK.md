# Seeding Runbook — wiring the sales force + accounts into Aura

Goal: give Aura the **client/sales-force** side so it joins to the **brand** side
it already has (320-brand corpus + the 320-row `anunciante_marca` map). Once
`persona` + `cuenta` are seeded, a Gerente/Director can pull, for any of their
accounts: the per-brand radiografía, the anunciante portfolio rollup, and (once
contactos are seeded) the real committee power-map.

> The **intelligence side needs zero seeding** — it's already live in
> `data/store/crm.db`. This runbook only seeds the org + accounts that point into it.
> See `docs/PILOT-SEEDING-CLOSING.md` for the closing-pilot scope rationale.

## Order (FK chain — do it top-down)

```
persona (VP→Dir→Ger→AE)  →  cuenta (anunciante-linked)  →  [contacto]  →  [propuesta]
```

`contacto` (stakeholders/committee) and `propuesta` (closing-zone deals) are
**deferred** for now — seed them later (templates + steps below are ready).

---

## 1. `persona` — the sales force ✅ tooling exists

Fill `seed/personas.csv` (copy `seed/personas.example.csv`). Columns:

| column         | required | notes                                                       |
| -------------- | -------- | ----------------------------------------------------------- |
| `name`         | yes      | full name; the group folder = `role-firstname-lastname`     |
| `role`         | yes      | `ae` \| `gerente` \| `director` \| `vp`                     |
| `phone`        | yes      | E.164, e.g. `+5215512345678`                                |
| `email`        | no       | for Google Workspace tools later                            |
| `manager_name` | no       | the person they report to (must match a `name` in the file) |

Then:

```bash
cd /root/claude/Pulso-Aura-Upfront
npm run register-team -- --file seed/personas.csv
```

This inserts the `persona` rows (resolving `reporta_a` from `manager_name`,
top-down), and creates each person's `groups/<role-first-last>/CLAUDE.md` from
the role template. **`id` and `whatsapp_group_folder` are generated** — you don't
supply them.

Verify:

```bash
sqlite3 data/store/crm.db "SELECT rol, nombre, whatsapp_group_folder, reporta_a FROM persona ORDER BY rol;"
```

---

## 2. `cuenta` — the accounts (anunciante-linked) ✅ new seeder

Run **after** personas (ownership resolves against them). Fill `seed/cuentas.csv`
(copy `seed/cuentas.example.csv`). Columns:

| column            | required | notes                                                                         |
| ----------------- | -------- | ----------------------------------------------------------------------------- |
| `nombre`          | yes      | account display name                                                          |
| `tipo`            | yes      | `directo` \| `agencia`                                                        |
| `ae_name`         | yes      | the owning AE's `name`; gerente+director are derived up the `reporta_a` chain |
| `anunciante`      | no       | set ONLY when `nombre` ≠ the advertiser as it appears in the map (else omit)  |
| `vertical`        | no       | e.g. Consumo, Alimentos, Farma                                                |
| `holding_agencia` | no       | for `tipo=agencia`                                                            |
| `agencia_medios`  | no       | for `tipo=agencia`                                                            |
| `anos_relacion`   | no       | integer                                                                       |
| `notas`           | no       | free text                                                                     |

Then:

```bash
npm run seed:cuentas -- --file seed/cuentas.csv
```

The seeder prints a report: **linked / ambiguous / unmatched** advertisers and
any **unresolved AE** names. It **never guesses**: an account name matching >1
advertiser is left unlinked — add an explicit `anunciante` to force it. A null
link is a graceful degrade (radiografía-by-name still works).

Verify the join (every pilot account should have `anunciante_norm` set):

```bash
sqlite3 data/store/crm.db \
  "SELECT nombre, anunciante, ae_id, gerente_id FROM cuenta ORDER BY nombre;"
# Backfill links for any inserted with a null advertiser later:
npm run backfill:cuenta-anunciante
```

---

## 3. Wire the WhatsApp groups ⚠ the #1 foot-gun

Each Ger/Dir (and AE you want active) needs a real WhatsApp group whose
**registered folder exactly matches** `persona.whatsapp_group_folder`. Without
this, the agent never answers in their group and proactive nudges go nowhere.

For each persona group: create the WA group, add the bot's number
(`522205847540`), then register it (same mechanism proven on the Test VPS group):

```bash
# find the folder name:
sqlite3 data/store/crm.db "SELECT nombre, whatsapp_group_folder FROM persona;"
# register a group JID -> folder (trigger @CRM):
sqlite3 store/messages.db \
  "INSERT OR REPLACE INTO registered_groups (jid,name,folder,trigger_pattern,added_at,container_config,requires_trigger) \
   VALUES ('<GROUP_JID>@g.us','<display name>','<role-first-last>','@CRM',datetime('now'),NULL,1);"
systemctl restart agentic-crm   # reloads registered_groups into memory
```

(The bot discovers a group's JID once a message is sent in it — check
`store/messages.db` `chats` for `is_group=1` rows to read the JID.)

---

## 4. `contacto` — the committee (stakeholders) ⏳ deferred

When ready, per pilot account seed the **3 who actually decide**:
`nombre`, `cuenta_id`, `rol` (comprador/planeador/decisor/operativo),
`seniority` (junior/senior/director). Lights up `mapa_poder_anunciante`
(else it returns `sin_comite` and coaches from method only).

## 5. `propuesta` — closing-zone deals ⏳ deferred

Real in-flight deals at `etapa IN ('en_negociacion','confirmada_verbal')` fuel
the Monday proactive near-close sweep. Without any, the sweep produces zero
nudges (on-demand coaching still works).

---

## Verify the loop is live

1. From a Ger/Dir's registered WA group, send a closing intent (e.g. "ayúdame a
   cerrar Procter") → confirm `armar_radiografia_anunciante` + `mapa_poder_anunciante`
   return the portfolio (and committee, once contactos exist).
2. `sqlite3 data/store/crm.db "SELECT count(*) FROM persona; SELECT count(*) FROM cuenta;"`

## NOT this stage

`cuota` / `contrato` / `descarga` / `inventario`, Snowflake creds, relationship
intelligence, and **no hand-seeded factual actuals** (Snowflake is the
system-of-record, fetched on demand in P4). See `docs/PILOT-SEEDING-CLOSING.md`.

## Note on the smoke persona

`smoke-vp` (`VP Prueba`, folder `crm-test`, group Test VPS) is throwaway test
scaffolding from the WhatsApp bring-up. It doesn't collide with real personas
(distinct folder). Remove it before the pilot if you want a clean roster:
`sqlite3 data/store/crm.db "DELETE FROM persona WHERE id='smoke-vp';"`
