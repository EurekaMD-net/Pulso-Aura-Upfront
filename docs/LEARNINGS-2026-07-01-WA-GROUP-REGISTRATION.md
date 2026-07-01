# Learnings — 2026-07-01 — Registering a new WhatsApp group in the live agentic-crm

## Context

Operator asked to deploy a **new WhatsApp test group** into the live `agentic-crm`
service (this repo, `tsx engine/src/index.ts` under systemd, port 3000). Deployed
`Test VPS 2` → folder `crm-test-2`, persona `smoke-vp-2` (rol `vp`), JID
`120363426305179259@g.us` — a byte-for-byte clone of the known-good `crm-test` VP
setup, verified live. No code changed; this is an operational recipe.

## A group registration is FOUR coordinated pieces (miss one → silent failure)

A group's **role/scope** is resolved at message time by
`persona.whatsapp_group_folder → rol` — `crm/src/hierarchy.ts:36`
(`getByGroupFolder`: `SELECT * FROM persona WHERE whatsapp_group_folder = ? AND activo = 1`),
which feeds `buildToolContext(personaId)` (`crm/src/tools/index.ts:128`) → tool
filtering. The role is **NOT** read from the folder's `CLAUDE.md`. So all four of
these must exist and agree:

1. **Group folder** — `groups/<folder>/` with a `logs/` subdir. Folder name must
   match `^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$` and not be `global`
   (`engine/src/group-folder.ts` `isValidGroupFolder`). `registerGroup` silently
   rejects an invalid folder (`engine/src/index.ts:86`).
2. **Rendered `CLAUDE.md`** — `groups/<folder>/CLAUDE.md` = `global.md` + role
   template (`copyRoleTemplate`). For a clone, copying an existing same-role folder's
   rendered `CLAUDE.md` (e.g. `groups/crm-test/CLAUDE.md` = VP template) is
   equivalent and lower-risk than re-running `sync:templates`.
   **`groups/*/CLAUDE.md` is gitignored** — live group folders are runtime state, a
   separate layer from the `crm/groups/*.md` templates. Do **not** commit them.
3. **`persona` row** (`data/store/crm.db`) — grants the scope:
   `INSERT INTO persona (id,nombre,rol,reporta_a,whatsapp_group_folder,email,calendar_id,telefono,activo)
VALUES ('smoke-vp-2','VP Prueba 2','vp',NULL,'crm-test-2',NULL,NULL,NULL,1);`
   Without it, `getByGroupFolder` returns nothing → no `ToolContext` → the group has
   no role.
4. **`registered_groups` row** (`store/messages.db`) — wires the JID to the folder:
   `jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger`.
   Clone `crm-test`: `trigger_pattern='@CRM'`, `requires_trigger=0` (Aura replies to
   every message; set `1` for @-mention-only).

## Capturing the JID: send one message, don't rely on group-sync

The bot only learns a group's JID once it **ingests a message** from it — the inbound
pipeline calls `storeChatMetadata` (`engine/src/index.ts:587`) which inserts the
`chats` row (`jid`, `is_group=1`). **Group-sync alone will NOT surface a fresh group:**
`syncGroupMetadata` (`engine/src/channels/whatsapp.ts:477`) fetches all participating
groups but only calls `updateChatName` (name upsert, `is_group` left null), and it's
rate-gated (daily). So: have the operator add the bot **and send one message**, then
read the new JID from `chats` (`WHERE is_group=1 AND jid NOT IN (SELECT jid FROM
registered_groups)`, newest first). The first message arrives **before** registration
and is ignored — expected; a message after registration gets the first reply.

## No `main` control group → registration is direct DB inserts + restart

The in-chat registration path (`register_group` IPC, `engine/src/ipc.ts:513`) is
**main-group-only** (`isMain`, `MAIN_GROUP_FOLDER='main'`). No group is currently
registered to the `main` folder, so that path is unavailable — the only path is
**direct DB inserts + a service restart**. The restart is required regardless: the
in-memory `registeredGroups` map loads at boot (`State loaded groupCount:N`), and the
persona/tool-context cache is refreshed on boot; a direct DB write bypasses the live
IPC that would otherwise update them.

Restart discipline: check `docker ps` for in-flight `agentic-crm-agent` containers
first (leave the `crm-hindsight` sidecar alone), then `crm-ctl restart`. Confirm boot
logs show `State loaded groupCount:N` (incremented), `IPC file watchers active groups:N`,
and `Connected to WhatsApp`.

## Retiring a test group

Delete the three persisted pieces + restart: the `persona` row, the
`registered_groups` row, and the `groups/<folder>/` directory. The registration
`name` auto-updates to the real WhatsApp subject on the next daily group-sync.

## Durable lessons

- **Role lives in the DB, not the prompt.** A group's scope is `persona.whatsapp_group_folder
→ rol`; a folder + `CLAUDE.md` without a matching `persona` row is a group with no role.
- **A fresh group's JID needs one inbound message** — `updateChatName` (group-sync) is
  upsert-name-only and won't create a usable `is_group` row.
- **With no `main` group, registration is DB-inserts + restart**, not the in-chat IPC.
- **Live group folders are gitignored runtime state** — clone the rendered `CLAUDE.md`,
  never commit it.
