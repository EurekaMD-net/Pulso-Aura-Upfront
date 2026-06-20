/**
 * Template Validation Tests
 *
 * Validates that persona templates in crm/groups/ are consistent
 * with the CRM schema (tables, tools, enums) defined in code.
 */

import fs from "fs";
import path from "path";
import Database from "better-sqlite3";
import { describe, it, expect, vi } from "vitest";
import { CRM_TABLES } from "../src/schema.js";

// Mock engine modules to avoid pino dependency
let testDb: InstanceType<typeof Database>;
vi.mock("../src/db.js", () => ({
  getDatabase: () => testDb,
}));

const noop = () => {};
const noopLogger = {
  info: noop,
  warn: noop,
  error: noop,
  debug: noop,
  fatal: noop,
  child: () => noopLogger,
};
vi.mock("../src/logger.js", () => ({
  logger: noopLogger,
}));

vi.mock("../src/google-auth.js", () => ({
  isGoogleEnabled: () => false,
  getGmailClient: () => {
    throw new Error("Not configured");
  },
  getGmailReadClient: () => {
    throw new Error("Not configured");
  },
  getCalendarClient: () => {
    throw new Error("Not configured");
  },
  getCalendarReadClient: () => {
    throw new Error("Not configured");
  },
  getDriveClient: () => {
    throw new Error("Not configured");
  },
}));

// Dynamic import after mock
const { getToolsForRole } = await import("../src/tools/index.js");

const GROUPS_DIR = path.resolve(__dirname, "../groups");

function readTemplate(name: string): string {
  return fs.readFileSync(path.join(GROUPS_DIR, name), "utf-8");
}

const globalMd = readTemplate("global.md");
const aeMd = readTemplate("ae.md");
const managerMd = readTemplate("manager.md");
const directorMd = readTemplate("director.md");
const vpMd = readTemplate("vp.md");
const teamMgrMd = readTemplate("team-mgr.md");
const teamDirMd = readTemplate("team-dir.md");
const teamVpMd = readTemplate("team-vp.md");

const allTemplates = [
  globalMd,
  aeMd,
  managerMd,
  directorMd,
  vpMd,
  teamMgrMd,
  teamDirMd,
  teamVpMd,
];
const allTemplateNames = [
  "global.md",
  "ae.md",
  "manager.md",
  "director.md",
  "vp.md",
  "team-mgr.md",
  "team-dir.md",
  "team-vp.md",
];

// ---------------------------------------------------------------------------
// global.md -- Schema coverage
// ---------------------------------------------------------------------------

describe("global.md -- schema coverage", () => {
  it("references all user-facing CRM table names", () => {
    // Internal index/registry tables not queried by agents directly (accessed via tools)
    const agentFacingTables = CRM_TABLES.filter(
      (t) =>
        t !== "crm_vec_embeddings" &&
        t !== "crm_fts_embeddings" &&
        t !== "template_score" &&
        t !== "template_variant" &&
        t !== "anunciante_marca" &&
        // Internal bridge tables reached via tools, not agent SQL.
        t !== "anunciante_snowflake_map" &&
        t !== "cierre_meta" &&
        t !== "cierre_meta_linea",
    );
    for (const table of agentFacingTables) {
      expect(globalMd, `Missing table: ${table}`).toContain(table);
    }
  });

  it("contains all pipeline stages", () => {
    const stages = [
      "en_preparacion",
      "enviada",
      "en_discusion",
      "en_negociacion",
      "confirmada_verbal",
      "orden_recibida",
      "en_ejecucion",
      "completada",
      "perdida",
      "cancelada",
    ];
    for (const stage of stages) {
      expect(globalMd, `Missing pipeline stage: ${stage}`).toContain(stage);
    }
  });

  it("contains all activity types", () => {
    const types = [
      "llamada",
      "whatsapp",
      "comida",
      "email",
      "reunion",
      "visita",
      "envio_propuesta",
      "otro",
    ];
    for (const t of types) {
      expect(globalMd, `Missing activity type: ${t}`).toContain(t);
    }
  });

  it("contains all sentimiento values", () => {
    const sentimientos = ["positivo", "neutral", "negativo", "urgente"];
    for (const s of sentimientos) {
      expect(globalMd, `Missing sentimiento: ${s}`).toContain(s);
    }
  });

  it("contains all contact roles", () => {
    const roles = ["comprador", "planeador", "decisor", "operativo"];
    for (const r of roles) {
      expect(globalMd, `Missing contact role: ${r}`).toContain(r);
    }
  });

  it("contains all opportunity types", () => {
    const types = [
      "estacional",
      "lanzamiento",
      "reforzamiento",
      "evento_especial",
      "tentpole",
      "prospeccion",
    ];
    for (const t of types) {
      expect(globalMd, `Missing opportunity type: ${t}`).toContain(t);
    }
  });

  it("contains all media types", () => {
    const medios = ["tv_abierta", "ctv", "radio", "digital"];
    for (const m of medios) {
      expect(globalMd, `Missing medio: ${m}`).toContain(m);
    }
  });

  it("contains all contract statuses", () => {
    const statuses = ["negociando", "firmado", "en_ejecucion", "cerrado"];
    for (const s of statuses) {
      expect(globalMd, `Missing contract status: ${s}`).toContain(s);
    }
  });

  it("contains all calendar event types", () => {
    const types = [
      "seguimiento",
      "reunion",
      "tentpole",
      "deadline",
      "briefing",
    ];
    for (const t of types) {
      expect(globalMd, `Missing calendar type: ${t}`).toContain(t);
    }
  });

  it("contains all email types", () => {
    const types = ["seguimiento", "briefing", "alerta", "propuesta"];
    for (const t of types) {
      expect(globalMd, `Missing email type: ${t}`).toContain(t);
    }
  });
});

