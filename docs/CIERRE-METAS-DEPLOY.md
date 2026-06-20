# Deploy — Cierres 2026 / Metas 2027 closing-goal layer

What's already applied (host side, done):

- Schema `cierre_meta` + `cierre_meta_linea` created; `cuenta_id` FK migrated to `ON DELETE SET NULL`.
- Data loaded into `data/store/crm.db` (164 accounts × 3 escenarios; reconciles to $8,499M / $7,404M / $7,844M).
- Live group folders regenerated (`npm run sync:templates`) — Gerente + Director CLAUDE.md now teach `consultar_metas_cierre`.

What remains (operator — touches the LIVE `agentic-crm` service; do at a low-traffic moment):

```bash
cd /root/claude/Pulso-Aura-Upfront

# 1. Rebuild the agent container image so the in-container agent-runner has the new tools + cierre module.
#    (crm/src changed → the running image is stale until this. Not disruptive on its own.)
npm run build:container

# 2. Check for in-flight agent tasks BEFORE restart — a restart SIGTERMs them (no retry, silent stall).
#    Look at recent activity / open WhatsApp conversations; restart when quiet.

# 3. Restart the engine to spawn agents from the new image + read the regenerated persona folders.
crm-ctl restart        # or: systemctl restart agentic-crm

# 4. Verify boot + that a closing tool is reachable.
systemctl is-active agentic-crm
journalctl -u agentic-crm -n 30 --no-pager | grep -i "router active\|error" || true
```

Refresh the data later (the sheet is "A Semana 24" — it will change):

```bash
# Re-export the sheet to the two CSVs (seed/cierre-metas-headers.csv + seed/cierre-metas.csv), then:
npm run seed:metas     # idempotent upsert; relink by (gerente, account)
```

Notes:

- The closing tools are **Gerente + Director only** (VP = observer). They never reach AE.
- All figures are **internal coaching material** — the persona + tool descriptions mark them "jamás al cliente"; the summary string is also prefixed `[Interno …]`.
- 6 pilot accounts have closings but no CRM account (PRIME, CHANEL, SPOTIFY, LEGO, NEWELL, OFFICE MAX) — loaded unlinked; create/alias the `cuenta` to link them into the brand intelligence.
