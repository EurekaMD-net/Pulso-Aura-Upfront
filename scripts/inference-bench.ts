/**
 * Inference benchmark over the Aura use case (Spanish agentic CRM, tool-calling).
 * Loads .env at runtime (keys used for calls, never printed). Drives each model
 * through the exact failure modes we hit in production:
 *
 *   A) Tool selection      — ask a closing question, expect ONE correct tool_call.
 *   B) Synthesis-after-tool — feed the tool result back; a GOOD model answers in
 *                             text, a doom-loop-prone model re-calls the tool.
 *   C) Spanish synthesis    — turn the numbers into a coaching answer (quality+latency).
 *
 * Reports per model: tool accuracy, doom-loop rate, latency, tokens, sample text.
 *
 * Usage:  NODE_NO_WARNINGS=1 npx tsx scripts/inference-bench.ts
 */
import fs from "fs";
import path from "path";
import { getToolsForRole } from "../crm/src/tools/index.js";

for (const line of fs.readFileSync(path.resolve(".env"), "utf-8").split("\n")) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !process.env[m[1]])
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}

const FW_URL = process.env.INFERENCE_PRIMARY_URL!;
const FW_KEY = process.env.INFERENCE_PRIMARY_KEY!;
const GROQ_URL = process.env.INFERENCE_FALLBACK_URL!;
const GROQ_KEY = process.env.INFERENCE_FALLBACK_KEY!;

const MODELS = [
  {
    name: "minimax-m2p7 (current)",
    url: FW_URL,
    key: FW_KEY,
    model: "accounts/fireworks/models/minimax-m2p7",
  },
  {
    name: "qwen3.6-plus",
    url: FW_URL,
    key: FW_KEY,
    model: "accounts/fireworks/models/qwen3p6-plus",
  },
  {
    name: "qwen3.7-plus",
    url: FW_URL,
    key: FW_KEY,
    model: "accounts/fireworks/models/qwen3p7-plus",
  },
  {
    name: "qwen3-32b (Groq fallback)",
    url: GROQ_URL,
    key: GROQ_KEY,
    model: "qwen/qwen3-32b",
  },
];

// Real VP tool schemas (already OpenAI function format).
const VP_TOOLS = getToolsForRole("vp");
const closingTools = VP_TOOLS.filter((t) =>
  [
    "consultar_metas_cierre",
    "consultar_metas_portafolio",
    "buscar_inteligencia_marca",
    "armar_radiografia_marca",
  ].includes(t.function.name),
);

const SYS = {
  role: "system" as const,
  content:
    "Eres Aura, copiloto de ventas en español para Azteca. Tienes herramientas de cierre. " +
    "Usa UNA herramienta cuando haga falta el dato, y en cuanto tengas el resultado, RESPONDE al usuario " +
    "en texto plano y en español. NUNCA repitas la misma llamada de herramienta. Cifras en millones MXN.",
};

// Realistic tool result for scenario B (the Colgate metas frame).
const COLGATE_RESULT = JSON.stringify({
  status: "ok",
  cuenta: "COLGATE",
  gerente: "ACL",
  cierre_2026: 115.0,
  mundial: 0,
  base_2026: 121.0,
  meta_2027: 127.65,
  crecimiento_pct: 5.5,
  fruta_al_alcance: [
    { medio: "tv", de: 115, a: 120.75 },
    { medio: "roku", de: 6, a: 6.9 },
  ],
});

async function call(
  m: (typeof MODELS)[number],
  messages: unknown[],
  tools?: unknown[],
) {
  const t0 = Date.now();
  const res = await fetch(m.url.replace(/\/$/, "") + "/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${m.key}`,
    },
    body: JSON.stringify({
      model: m.model,
      messages,
      ...(tools ? { tools, tool_choice: "auto" } : {}),
      // Room for reasoning models to think AND answer (we strip <think> after).
      max_tokens: 3000,
      temperature: 0.2,
    }),
  });
  const ms = Date.now() - t0;
  const j = await res.json().catch(() => ({}));
  const msg = j?.choices?.[0]?.message ?? {};
  const stripThink = (s: string) =>
    (s || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return {
    ms,
    status: res.status,
    toolCalls: (msg.tool_calls ?? []).map((c: any) => c.function?.name),
    content: stripThink(msg.content ?? ""),
    promptTok: j?.usage?.prompt_tokens ?? 0,
    complTok: j?.usage?.completion_tokens ?? 0,
  };
}

(async () => {
  const QUESTION = {
    role: "user" as const,
    content:
      "¿Cómo viene Colgate para el cierre 2027 y cuál es el ángulo de defensa?",
  };
  const results: any[] = [];

  for (const m of MODELS) {
    const row: any = { model: m.name };
    // A) tool selection
    try {
      const a = await call(m, [SYS, QUESTION], closingTools);
      row.A_tool = a.toolCalls.join(",") || "(none)";
      row.A_correct =
        a.toolCalls.length === 1 && a.toolCalls[0] === "consultar_metas_cierre";
      row.A_ms = a.ms;
    } catch (e) {
      row.A_tool = "ERR";
    }

    // B) synthesis-after-tool (doom-loop probe) — 3 trials
    let synth = 0,
      loop = 0;
    const bms: number[] = [];
    for (let i = 0; i < 3; i++) {
      try {
        const b = await call(
          m,
          [
            SYS,
            QUESTION,
            {
              role: "assistant",
              content: "",
              tool_calls: [
                {
                  id: "c1",
                  type: "function",
                  function: {
                    name: "consultar_metas_cierre",
                    arguments: '{"cuenta":"Colgate"}',
                  },
                },
              ],
            },
            { role: "tool", tool_call_id: "c1", content: COLGATE_RESULT },
          ],
          closingTools,
        );
        bms.push(b.ms);
        if (b.toolCalls.length > 0) loop++;
        else if (b.content.trim()) synth++;
      } catch {
        /* count as neither */
      }
    }
    row.B_synth = `${synth}/3`;
    row.B_loop = `${loop}/3`;
    row.B_ms = bms.length
      ? Math.round(bms.reduce((a, c) => a + c, 0) / bms.length)
      : 0;

    // C) pure Spanish synthesis (quality + latency)
    try {
      const c = await call(m, [
        SYS,
        {
          role: "user",
          content:
            "Con estos datos de Colgate (millones MXN): 2026 cerrado 115 (sin Mundial), base recurrente 121 (TV 115 + Roku 6), " +
            "meta 2027 127.65, +5.5% sobre base. Redacta en español el ángulo de cierre para defender la inversión 2027 en un año sin Mundial. Breve, formato WhatsApp.",
        },
      ]);
      row.C_ms = c.ms;
      row.C_len = c.content.length;
      row.C_tok = c.complTok;
      row.C_sample = c.content.slice(0, 220).replace(/\n/g, " ");
    } catch {
      row.C_sample = "ERR";
    }

    results.push(row);
    console.log(JSON.stringify(row));
  }

  console.log("\n=== SUMMARY ===");
  for (const r of results) {
    console.log(`\n${r.model}`);
    console.log(
      `  A tool-pick: ${r.A_tool}  correct=${r.A_correct}  (${r.A_ms}ms)`,
    );
    console.log(
      `  B synthesize=${r.B_synth}  re-loop=${r.B_loop}  (avg ${r.B_ms}ms)`,
    );
    console.log(`  C synth: ${r.C_ms}ms, ${r.C_tok} tok\n     "${r.C_sample}"`);
  }
})();
