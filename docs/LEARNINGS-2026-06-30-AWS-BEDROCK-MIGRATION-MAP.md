# Learnings — 2026-06-30 — AWS EC2 + Bedrock migration map: the four gates, and a Drive-publish permission lesson

## Context

Operator asked to plan a corporate AWS migration of the live `agentic-crm` service
(Hostinger VPS → EC2 host + Amazon Bedrock) under a corporate platform profile:
**Snowflake** (data) · **Microsoft 365 / Graph** (workspace, replaces Google) · **Slack**
(sole channel, replaces WhatsApp) · **Amazon Bedrock** (inference, replaces Groq/Fireworks).

Produced, all grounded against the live repo + AWS docs:

- `docs/AWS-EC2-BEDROCK-TECHNICAL-MAP.md` — 15-section engineering reference (topology +
  Mermaid, complete egress/ingress inventory, env-var repoint map, 28-item risk register,
  F0–F4 plan, cost model, open decisions).
- `docs/PLAN-TRANSICION-AWS.md` — Spanish step-by-step runbook the infra team executes (4
  STOP/GO gates, blocking decisions, day-1 long-lead items, roles, per-phase
  steps/acceptance/rollback/owner, freeze + point-of-no-return, production checklist).
- `docs/DESPLIEGUE-AWS-CORPORATIVO.md` — earlier Spanish corporate deploy spec
  (Snowflake/MS365/Slack profile).
- Two Spanish Google Docs (technical map + runbook), owned by the operator.

The map was produced by a 6-dimension research **workflow** (compute / inference /
networking / data / integrations / ops), each agent reading the real repo, then an
adversarial **completeness critic**, then synthesis. The critic earned its keep — several of
the load-bearing findings below came from it, not the first-pass research.

## Technical findings

### Bedrock changed the calculus — verify cloud capabilities against current docs, not memory

Two AWS changes (both recent, both missed from training) flipped the recommendation:

- **Bedrock now has a native OpenAI-compatible endpoint ("mantle"):**
  `https://bedrock-mantle.<region>.api.aws/v1/chat/completions` — base-URL + API-key swap for
  an OpenAI SDK codebase.
- **Qwen3-32B (the exact production model) is fully managed/serverless on Bedrock.**

Together these mean the generation layer is a near-config-only repoint of
`INFERENCE_PRIMARY_URL/MODEL/KEY` — `crm/src/inference-adapter.ts` already POSTs
`${baseUrl}/chat/completions` with `Authorization: Bearer ${key}`. **No GPU is needed** (a
repo-wide `grep gpu|cuda|nvidia` → 0 hits; inference/embeddings/transcription are all remote
HTTP) — this kills the prior self-host plan's "GPU concurrency risk #1" outright.

### "Config-only" was an overclaim — it is config-PLUS-thin-code

I initially told the operator the generation layer was "config-only." The grounded trace
corrected this to **config-PLUS-thin-code**, gated by four things that each fail _silently_:

1. **`tool_calls` parity** on mantle for `qwen.qwen3-32b` — `inferWithTools()` +
   `parseSSEStream()` hard-depend on well-formed `tool_calls` blocks + streaming index-deltas;
   every state-changing DB write (`registrar_actividad`, `cerrar_propuesta`) rides on it. Must
   be probed live (F0) before scheduling F2.
2. **Residency of the real inference path.** PrivateLink is confirmed for `bedrock-runtime`
   but **NOT** for `bedrock-mantle.<region>.api.aws` — the actual hot path. If mantle has no
   PrivateLink, every confidential prompt egresses over the public internet via NAT, defeating
   residency. Resolution if absent: front Bedrock with `aws-samples/bedrock-access-gateway`
   calling native `InvokeModel`/Converse over the `bedrock-runtime` PrivateLink endpoint (which
   _is_ private) — this also resolves the tool-call-parity gate in one move.
3. **The ≤12h Bedrock key won't hot-reload.** `loadProviders()` reads `process.env` fixed at
   host boot; `readSecrets()` snapshots it per spawn. Writing a rotated key to Secrets Manager
   does **not** update the running `tsx` process → key expiry = recurring scheduled 401 outage.
   Needs a small key-reload path or a long-term key (tradeoff).
4. **The channel switch is big-bang.** Slack channel IDs replace WhatsApp JIDs; live traffic
   cannot be shadowed into both stacks. First live Slack write = **point-of-no-return** (no
   reverse sync to the VPS).

