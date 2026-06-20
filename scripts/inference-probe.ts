/**
 * Inference probe — discover which providers/models are reachable for the
 * benchmark. Loads .env at runtime (uses keys for the calls, NEVER prints them).
 * Reports only: provider host, model id, HTTP status, latency.
 *
 * Usage:  NODE_NO_WARNINGS=1 npx tsx scripts/inference-probe.ts [extra-model-id ...]
 *   extra model ids are probed against the FALLBACK endpoint (to test Qwen 3.x).
 */
import fs from "fs";
import path from "path";

// Load .env into process.env (no dotenv dep; systemd normally injects it). Used
// internally for the provider calls — values are never printed.
for (const line of fs.readFileSync(path.resolve(".env"), "utf-8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]])
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

function host(u: string | undefined): string {
  if (!u) return "(unset)";
  try {
    return new URL(u).host;
  } catch {
    return "(bad url)";
  }
}

async function probe(
  label: string,
  url: string | undefined,
  key: string | undefined,
  model: string | undefined,
): Promise<void> {
  if (!url || !model) {
    console.log(
      `${label}: NOT CONFIGURED (url=${host(url)}, model=${model ?? "(unset)"})`,
    );
    return;
  }
  const endpoint = url.replace(/\/$/, "") + "/chat/completions";
  const t0 = Date.now();
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Responde solo: OK" }],
        max_tokens: 8,
        temperature: 0,
      }),
    });
    const ms = Date.now() - t0;
    const txt = await res.text();
    let snippet = "";
    try {
      snippet = JSON.parse(txt)?.choices?.[0]?.message?.content ?? "";
    } catch {
      snippet = txt.slice(0, 80);
    }
    console.log(
      `${label}: host=${host(url)} model=${model} -> HTTP ${res.status} (${ms}ms) reply="${String(snippet).slice(0, 40)}"`,
    );
  } catch (e) {
    console.log(
      `${label}: host=${host(url)} model=${model} -> ERROR ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

(async () => {
  const pUrl = process.env.INFERENCE_PRIMARY_URL,
    pKey = process.env.INFERENCE_PRIMARY_KEY,
    pModel = process.env.INFERENCE_PRIMARY_MODEL;
  const fUrl = process.env.INFERENCE_FALLBACK_URL,
    fKey = process.env.INFERENCE_FALLBACK_KEY,
    fModel = process.env.INFERENCE_FALLBACK_MODEL;

  console.log("=== configured providers (hosts/models only) ===");
  await probe("PRIMARY ", pUrl, pKey, pModel);
  await probe("FALLBACK", fUrl, fKey, fModel);

  // Probe extra model ids (CLI args) against the fallback endpoint — to see which
  // Qwen versions that provider serves (qwen3.5/3.6/3.7-plus etc.).
  // extras are probed against the PRIMARY endpoint (Fireworks serves the Qwen
  // "plus" models too, so we can test them on the existing key).
  const extras = process.argv.slice(2);
  if (extras.length) {
    console.log("\n=== candidate models on PRIMARY (Fireworks) endpoint ===");
    for (const m of extras) await probe(`  ${m}`, pUrl, pKey, m);
  }
})();
