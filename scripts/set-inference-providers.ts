/**
 * Repoint the inference providers (edits .env), validating before it goes live:
 *
 *   PRIMARY   ->  Groq      qwen/qwen3-32b                         (disciplined, fast)
 *   FALLBACK  ->  Fireworks accounts/fireworks/models/qwen3p7-plus (Qwen 3.7-plus backstop)
 *
 * It identifies your Fireworks and Groq credential blocks by URL host (so it works
 * regardless of which is currently primary/fallback), backs up .env, rewrites the six
 * INFERENCE_* lines in place, then PROBES both new endpoints. If either is unreachable
 * it restores the backup and aborts — so you never end up live on a broken provider.
 *
 * Keys are read/moved internally and NEVER printed.
 *
 * Run:    NODE_NO_WARNINGS=1 npx tsx scripts/set-inference-providers.ts
 * Then:   crm-ctl restart
 */
import fs from "fs";
import path from "path";

const ENV = path.resolve(".env");
const FW_MODEL = "accounts/fireworks/models/qwen3p7-plus";
const GROQ_MODEL = "qwen/qwen3-32b";
// Which provider leads. "fireworks" = qwen3.7-plus primary (stronger instruction
// following — adheres to the Azteca-catalog guardrail). "groq" = qwen3-32b primary
// (faster/leaner). Default fireworks.
const PRIMARY_CHOICE = (process.argv[2] || "fireworks").toLowerCase();

function parse(text: string): Map<string, string> {
  const m = new Map<string, string>();
  for (const line of text.split("\n")) {
    const mm = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (mm) m.set(mm[1], mm[2].replace(/^["']|["']$/g, ""));
  }
  return m;
}

/** Replace KEY=... lines in place (preserves order, comments, other vars). */
function setVars(text: string, updates: Record<string, string>): string {
  const seen = new Set<string>();
  const out = text.split("\n").map((line) => {
    const mm = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (mm && mm[1] in updates) {
      seen.add(mm[1]);
      return `${mm[1]}=${updates[mm[1]]}`;
    }
    return line;
  });
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  return out.join("\n");
}

async function reachable(
  label: string,
  url: string,
  key: string,
  model: string,
): Promise<boolean> {
  const endpoint = url.replace(/\/$/, "") + "/chat/completions";
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "OK" }],
        max_tokens: 4,
      }),
    });
    const host = new URL(url).host;
    console.log(`  ${label}: ${host} / ${model} -> HTTP ${res.status}`);
    return res.ok;
  } catch (e) {
    console.log(
      `  ${label}: ERROR ${e instanceof Error ? e.message : String(e)}`,
    );
    return false;
  }
}

(async () => {
  const original = fs.readFileSync(ENV, "utf-8");
  const env = parse(original);

  // Identify the two credential blocks by host (idempotent — works whichever
  // is currently primary vs fallback).
  const blocks = [
    {
      url: env.get("INFERENCE_PRIMARY_URL"),
      key: env.get("INFERENCE_PRIMARY_KEY"),
    },
    {
      url: env.get("INFERENCE_FALLBACK_URL"),
      key: env.get("INFERENCE_FALLBACK_KEY"),
    },
  ].filter((b) => b.url && b.key) as { url: string; key: string }[];

  const fw = blocks.find((b) => /fireworks/i.test(b.url));
  const groq = blocks.find((b) => /groq/i.test(b.url));
  if (!fw || !groq) {
    console.error(
      "ABORT: could not find both a Fireworks and a Groq block in INFERENCE_PRIMARY_*/INFERENCE_FALLBACK_*.\n" +
        "Expected one provider host to match 'fireworks' and one 'groq'. No changes made.",
    );
    process.exit(1);
  }

  if (PRIMARY_CHOICE !== "fireworks" && PRIMARY_CHOICE !== "groq") {
    console.error(
      "Usage: set-inference-providers.ts <fireworks|groq>  (default: fireworks = qwen3.7-plus primary)",
    );
    process.exit(1);
  }
  const primaryFw = PRIMARY_CHOICE === "fireworks";
  const primary = primaryFw ? fw : groq;
  const fallback = primaryFw ? groq : fw;
  const primaryModel = primaryFw ? FW_MODEL : GROQ_MODEL;
  const fallbackModel = primaryFw ? GROQ_MODEL : FW_MODEL;
  // qwen3.7-plus reasons more — give it token room so a deep synthesis doesn't truncate.
  const maxTokens = primaryFw ? "4000" : "2048";

  const updates = {
    INFERENCE_PRIMARY_URL: primary.url,
    INFERENCE_PRIMARY_KEY: primary.key,
    INFERENCE_PRIMARY_MODEL: primaryModel,
    INFERENCE_FALLBACK_URL: fallback.url,
    INFERENCE_FALLBACK_KEY: fallback.key,
    INFERENCE_FALLBACK_MODEL: fallbackModel,
    INFERENCE_MAX_TOKENS: maxTokens,
  };

  // Backup, then write.
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backup = `${ENV}.bak-inference-${stamp}`;
  fs.copyFileSync(ENV, backup);
  fs.writeFileSync(ENV, setVars(original, updates));
  console.log(`Backed up .env -> ${path.basename(backup)}`);
  console.log("Wrote new provider config:");
  console.log(`  PRIMARY  = ${new URL(primary.url).host} / ${primaryModel}`);
  console.log(`  FALLBACK = ${new URL(fallback.url).host} / ${fallbackModel}`);
  console.log(`  INFERENCE_MAX_TOKENS = ${maxTokens}`);

  // Validate BOTH new endpoints before going live (fallback checked first).
  console.log("\nProbing new endpoints...");
  const okFallback = await reachable(
    "FALLBACK",
    fallback.url,
    fallback.key,
    fallbackModel,
  );
  const okPrimary = await reachable(
    "PRIMARY ",
    primary.url,
    primary.key,
    primaryModel,
  );

  if (!okPrimary || !okFallback) {
    fs.copyFileSync(backup, ENV);
    console.error(
      "\nABORT: an endpoint failed — restored .env from backup. No change is live.",
    );
    process.exit(1);
  }

  console.log("\n✓ Both endpoints reachable. Now apply it:  crm-ctl restart");
})();
