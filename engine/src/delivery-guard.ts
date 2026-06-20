/**
 * Delivery guard — never let a raw tool-result payload reach the user.
 *
 * A user-facing chat message must be natural language. Reasoning models
 * occasionally MIMIC the tool-result JSON they see in their context and emit it
 * as their own message. Observed in production (2026-06-20): the agent sent
 *   {"error":"No p se encontró la cuenta...","sugerencias":["BAYER","BAYER Mexico"]}
 * verbatim to WhatsApp — with a typo ("No p se encontró") and a `sugerencias`
 * field that NO tool in the codebase produces. The tool calls had actually
 * SUCCEEDED (crm_tool_usage shows success=1); the model fabricated a not-found
 * payload and shipped it. This is confabulation, not a real tool error.
 *
 * The guard is deterministic and model-independent: if the whole outbound
 * message parses as a JSON object/array, it is a format leak (a sales rep is
 * never the intended audience for raw JSON) and must be suppressed. The caller
 * then closes the turn with a clean natural-language fallback.
 */
export function isRawToolResultLeak(text: string): boolean {
  const t = text.trim();
  // A normal chat message never begins with a JSON structural character; this
  // fast-rejects the overwhelming majority of legitimate prose without a parse.
  if (t.length < 2 || (t[0] !== '{' && t[0] !== '[')) return false;
  try {
    const v = JSON.parse(t);
    return v !== null && typeof v === 'object';
  } catch {
    // Not valid JSON (e.g. prose that merely starts with a brace) — let it through.
    return false;
  }
}
