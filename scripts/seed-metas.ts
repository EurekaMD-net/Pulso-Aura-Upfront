/**
 * Seed Closing Goals (Cierres 2026 / Metas 2027) Script
 *
 * Loads the operator's "Cierres 2026 A Semana 24" sheet (exported to two long
 * CSVs) into cierre_meta + cierre_meta_linea, linking each account to its
 * `cuenta` by (gerente_code, normalized account name). Idempotent — re-running
 * refreshes the figures. Run `npm run register-team` + `seed:cuentas` FIRST so
 * the accounts exist to link to.
 *
 * Usage:
 *   tsx scripts/seed-metas.ts --headers seed/cierre-metas-headers.csv --lines seed/cierre-metas.csv
 */

import fs from "fs";
import path from "path";
import { initDatabase } from "../engine/src/db.js";
import { bootstrapCrm } from "../crm/src/bootstrap.js";
import { parseCierreCsvs, loadCierreMetas } from "../crm/src/cierre/load.js";

function argOf(args: string[], flag: string): string | undefined {
  const i = args.indexOf(flag);
  return i === -1 ? undefined : args[i + 1];
}

function main(): void {
  const args = process.argv.slice(2);
  const headersPath =
    argOf(args, "--headers") ?? "seed/cierre-metas-headers.csv";
  const linesPath = argOf(args, "--lines") ?? "seed/cierre-metas.csv";
  const hp = path.resolve(headersPath);
  const lp = path.resolve(linesPath);
  console.log(`Loading closing goals:\n  headers: ${hp}\n  lines:   ${lp}`);

  initDatabase();
  bootstrapCrm();

  const rows = parseCierreCsvs(
    fs.readFileSync(hp, "utf-8"),
    fs.readFileSync(lp, "utf-8"),
  );
  const r = loadCierreMetas(rows);

  console.log(
    `\n${r.rows} rows over ${r.cuentas} accounts ` +
      `(cierre_2026 ${r.porEscenario.cierre_2026}, base_2026 ${r.porEscenario.base_2026}, meta_2027 ${r.porEscenario.meta_2027}).`,
  );
  console.log(
    `Account link: ${r.linked} linked, ${r.unmatched.length} unmatched (pilot), ` +
      `${r.ambiguous.length} ambiguous, ${r.nonPilot} non-pilot (left unlinked).`,
  );
  if (r.unmatched.length) {
    console.log(
      `\n⚠ Pilot accounts with closings but no CRM account match — loaded UNLINKED (create/alias the cuenta):\n  ` +
        r.unmatched
          .map((u) => `${u.gerenteCode} / ${u.cuentaRaw}`)
          .join("\n  "),
    );
  }
  if (r.ambiguous.length) {
    console.log(
      `\n⚠ Ambiguous account name — left UNLINKED (no guess):\n  ` +
        r.ambiguous
          .map(
            (a) => `${a.gerenteCode} / ${a.cuentaRaw} (${a.matches} matches)`,
          )
          .join("\n  "),
    );
  }
}

main();
