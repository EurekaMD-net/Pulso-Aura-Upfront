/**
 * Seed Accounts (cuenta) Script
 *
 * Bulk-seeds real accounts from a CSV or JSON roster, deriving ownership from the
 * already-seeded sales team (run `npm run register-team` FIRST) and linking each
 * account to its advertiser (anunciante) — the join into the Aura brand intelligence.
 *
 * Usage:
 *   tsx scripts/seed-cuentas.ts --file cuentas.csv
 *   tsx scripts/seed-cuentas.ts --file cuentas.json
 *
 * CSV columns (header row required):
 *   nombre,tipo,ae_name,anunciante,vertical,holding_agencia,agencia_medios,anos_relacion,notas
 *   - nombre, tipo (directo|agencia), ae_name are required.
 *   - anunciante is OPTIONAL — set it only when `nombre` doesn't match the
 *     advertiser as it appears in the map (otherwise the account name is used).
 */

import path from "path";
import { initDatabase } from "../engine/src/db.js";
import { bootstrapCrm } from "../crm/src/bootstrap.js";
import { parseCuentaFile, seedCuentas } from "../crm/src/cuenta-seed.js";

function main(): void {
  const args = process.argv.slice(2);
  const fileIdx = args.indexOf("--file");
  if (fileIdx === -1 || !args[fileIdx + 1]) {
    console.error(
      "Usage: tsx scripts/seed-cuentas.ts --file <cuentas.csv|cuentas.json>",
    );
    process.exit(1);
  }

  const filePath = path.resolve(args[fileIdx + 1]);
  console.log(`Seeding accounts from: ${filePath}`);

  initDatabase();
  bootstrapCrm();

  const rows = parseCuentaFile(filePath);
  const r = seedCuentas(rows);

  console.log(
    `\nAccounts: ${r.inserted} inserted, ${r.skippedExisting} skipped (existing), of ${r.rows} rows.`,
  );
  console.log(
    `Advertiser link: ${r.linked} linked, ${r.ambiguousLink.length} ambiguous, ${r.unmatchedLink.length} unmatched.`,
  );
  if (r.aeUnresolved.length) {
    console.log(
      `\n⚠ AE not found — ownership left null (fix the name or register the AE):\n  ${r.aeUnresolved.join("\n  ")}`,
    );
  }
  if (r.ambiguousLink.length) {
    console.log(
      `\n⚠ Ambiguous advertiser — left UNLINKED (add an explicit 'anunciante' column):\n  ${r.ambiguousLink.join("\n  ")}`,
    );
  }
  if (r.unmatchedLink.length) {
    console.log(
      `\n⚠ No advertiser match — left UNLINKED (radiografía-by-name still works):\n  ${r.unmatchedLink.join("\n  ")}`,
    );
  }
  if (r.slugCollision.length) {
    console.log(
      `\n⚠ Slug collision — these distinct names map to the same id; only the FIRST was inserted (disambiguate the names):\n  ${r.slugCollision.join("\n  ")}`,
    );
  }
}

main();
