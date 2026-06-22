# Learnings — 2026-06-22 — The bot went silent because the daily prune ate its Docker image

## Symptom

The live `agentic-crm` bot **stopped replying** on WhatsApp. Every inbound message in the
Test VPS group from 18:42 UTC onward failed and, after 6 retries, was dropped. The systemd
service showed `active (running)` the entire time — nothing looked wrong from `systemctl`.

Engine log per message:

```
code:125  stderr:"Unable to find image 'agentic-crm-agent:latest' locally
docker: Error response from daemon: pull access denied for agentic-crm-agent,
repository does not exist or may require 'docker login'"
```

## Diagnosis (infra, not code)

`docker images agentic-crm-agent:latest` → **absent**. Docker tried to _pull_ a local-only
image because it no longer existed locally; the registry has no such repo → "pull access
denied". So the image had been **deleted from the local store**.

Why it was deleted — the confirmed cause, not a guess:

```
/etc/cron.d/docker-image-prune
47 0 * * *  root  docker image prune -af --filter "until=24h" --filter "label!=keep=true"
```

- Agent containers run `docker run -i --rm` → they self-remove on exit. **Between WhatsApp
  messages there are zero containers referencing the image**, so docker considers it
  "unused."
- The image carried **no `keep=true` label** (the Dockerfile had no `LABEL` line).
- Unused + unlabeled + >24h old → the daily 00:47 UTC prune reaped it. The next inbound
  message (18:42) found nothing to run.

**Why the service stayed green:** `/health` never exercises the container path
(documented in `CLAUDE.md` / LEARNINGS-2026-04-21 §1). systemd `active` ≠ bot working — the
engine, WhatsApp connection, routing, retry/backoff and cursor-rollback were all healthy.
The _only_ break was the missing image.

This was the **third distinct "bot went silent" root cause** on this project, none of them
the obvious layer:

1. empty `registered_groups` + empty `persona` (routing/persona) — 2026-06-20
2. doom-loop delivered an empty string the delivery layer dropped — `agent_silence_empty_result`
3. **the agent image got pruned (this one)**

Discipline that held: walk service → WA connection → route → **spawn** → persona → inference
before blaming any one layer. "Pull access denied" on a _local_ image name = it was pruned,
not a registry/login problem.

## Fix

Make the ephemeral image opt out of the prune — the cron explicitly preserves
`label=keep=true`.

1. **`crm/container/Dockerfile`** (the agent image) — add `LABEL keep="true"` to the runtime
   stage. Rebuilt via `npm run build:container`. Shipped `e4d2be6`.
2. **`engine/container/Dockerfile`** (the `nanoclaw-agent:latest` base) — same `LABEL
keep="true"`. This image is built by Pulso-Aura's own `engine/container/build.sh` and used
   only as the base of `agentic-crm-agent`. Rebuilt via `engine/container/build.sh`. Shipped
   `05b837e`.

**Not a restart.** The engine spawns a fresh container per message; it found the rebuilt
image on the next inbound. (The single message dropped at 18:44 won't auto-replay — its
cursor was rolled back — but any new message spawns cleanly.)

## The sweep — every `--rm` image must opt out of the prune

An ephemeral `--rm` worker image is the inverse of a long-running service container: it is
_supposed_ to have no running instance most of the time, so "unused" is its normal resting
state, not a signal it's disposable. A blanket prune treats that normal state as garbage.
So **any** image run as `--rm` must carry `keep=true`. Audit of every host image:

| Image                      | keep            | Builder                                  | Note                          |
| -------------------------- | --------------- | ---------------------------------------- | ----------------------------- |
| `agentic-crm-agent:latest` | ✅ `e4d2be6`    | Pulso-Aura `crm/container/Dockerfile`    | the one that broke            |
| `nanoclaw-agent:latest`    | ✅ `05b837e`    | Pulso-Aura `engine/container/Dockerfile` | base of the above             |
| `mission-control:latest`   | ✅ pre-existing | mission-control `build-mc-image.sh`      | already protected (see below) |

**Attribution correction (don't repeat my first guess):** I initially flagged
`nanoclaw-agent` as a _mission-control_ runtime dependency. It is **not**.
`mission-control/src/runners/container.ts:176-185` is explicit — the old `nanoclaw-agent`
default _"never existed on the host"_ and the runner was migrated to `mission-control:latest`
(which already bakes + verifies `keep=true` in `build-mc-image.sh`, after its own recurrence
on 2026-05-23). `watchdog.sh:102` confirms nanoclaw-agent monitoring is _"intentionally
gone."_ So both fixes were in **this repo**; mission-control needed no change. **Lesson:
verify a cross-service dependency by reading the runner's actual image resolution before
attributing — a stale env default (`NANOCLAW_IMAGE` in docker-compose.yml) is not proof of
use.**

A base prune is _less_ dangerous than an agent-image prune: if `nanoclaw-agent` is reaped
while `agentic-crm-agent` exists, the live bot keeps working (the derived image retains its
layers). It only bites a _manual_ `docker build` of the CRM image (`FROM
nanoclaw-agent:latest` → tries to pull a local-only base). The canonical `build:container`
rebuilds the base first, so it self-heals; the label is defense-in-depth that closes the
manual-build hole.

Quick audit command for any future host:

```bash
for i in $(docker images --format '{{.Repository}}:{{.Tag}}' | grep -v '<none>'); do
  echo "$i -> keep=$(docker inspect "$i" --format '{{index .Config.Labels "keep"}}')"
done
```

## Durable lessons

- **"Pull access denied" on a LOCAL image name = it was pruned**, not a registry/auth
  problem. Confirm with `docker images <name>` (absent) + the prune cron.
- **systemd `active` ≠ the bot works.** A health check that doesn't exercise the container
  path will stay green through a total spawn outage. Trust the message logs, not the unit
  state.
- **Ephemeral `--rm` images need `LABEL keep=true`.** Their normal state is "no running
  instance," which a blanket prune reads as "unused → delete." The label is the opt-out the
  prune cron honors (`--filter "label!=keep=true"`).
- **Bake the label in the Dockerfile, don't add it post-hoc to the live image** — a label
  applied by hand vanishes on the next rebuild. The build recipe is the source of truth;
  `build-mc-image.sh` even _verifies_ the label after build and fails loudly if missing — a
  good pattern to copy if this recurs.
- **Verify cross-service ownership before attributing a shared-looking image.** An env
  default that names an image is not proof the service runs it.