### Critic-caught traps that a surface read would miss

- **Cost ~doubles.** AWS Network Firewall (the only thing that can block `api.anthropic.com`
  by FQDN — SGs can't filter FQDN) is ~$0.395/hr/endpoint (~$288/mo) and was absent from the
  earlier estimate. Real infra subtotal ≈ **$720–760/mo** (still ~3–5× cheaper than the g6e GPU
  baseline).
- **Embeddings are NOT a base-URL swap.** Mantle exposes chat/Responses only — no
  `/v1/embeddings`; pointing `EMBEDDING_URL` at it 404s and `embedding.ts` silently falls back
  to a local trigram hash. And the 17,986-chunk corpus **cannot dual-write** (single
  `vec0 float[1024]` table) → re-embed into a **shadow table** + atomic swap, with a dedicated
  stable key (a job outrunning the 12h key TTL poisons vectors with trigrams).
- **QuickChart is an unguarded leak today** — sends deal values to `quickchart.io`, no auth,
  no gate, every chart.
- **Snowflake (P4 factual layer) may be dead in-container** — `SNOWFLAKE_*` is host-only and
  absent from the container `readSecrets()` allowlist; if the tool runs in-container it silently
  returns "not configured."
- **Agent containers can steal the instance role via IMDS** — they run arbitrary tool code;
  needs IMDSv2 hop-limit=1 + block `169.254.169.254` from `crm-net`.
- **`/health` lies.** It returns `{status:ok}` without exercising spawn or inference; `systemd
active` + HTTP 200 both stay green through the silent-mute modes (image pruned, crm-net
  missing, key expired). Drive alerting off a synthetic round-trip canary, not `/health`.

### What's genuinely easy (confirmed)

No GPU. `crm.db` lift-and-shifts on EBS (do **not** move to RDS — that's a data-layer rewrite,
not a migration). Both net-new integration seams already exist: `WorkspaceProvider` already
branches on `WORKSPACE_PROVIDER=microsoft` (factory throws "not yet implemented"); the Slack
channel is a 291-line `SlackChannel` living as the un-promoted `add-slack` skill.

## Process lesson — publishing to Google Drive from a background subagent is blocked

The two writing subagents wrote their files perfectly, then were **denied** when they called
`mcp__claude_ai_Google_Drive__create_file`. The auto-mode permission classifier refused
because the publish was requested by the _coordinator_ (a sub-agent instruction), not directly
by the user, and the destination's visibility was unestablished — an outward-facing publish
from an unattended context. The subagents correctly **refused to work around it** rather than
retrying.

The fix that worked: **publish from the main loop.** There the user's explicit
"(google doc)" request carries the authorization, and the harness surfaces/handles the
permission at the point of action. To keep the content lossless without a sub-agent hop, the
main loop **reads each file back from disk** and passes the verbatim content as
`textContent` to `create_file`.

A second, smaller gotcha (carried from a prior session, re-confirmed): **Google Docs markdown
import escapes inline markdown _inside table cells_** — `**bold**` and `` `code` `` render as
literal `\*\*` / backslash artifacts. Author table cells in **plain text** (env var names,
identifiers, AWS service names as bare text) for a clean corporate Doc; headings, body bold,
and lists outside tables import fine.

## Durable lessons

- **Verify fast-moving cloud capabilities against current docs, not memory.** Bedrock's
  OpenAI-compatible "mantle" endpoint and managed Qwen3-32B both landed recently and _flipped_
  the recommendation (managed Bedrock is now arguably better than the self-host vLLM plan).
- **"Config-only" is a smell — trace the actual adapter.** The OpenAI-compatible wire format
  made the swap nearly config-only EXCEPT for tool-calling parity, key hot-reload, and
  embeddings. Each of those fails silently, which is worse than failing loud.
- **An adversarial completeness critic pays for itself on a migration plan.** The
  highest-severity findings (mantle PrivateLink gap, Network-Firewall cost, dual-write
  impossibility, IMDS theft) came from the critic pass, not first-pass research — the same
  class of omission a prior audit had on egress.
- **Background subagents can't get interactive approval for outward-facing actions.** Do
  outward publishes (Drive, email, posting) from the main loop, where the user's request
  authorizes them and the harness can prompt. Don't try to grant the permission around the
  block.
- **Google Docs markdown import escapes inline markdown inside table cells** → use plain-text
  cells for clean conversion.
