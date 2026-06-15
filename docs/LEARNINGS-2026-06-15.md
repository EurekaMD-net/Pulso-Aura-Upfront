# Learnings — 2026-06-15 — Fork creation + CRM clean-start

Context: standing up **Pulso-Aura-Upfront** as the go-forward repo to wake the
system up for **TV Azteca**, and clearing the VPS down to a clean base.

## What happened

1. **Forked** `EurekaMD-net/crm-pulso` (the crm-azteca codebase) into a new private
   repo `EurekaMD-net/Pulso-Aura-Upfront` — independent, full history (206 commits).
2. **Defined Phase 1** (`docs/AURA-PHASE1-DEFINITIONS.md`): Azteca-Aura is a **closing
   companion**, not the full CRM — it helps **Directores + Gerentes** close **Upfront 2027**
   (selling season Aug 2026 → Feb 2027) by telling a good story + elaborating closing
   arguments via the **Aura methodology** (core IP, still being transferred to the operator).
3. **Clean-started the VPS**: deleted the other crm-pulso clones, fully undeployed
   `agentic-crm` + `crm-hindsight` + backup/mirror, and wiped the kept `crm-azteca` to
   code-only. Two CRM repos remain: `crm-azteca` (code-only) + this fork.

## Lessons

### 1. Verify the canonical remote before forking — don't fork the first local copy

The directory we forked from (`/root/claude/crm-azteca`) sat at HEAD `3148f16` (May 7),
but the **remote tip** of `crm-pulso` was `46957b0` (May 21) — **30 commits ahead**, and a
_different_ local clone (`projects/crm-pulso`) held it. Forking the stale copy silently
dropped 30 TV-relevant commits (Imagen-TV programming grid, `consultar_ingresos_programa`,
accrued revenue per account, Fireworks embeddings, dashboard externalization). **Always
`git ls-remote` the origin and compare against every local clone before treating one as the
base.** (Re-basing this fork onto `46957b0` is an open follow-up.)

### 2. Undeploy ≠ done — the self-healer fights you

After tearing down `agentic-crm` + `crm-hindsight`, mission-control's `watchdog.sh`
(cron every 5 min) **recreated `crm-net` and rebuilt the agent images** within 5 minutes,
and Prometheus fired `HindsightTargetDown` against the removed container. A teardown is not
complete until the **monitoring / self-healing layer** is de-referenced too: watchdog
service loops, `docker network create` / image-rebuild blocks, Prometheus scrape jobs +
alert rules, cron, timers, `/usr/local/bin` wrappers. If a deleted image/network keeps
reappearing with a new ID, suspect the self-healer first.

### 3. Docker single-file bind-mount + editor inode swap

Editing a host file bind-mounted into a container (`prometheus.yml`) and sending SIGHUP
reloaded the **old** content — the editor wrote a new inode while the mount still pointed at
the original. Fix: `docker restart <container>`, not just reload; verify via
`/api/v1/status/config`.

### 4. Preserve hard-to-reconstruct artifacts before a wipe

Three untracked, local-only scripts lived only in `crm-azteca` (TV-abierta + inventario demo
seeders, a Hindsight rollback) — absent from origin and every other clone. They were
committed first (`8ca5dcf`) so the code-only wipe couldn't lose them. The `.env` (API keys)
was backed up out-of-band to `/root/claude/crm-azteca-env.backup-2026-06-15`.

## Next

- Receive the **Aura methodology** → author the (currently scaffolded-only) closing engine.
- Decide interface surface (reuse WhatsApp agent scoped to Ger/Dir) + retrieval base.
- Consider re-basing this fork onto `crm-pulso@46957b0` to recover the 30 missing commits.
