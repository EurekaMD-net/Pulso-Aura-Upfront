# WhatsApp Inbound — RESOLVED (2026-06-20)

**Status: the full WhatsApp loop works end-to-end. Inbound was never broken.**

```
[operator]  @crm hola
[bot]       Un momento...
[bot]       En qué tema de negocio puedo apoyarte?
```

(Test VPS group `120363409556213628@g.us`, 2026-06-20 03:02 — inbound → decrypt → route → VP persona → inference (Fireworks/minimax) → reply.)

## The real root cause (NOT decryption)

The earlier "inbound decryption fails / Baileys companion never completes the Signal
session" conclusion was a **misdiagnosis**. There was never a decryption problem. The
operator saw "the bot doesn't reply" and the prior session attributed it to Baileys.
The truth was two missing **setup** steps stacked behind each other:

1. **Unregistered group.** `registered_groups` was empty. The inbound handler
   (`engine/src/channels/whatsapp.ts:213-215`) only delivers a message to an agent
   `if (group)` — i.e. if the chat is registered. Every decrypted message updated the
   `chats` table (via `onChatMetadata`, which runs for _all_ chats) but was then
   **silently dropped** at the routing gate → no agent spawned → no reply.
2. **Empty `persona` table.** Even after registering the group, the in-container
   agent-runner (`crm/container/agent-runner/index.ts:517`) calls
   `getPersonByGroupFolder(folder)` and exits with `Unknown persona for group folder`
   when no persona maps to the folder. The Aura DB had its 971-document corpus but
   **zero seeded personas** (the pilot-seeding step had not been done).

## Proof it was never decryption

- **0** occurrences of `failed to decrypt` in 3 days of journal.
- DMs decrypted with content: `translateJid` (which runs _after_ the `!msg.message`
  content guard) logged real senders resolving (`5215530331051@s.whatsapp.net`, …).
- The `chats` table synced 5 chats incl. the group name "Test VPS" — envelopes arrived
  and were processed.
- `session will be re-established` / `identity key changed or new contact` is **normal
  libsignal new-contact session bootstrap**, logged 1:1 with "Own LID session created
  successfully" — not a failure.

The asymmetry that pinpointed it: `chats` populated (5 rows) while `messages` stayed at
**0** — because `onChatMetadata` runs before the group gate, but `storeMessage` runs
only inside it.

## The fix (runtime data — no code change)

1. Registered the Test VPS group → `crm-test` persona folder, trigger `@CRM`:
   `INSERT INTO registered_groups (...) VALUES ('120363409556213628@g.us','Test VPS','crm-test','@CRM',...)`
   in `store/messages.db`; restarted the engine (`State loaded groupCount:1`).
2. Seeded a VP smoke persona on that folder (matches the crm-azteca demo, which used a
   single throwaway top-role persona): `INSERT INTO persona (id,nombre,rol,whatsapp_group_folder,activo)
VALUES ('smoke-vp','VP Prueba','vp','crm-test',1)` in `data/store/crm.db`. The
   container reads this same DB live (`CRM_DB_PATH=/workspace/extra/crm-db/crm.db`), so
   no rebuild was needed.

Note: the first `@crm hola` was dropped after the engine's 6-retry cap
(`Max retries exceeded, dropping messages (will retry on next incoming message)`)
because it was sent before the persona existed; the cursor stayed primed at `""`, so the
next message reprocessed cleanly once the persona was seeded.

## Engine changes kept from the bring-up (committed; correct, but unrelated to the bug)

- `cf0e3ff`: Baileys `rc.9 → rc13`; `fetchLatestWaWebVersion → fetchLatestBaileysVersion`
  (fixed the _handshake_ — clean Online vs rc.9's AwaitingInitialSync loop);
  `markOnlineOnConnect: false`.
- `a2e486a`: suppress QR in `--pairing-code` mode (code-only pairing).

## Live smoke scaffolding (gitignored DBs)

- `registered_groups`: `Test VPS 120363409556213628@g.us → crm-test`, trigger `@CRM`,
  requires_trigger=1.
- `persona`: one throwaway `smoke-vp` (`VP Prueba`, rol `vp`) on folder `crm-test`.

Both are **test scaffolding**, not the real pilot seed. The actual closing-pilot seeding
(Dir→Ger→AE hierarchy, accounts, committees, closing-zone proposals) is a separate,
deliberate task — see `docs/PILOT-SEEDING-CLOSING.md`.

## Lesson

"No reply" ≠ "no decrypt." When a messaging bot goes silent, walk the **delivery chain**
(decrypt → route/registration → persona/seeding → inference) before blaming the
encryption layer. A single grep — `journalctl | grep -c "failed to decrypt"` — would have
redirected the whole investigation on day one.
