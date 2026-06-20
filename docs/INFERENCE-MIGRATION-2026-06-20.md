# Inference engine migration + doom-loop silence fix — 2026-06-20

## TL;DR

- **Primary model switched: `minimax-m2p7` (Fireworks) → `qwen/qwen3-32b` (Groq).**
  Fallback set to `qwen3.7-plus` (Fireworks). minimax doom-looped on the agentic
  tool→synthesize step (the production "agent went silent" bug); qwen3-32b is
  disciplined, fast, and clean.
- **Two reliability fixes shipped so silence can never recur**, model-agnostic.
- Tooling added: `scripts/inference-probe.ts`, `scripts/inference-bench.ts`,
  `scripts/set-inference-providers.ts` (re-run when new models land).

## The silence bug (root cause)

A VP closing question went unanswered. The container served two good replies, then a
third turn went silent. Trace:

1. `minimax-m2p7` re-called the same tool after getting its result (instead of
   synthesizing) → the 4-layer doom-loop guard fired (`doom loop detected:
Identical call+result pair repeated 2x`) and escalated to a no-tools wrap-up.
2. The wrap-up inference returned **empty content** (`""`).
3. `inference-adapter.ts` wrap-up used `response.content ?? "[fallback]"` — `??`
   only catches null/undefined, so the empty **string** passed through.
4. `engine/src/index.ts` delivery guard `if (result.result)` — `""` is **falsy** →
   the message was dropped, **with no fallback** → silence.

### Fixes (both model-agnostic backstops)

- `crm/src/inference-adapter.ts` — wrap-up now (a) injects an explicit
  "answer in plain text now, no tools" system turn, and (b) uses `nonEmptyOr()`
  (exported, unit-tested) so blank/whitespace content becomes a graceful Spanish
  message, never empty.
- `engine/src/index.ts` — after a successful turn that sent **nothing**
  (`!outputSentToUser`), send a fallback reply. The bot can no longer go mute.

## Benchmark (Spanish agentic CRM, Colgate closing scenario)

Real VP tool schemas; the key metric is **synthesis-after-tool** — feed the tool
result back and check whether the model _answers_ (good) or _re-calls_ the tool
(the doom-loop). 3 trials; reasoning models given token room, `<think>` stripped.

| Model                         | Doom-loop (synth/loop) | Synthesis     | Latency  | Notes                               |
| ----------------------------- | ---------------------- | ------------- | -------- | ----------------------------------- |
| minimax-m2p7 _(was primary)_  | 1/3 · **2/3 loop**     | good          | 2.7s     | loops — the bug                     |
| qwen3.6-plus                  | 0/3 · **3/3 loop**     | good          | **22s**  | loops + far too slow                |
| qwen3.7-plus                  | **3/3** · 0/3          | **best**      | 4.2s     | quality+vision, cheap ($0.40/$1.60) |
| **qwen3-32b** _(now primary)_ | **3/3** · 0/3          | good, concise | **0.9s** | fastest, leanest, disciplined       |

Verdict: minimax wrong for our tool-heavy use case; **3.7 is a real upgrade over 3.6**
(3.6 loops + 22s); **qwen3-32b** is the best speed/discipline/cost pick and was already
the wired fallback. Chosen primary: **qwen3-32b**, fallback **qwen3.7-plus**.

## Thinking-mode handling (provider-specific!)

Reasoning models leak `<think>…</think>` into content unless told otherwise, and the
knob **differs per provider — each rejects the others**:

| Provider / model         | Disable-thinking knob      | Notes                                                                                              |
| ------------------------ | -------------------------- | -------------------------------------------------------------------------------------------------- |
| Groq `qwen3-32b`         | `reasoning_effort: "none"` | rejects `enable_thinking` (400); `reasoning_format:"hidden"`→empty; `"parsed"` clean but 3× slower |
| Dashscope Qwen/GLM       | `enable_thinking: false`   | original adapter path                                                                              |
| Fireworks `qwen3p*-plus` | (none reliable)            | rejects `enable_thinking`; clean content when given token room                                     |

The adapter's old check `provider.model.startsWith("qwen3")` **missed** prefixed ids
(`qwen/qwen3-32b`, `accounts/fireworks/models/qwen3p6-plus`). Now it matches on a
substring and routes by host: Groq qwen3 → `reasoning_effort:"none"` (tested clean +
0/3 loops + 439ms). `engine/src/index.ts` also strips `<think>…</think>` as a backstop.

## Current live config

- **Primary**: Groq `qwen/qwen3-32b` + `reasoning_effort:"none"` — verified end-to-end
  through the real adapter path (`hasThink:false`, clean Spanish).
- **Fallback**: Fireworks `accounts/fireworks/models/qwen3p7-plus` — disciplined,
  vision-capable. Watch: not token-capped for deep reasoning (`INFERENCE_MAX_TOKENS=2048`);
  the empty→fallback guard covers any truncation. Only hit if Groq is down/rate-limited.

## Operator notes

- The `.env` swap is done via `scripts/set-inference-providers.ts` (backs up,
  rewrites the 6 `INFERENCE_*` lines, probes both endpoints, auto-rolls-back on
  failure). Keys never printed. Then `crm-ctl restart`.
- **Groq rate limits** are tighter than Fireworks — under burst it 429s and the
  circuit breaker falls to the Fireworks fallback. Keep a Fireworks fallback.
- qwen3-32b is **text-only** — WhatsApp image vision needs qwen3.7-plus (primary).