// ---------------------------------------------------------------------------
// global.md -- Tool coverage
// ---------------------------------------------------------------------------

describe("global.md -- tool coverage", () => {
  // Collect all unique tool names across all roles
  const allToolNames = new Set<string>();
  for (const role of ["ae", "gerente", "director", "vp"] as const) {
    for (const tool of getToolsForRole(role)) {
      allToolNames.add(tool.function.name);
    }
  }

  it("references all 77 tool names", () => {
    expect(allToolNames.size).toBe(77); // unique tool names across all roles
    for (const name of allToolNames) {
      expect(globalMd, `Missing tool: ${name}`).toContain(name);
    }
  });
});

// ---------------------------------------------------------------------------
// Role templates -- correct tool references
// ---------------------------------------------------------------------------

describe("ae.md -- tool references", () => {
  const aeTools = getToolsForRole("ae").map((t) => t.function.name);

  it("references all 51 AE tools", () => {
    for (const name of aeTools) {
      expect(aeMd, `Missing AE tool: ${name}`).toContain(name);
    }
  });

  it("does not reference gerente-only tools", () => {
    expect(aeMd).not.toContain("enviar_email_briefing");
  });
});

describe("manager.md -- tool references", () => {
  const gerenteTools = getToolsForRole("gerente").map((t) => t.function.name);

  it("references all 61 gerente tools", () => {
    for (const name of gerenteTools) {
      expect(managerMd, `Missing gerente tool: ${name}`).toContain(name);
    }
  });

  it("does not reference AE-only write tools", () => {
    const aeOnlyTools = [
      "registrar_actividad",
      "crear_propuesta",
      "actualizar_propuesta",
      "cerrar_propuesta",
      "actualizar_descarga",
      "establecer_recordatorio",
    ];
    for (const name of aeOnlyTools) {
      expect(managerMd, `Should not contain AE tool: ${name}`).not.toContain(
        name,
      );
    }
  });
});

describe("director.md -- tool references", () => {
  const directorTools = getToolsForRole("director").map((t) => t.function.name);

  it("references all 72 director tools", () => {
    for (const name of directorTools) {
      expect(directorMd, `Missing director tool: ${name}`).toContain(name);
    }
  });

  it("references email tools", () => {
    expect(directorMd).toContain("enviar_email_briefing");
  });
});

describe("vp.md -- tool references", () => {
  const vpTools = getToolsForRole("vp").map((t) => t.function.name);

  it("references all 62 VP tools", () => {
    for (const name of vpTools) {
      expect(vpMd, `Missing VP tool: ${name}`).toContain(name);
    }
  });

  it("does not reference AE write tools", () => {
    expect(vpMd).not.toContain("registrar_actividad");
  });
});

// ---------------------------------------------------------------------------
// Modo Cierre (Preventa 2027) -- closing-mode scaffold, P3.1
// Gerente + Director only (they hold buscar_inteligencia_marca); AE/VP gated out.
// ---------------------------------------------------------------------------

