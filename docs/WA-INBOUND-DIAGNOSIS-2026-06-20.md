# WhatsApp Inbound — Conclusive Diagnosis (2026-06-20)

**Status: deployment LIVE; inbound decryption is the one open blocker.**

## What works

Pulso-Aura is deployed and running on its own number `522205847540`: provider
(Fireworks/minimax-m2p7), hindsight memory backend, dashboard `:3000`, agent image,
and **WhatsApp OUTBOUND** all verified. crm pairs cleanly (code-only) and sends fine.

## The blocker

crm's Baileys **companion** device receives the encrypted message stanza (journal logs
`Translated LID` + `identity key changed or new contact, session will be re-established`)
but **never completes the Signal session → 0 messages decrypted/stored**. `messages.upsert`
fires for nothing usable.

## Ruled out — exhaustively

1. **Not the number.** Fails _identically_ on `522205847540` AND the personal number
   `525530331051` — and on both, the **primary phone receives the same messages fine**.
   So the account/number can receive; only crm's companion can't decrypt.
2. **Not the senders.** Normal personal phones; chats deleted + contacts removed/re-added
   to force a fresh device-key fetch. No change.
3. **Not `makeCacheableSignalKeyStore`.** Swapped to raw `state.keys` (matching the working
   Gilda bot) → no change → reverted.
4. **Not socket config / read-receipts / event wiring.** crm and the working **salones-wa
   (Gilda)** bot — same Baileys `7.0.0-rc13` — drive Baileys **identically**: same three
   handlers (`connection.update`, `creds.update`, `messages.upsert`), no advanced socket
   options on either, and crm doesn't even send read-receipts (Gilda does, and Gilda works).
5. **Pairing/keys are healthy.** Clean re-link (no prior devices), `PreKey validation passed
   - Server: 812`, "handled N offline messages", `syncType: FULL` history sync — all confirmed.

So it is a deep bug in **how the NanoClaw engine drives Baileys' inbound session/retry path**
(or a companion-vs-active-primary quirk), below the config surface — the same Baileys version
works in salones-wa.

## Engine changes kept (committed; align with the working bot, did NOT fix inbound)

- `cf0e3ff`: Baileys `rc.9 → rc13`; `fetchLatestWaWebVersion → fetchLatestBaileysVersion`
  (fixed the _handshake_ — clean Online vs rc.9's AwaitingInitialSync timeout loop);
  `markOnlineOnConnect: false`.
- `a2e486a`: suppress QR in `--pairing-code` mode (code-only pairing).

## NEXT — for a fresh, focused session

1. **Enable Baileys TRACE logging** (`LOG_LEVEL=trace` on the systemd unit), send ONE inbound
   message, and read the retry-receipt + session-establishment + decrypt flow. This is the one
   diagnostic that will actually show where it dies. (Expect heavy output — scope to one message.)
2. If trace is inconclusive: line-by-line diff salones-wa's `src/bot/baileys-manager.ts`
   message/receipt path vs the engine's `channels/whatsapp.ts`, or port salones-wa's WA layer.
3. Consider the companion-vs-active-primary angle (Gilda's number may have an inactive primary;
   crm's numbers have active primaries reading the messages first).

## Operator helper scripts (outside the repo, `/root/claude/`)

- `aura-pair-fresh-2026-06-20.sh <number>` — full reset → pair (code-only) → start → guided
  inbound test → ✅/✗ verdict. Refuses Gilda's `525640501088`.
- `aura-bringup-2026-06-20.sh` — `.env` sync from base + hindsight restart + boot verify.

Live-state detail also in the operator memory `crm-azteca.md` (WA INBOUND diagnosis section).
