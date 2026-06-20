/**
 * Sync live group templates (Terminology Protocol layer 2).
 *
 * The running agent reads each group folder's generated `CLAUDE.md`
 * (= global.md + role template), NOT the `crm/groups/*.md` source templates.
 * After editing a template, run this to regenerate every persona's live
 * CLAUDE.md from the current templates so the change actually reaches the agent.
 *
 * Safe + idempotent: persona memory lives in `crm_memories` (the DB), not the
 * file, so rewriting CLAUDE.md loses nothing. Also retroactively fixes folders
 * generated before the gerente->manager.md template mapping.
 *
 * Usage:  tsx scripts/sync-group-templates.ts [--groups groups] [--templates crm/groups]
 */

import fs from "fs";
import path from "path";
import { initDatabase } from "../engine/src/db.js";
import { bootstrapCrm } from "../crm/src/bootstrap.js";
import { getDatabase } from "../crm/src/db.js";
import { copyRoleTemplate } from "../crm/src/register.js";

function argOf(args: string[], flag: string, def: string): string {
  const i = args.indexOf(flag);
  return i === -1 ? def : (args[i + 1] ?? def);
}

function main(): void {
  const args = process.argv.slice(2);
  const groupsBase = path.resolve(argOf(args, "--groups", "groups"));
  const templatesDir = path.resolve(argOf(args, "--templates", "crm/groups"));
  console.log(
    `Regenerating live CLAUDE.md from templates:\n  groups:    ${groupsBase}\n  templates: ${templatesDir}`,
  );

  initDatabase();
  bootstrapCrm();
  const db = getDatabase();
  const rows = db
    .prepare(
      `SELECT nombre, rol, whatsapp_group_folder AS folder FROM persona
       WHERE whatsapp_group_folder IS NOT NULL AND COALESCE(activo,1) = 1`,
    )
    .all() as { nombre: string; rol: string; folder: string }[];

  let synced = 0;
  const missing: string[] = [];
  for (const r of rows) {
    const groupDir = path.join(groupsBase, r.folder);
    if (!fs.existsSync(groupDir)) {
      missing.push(`${r.folder} (${r.nombre})`);
      continue;
    }
    copyRoleTemplate(groupDir, r.rol, templatesDir);
    synced++;
  }

  console.log(`\nRegenerated ${synced} of ${rows.length} persona folders.`);
  if (missing.length) {
    console.log(
      `\n⚠ Folder not found on disk — skipped (create the WhatsApp group folder first):\n  ` +
        missing.join("\n  "),
    );
  }
}

main();