describe("Modo Cierre -- Preventa 2027 closing mode", () => {
  // Canonical anchors that MUST appear verbatim in both Ger + Dir templates.
  // Guards against silent drift between the two near-identical role blocks.
  const CLOSING_ANCHORS = [
    "Modo Cierre (Preventa 2027)",
    "preventa 2027", // recognition trigger
    "antes del upfront", // recognition trigger
    "buscar_inteligencia_marca", // tool wiring (P3.0)
    "ARMAGEDDON", // 3-step architecture
    "DARK",
    "STAKEHOLDERS",
    "siempre multimedia", // guardrail: never collapse to TV lineal
    "NO pegues el JSON", // guardrail: synthesize, don't dump raw findings
    "No fabricas", // guardrail: honor encontrada:false
    "Un anunciante por hilo de cierre", // the advertiser (deal unit) per closing thread (P3.5)
    // P3.2 ARMAGEDDON read-path (radiografía → preventa-2027 method)
    "armar_radiografia_marca", // tool wiring (P3.2)
    "6 factores causales del ROAS", // radiografía spine
    "whitespaces", // radiografía output
    "diagnostica, NO prescribe medios", // radiografía boundary
    "defiende la inversion 2027 factor por factor", // preventa-2027 thesis
    // P3.3 DARK / STAKEHOLDERS war-room slice
    "Sala Invisible", // DARK identity
    "arquitecto del consenso", // DARK: win by architecting consensus
    "la postura es la plataforma", // DARK: posture-is-platform
    "ciencia vs. folclore", // DARK: confidence-tiered techniques
    "los 3 que de verdad deciden", // STAKEHOLDERS: ponderar
    "Moldear, nunca fabricar", // STAKEHOLDERS: mold-not-fabricate
    "Dos pistas, una disciplina", // STAKEHOLDERS: sala vs 1:1
    "Material interno de guerra", // never-to-client gate
    // P3.5 anunciante portfolio layer (the deal is with the advertiser)
    "armar_radiografia_anunciante", // portfolio rollup tool
    "mapa_poder_anunciante", // STAKEHOLDERS over the real CRM committee
    "necesidad GLOBAL del anunciante", // the advertiser-level assertion
    // P3.4 proactive near-close trigger
    "Disparador proactivo", // recognizes an "Aura · Cierre cercano" nudge as closing intent
  ];

  const closingTemplates = [
    { name: "manager.md", content: managerMd },
    { name: "director.md", content: directorMd },
  ];

  for (const { name, content } of closingTemplates) {
    for (const anchor of CLOSING_ANCHORS) {
      it(`${name} carries closing-mode anchor: "${anchor}"`, () => {
        expect(content, `Missing in ${name}: ${anchor}`).toContain(anchor);
      });
    }
  }

  // Gate: AE and VP must NOT carry the closing mode (Phase 1 = Ger/Dir only).
  const gatedTemplates = [
    { name: "ae.md", content: aeMd },
    { name: "vp.md", content: vpMd },
  ];
  const GATED_OUT = [
    "Modo Cierre",
    "ARMAGEDDON",
    "STAKEHOLDERS",
    "(DARK)", // bound to closing-architecture context; bare "DARK" could collide
    "buscar_inteligencia_marca", // prose mirror of the registry gate (Ger/Dir-only tool)
    "Sala Invisible", // P3.3 DARK war-room — never in AE/VP
    "Material interno de guerra", // P3.3 never-to-client gate — never in AE/VP
  ];

  for (const { name, content } of gatedTemplates) {
    for (const token of GATED_OUT) {
      it(`${name} does NOT carry closing-mode token: "${token}"`, () => {
        expect(content, `${name} should not contain: ${token}`).not.toContain(
          token,
        );
      });
    }
  }
});

// ---------------------------------------------------------------------------
// Confidence calibration section
// ---------------------------------------------------------------------------

describe("confidence calibration", () => {
  const roleTemplates = [
    { name: "global.md", content: globalMd },
    { name: "ae.md", content: aeMd },
    { name: "manager.md", content: managerMd },
    { name: "director.md", content: directorMd },
    { name: "vp.md", content: vpMd },
  ];

  for (const { name, content } of roleTemplates) {
    it(`${name} has confidence calibration section`, () => {
      expect(content.toLowerCase()).toContain("calibracion de confianza");
    });
  }

  it("global.md references data_freshness.stale", () => {
    expect(globalMd).toContain("data_freshness.stale");
  });

  it("global.md warns against inventing data", () => {
    expect(globalMd.toLowerCase()).toContain("nunca inventes");
  });
});

// ---------------------------------------------------------------------------
// No OLD schema/tool references
// ---------------------------------------------------------------------------

describe("no OLD English schema references", () => {
  const oldNames = [
    "crm_people",
    "crm_accounts",
    "crm_contacts",
    "crm_opportunities",
    "crm_interactions",
    "crm_quotas",
    "crm_media_types",
    "crm_proposals",
    "crm_tasks_crm",
  ];

  for (let i = 0; i < allTemplates.length; i++) {
    it(`${allTemplateNames[i]} has no old schema names`, () => {
      for (const old of oldNames) {
        expect(
          allTemplates[i],
          `Found old name "${old}" in ${allTemplateNames[i]}`,
        ).not.toContain(old);
      }
    });
  }
});

describe("no OLD English tool references", () => {
  const oldTools = [
    "log_interaction",
    "update_opportunity",
    "create_crm_task",
    "update_crm_task",
  ];

  for (let i = 0; i < allTemplates.length; i++) {
    it(`${allTemplateNames[i]} has no old tool names`, () => {
      for (const old of oldTools) {
        expect(
          allTemplates[i],
          `Found old tool "${old}" in ${allTemplateNames[i]}`,
        ).not.toContain(old);
      }
    });
  }
});

// ---------------------------------------------------------------------------
// WhatsApp formatting
// ---------------------------------------------------------------------------

describe("WhatsApp formatting rules", () => {
  it("global.md mentions WhatsApp formatting", () => {
    expect(globalMd).toContain("WhatsApp");
  });

  it("global.md prohibits markdown headers", () => {
    expect(globalMd).toMatch(/NO.*markdown|no.*markdown/i);
  });

  it("global.md specifies bold formatting", () => {
    // Linter may normalize *text* to _text_ — both are valid markdown emphasis
    expect(globalMd).toMatch(/[*_]negritas[*_]/);
  });
});

// ---------------------------------------------------------------------------
// Business concepts in global.md
// ---------------------------------------------------------------------------

describe("global.md -- business concepts", () => {
  it("explains descarga concept", () => {
    expect(globalMd.toLowerCase()).toContain("descarga");
    expect(globalMd).toContain("gap");
  });

  it("explains cuota semanal", () => {
    expect(globalMd.toLowerCase()).toContain("cuota");
  });

  it("explains mega-deal threshold", () => {
    expect(globalMd).toContain("15M");
  });

  it("explains dias_sin_actividad", () => {
    expect(globalMd).toContain("dias_sin_actividad");
  });

  it("explains es_fundador priority", () => {
    expect(globalMd).toContain("es_fundador");
  });

  it("references generated columns", () => {
    expect(globalMd).toContain("generado");
    expect(globalMd).toContain("es_mega");
    expect(globalMd).toContain("porcentaje");
  });
});

// ---------------------------------------------------------------------------
// Team templates -- privacy rules
// ---------------------------------------------------------------------------

describe("team templates -- privacy rules", () => {
  it("team-mgr.md has privacy rules", () => {
    expect(teamMgrMd.toLowerCase()).toContain("nunca");
    expect(teamMgrMd.toLowerCase()).toMatch(/individual|privado/);
  });

  it("team-dir.md has privacy rules", () => {
    expect(teamDirMd.toLowerCase()).toContain("nunca");
    expect(teamDirMd.toLowerCase()).toMatch(/individual|privado/);
  });

  it("team-vp.md has privacy rules", () => {
    expect(teamVpMd.toLowerCase()).toMatch(/individual|privado/);
  });

  it("team templates mention @mentions", () => {
    expect(teamMgrMd).toContain("@");
    expect(teamDirMd).toContain("@");
    expect(teamVpMd).toContain("@");
  });
});

// ---------------------------------------------------------------------------
// All 8 template files exist
// ---------------------------------------------------------------------------

describe("all template files exist", () => {
  for (const name of allTemplateNames) {
    it(`${name} exists and is non-empty`, () => {
      const content = readTemplate(name);
      expect(content.length).toBeGreaterThan(50);
    });
  }
});
