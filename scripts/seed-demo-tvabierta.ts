#!/usr/bin/env tsx
/**
 * Seed Demo — Imagen Televisión (CRM Pulso)
 *
 * Populates the CRM with the REAL org chart of Imagen Televisión.
 * Source: "director comercial ventas televisión (3) (2).pdf"
 * Use: Live demo with Imagen TV prospects.
 *
 * Run: npx tsx scripts/seed-demo-tvabierta.ts
 * Reset first: rm data/store/crm.db && npx tsx scripts/seed-demo-tvabierta.ts
 */

import { getDatabase } from '../crm/src/db.js';
import { createCrmSchema } from '../crm/src/schema.js';

const db = getDatabase();
db.pragma('foreign_keys = ON');
createCrmSchema(db);

function id(prefix: string, n: number): string {
  return `${prefix}-${String(n).padStart(3, '0')}`;
}

const YEAR = 2026;
const DOMAIN = 'imagentv.com.mx';

// Helper email builder
function email(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, '.')
    .replace(/[^a-z.]/g, '') + '@' + DOMAIN;
}

// ===========================================================================
// 1. PERSONA — Organigrama real Imagen Televisión
// ===========================================================================

interface PersonaSeed { id: string; nombre: string; rol: string; reporta_a: string | null; email: string; folder: string; }

const personas: PersonaSeed[] = [
  // Nivel 1 — Dirección
  { id: id('per',1),  nombre:'Mauricio Majul',        rol:'vp',       reporta_a:null,          email:email('Mauricio Majul'),        folder:'vp-mauricio-majul' },
  { id: id('per',2),  nombre:'Leslie García',          rol:'admin',    reporta_a:id('per',1),   email:email('Leslie García'),         folder:'asist-leslie-garcia' },

  // Nivel 2 — Directores Ventas TV
  { id: id('per',3),  nombre:'Luis Arturo Hernandez',  rol:'director', reporta_a:id('per',1),   email:email('Luis Arturo Hernandez'), folder:'dir-luis-arturo-hernandez' },
  { id: id('per',4),  nombre:'Yusileismy Caraballo',   rol:'director', reporta_a:id('per',1),   email:email('Yusileismy Caraballo'),  folder:'dir-yusileismy-caraballo' },
  { id: id('per',5),  nombre:'Javier Arnau',           rol:'director', reporta_a:id('per',1),   email:email('Javier Arnau'),          folder:'dir-javier-arnau' },

  // Ad Value
  { id: id('per',6),  nombre:'Gotzon Sandoval',        rol:'director', reporta_a:id('per',1),   email:email('Gotzon Sandoval'),       folder:'dir-gotzon-sandoval-advalue' },
  { id: id('per',7),  nombre:'Paty Lopez',             rol:'admin',    reporta_a:id('per',6),   email:email('Paty Lopez'),            folder:'asist-paty-lopez' },
  { id: id('per',8),  nombre:'Israel Montes',          rol:'gerente',  reporta_a:id('per',6),   email:email('Israel Montes'),         folder:'ger-israel-montes-creativo' },
  { id: id('per',9),  nombre:'Miguel Aldasoro',        rol:'gerente',  reporta_a:id('per',6),   email:email('Miguel Aldasoro'),       folder:'ger-miguel-aldasoro-pi' },

  // Administración Comercial
  { id: id('per',10), nombre:'Alejandra Cordova',      rol:'director', reporta_a:id('per',1),   email:email('Alejandra Cordova'),     folder:'dir-alejandra-cordova-admon' },
  { id: id('per',11), nombre:'Vannesa Viñuela',        rol:'gerente',  reporta_a:id('per',10),  email:email('Vannesa Viñuela'),       folder:'ger-vannesa-vinuela-admon' },
  { id: id('per',12), nombre:'Claudia Alfaro',         rol:'gerente',  reporta_a:id('per',10),  email:email('Claudia Alfaro'),        folder:'ger-claudia-alfaro-data' },
  { id: id('per',13), nombre:'Edgar López',            rol:'gerente',  reporta_a:id('per',10),  email:email('Edgar López'),           folder:'ger-edgar-lopez-ops' },

  // BI / Research
  { id: id('per',14), nombre:'Roger Guevara',          rol:'gerente',  reporta_a:id('per',1),   email:email('Roger Guevara'),         folder:'ger-roger-guevara-bi' },

  // Nivel 3 — Gerentes Ventas TV bajo Luis Arturo
  { id: id('per',20), nombre:'Lorena Pizarro',         rol:'gerente',  reporta_a:id('per',3),   email:email('Lorena Pizarro'),        folder:'ger-lorena-pizarro' },
  { id: id('per',21), nombre:'Frida Mendoza',          rol:'gerente',  reporta_a:id('per',3),   email:email('Frida Mendoza'),         folder:'ger-frida-mendoza' },
  { id: id('per',22), nombre:'Victor Garza',           rol:'gerente',  reporta_a:id('per',3),   email:email('Victor Garza'),          folder:'ger-victor-garza' },

  // Gerentes bajo Yusileismy
  { id: id('per',23), nombre:'Yael Perez',             rol:'gerente',  reporta_a:id('per',4),   email:email('Yael Perez'),            folder:'ger-yael-perez' },
  { id: id('per',24), nombre:'Rebeca Figueroa',        rol:'gerente',  reporta_a:id('per',4),   email:email('Rebeca Figueroa'),       folder:'ger-rebeca-figueroa' },

  // Gerentes bajo Javier Arnau
  { id: id('per',25), nombre:'Josefina Cano',          rol:'gerente',  reporta_a:id('per',5),   email:email('Josefina Cano'),         folder:'ger-josefina-cano' },
  { id: id('per',26), nombre:'Adria Reynal',           rol:'gerente',  reporta_a:id('per',5),   email:email('Adria Reynal'),          folder:'ger-adria-reynal' },
  { id: id('per',27), nombre:'Alejandra Medrano',      rol:'gerente',  reporta_a:id('per',5),   email:email('Alejandra Medrano'),     folder:'ger-alejandra-medrano' },

  // Ventas Locales
  { id: id('per',28), nombre:'Gabriela Valle',         rol:'gerente',  reporta_a:id('per',3),   email:email('Gabriela Valle'),        folder:'ger-gabriela-valle-locales' },

  // Nivel 4 — Ejecutivos Ventas TV
  // Bajo Lorena Pizarro
  { id: id('per',40), nombre:'Andrea Camarena',        rol:'ae',       reporta_a:id('per',20),  email:email('Andrea Camarena'),       folder:'ae-andrea-camarena' },
  { id: id('per',41), nombre:'Ricardo Zamora',         rol:'ae',       reporta_a:id('per',20),  email:email('Ricardo Zamora'),        folder:'ae-ricardo-zamora' },
  // Bajo Frida Mendoza
  { id: id('per',42), nombre:'Chantal Miranda',        rol:'ae',       reporta_a:id('per',21),  email:email('Chantal Miranda'),       folder:'ae-chantal-miranda' },
  { id: id('per',43), nombre:'Dulce Perez',            rol:'ae',       reporta_a:id('per',21),  email:email('Dulce Perez'),           folder:'ae-dulce-perez' },
  // Bajo Victor Garza
  { id: id('per',44), nombre:'Daniel Mateos',          rol:'ae',       reporta_a:id('per',22),  email:email('Daniel Mateos'),         folder:'ae-daniel-mateos' },
  // Bajo Yael Perez
  { id: id('per',45), nombre:'Beatriz Marín',          rol:'ae',       reporta_a:id('per',23),  email:email('Beatriz Marín'),         folder:'ae-beatriz-marin' },
  { id: id('per',46), nombre:'Eduardo Servin',         rol:'ae',       reporta_a:id('per',23),  email:email('Eduardo Servin'),        folder:'ae-eduardo-servin' },
  // Bajo Rebeca Figueroa
  { id: id('per',47), nombre:'Anayatzin Beristain',    rol:'ae',       reporta_a:id('per',24),  email:email('Anayatzin Beristain'),   folder:'ae-anayatzin-beristain' },
  // Bajo Josefina Cano
  { id: id('per',48), nombre:'Claudia Orozco',         rol:'ae',       reporta_a:id('per',25),  email:email('Claudia Orozco'),        folder:'ae-claudia-orozco' },
  { id: id('per',49), nombre:'Ana Sofia Estrada',      rol:'ae',       reporta_a:id('per',25),  email:email('Ana Sofia Estrada'),     folder:'ae-ana-sofia-estrada' },
  // Bajo Adria Reynal
  { id: id('per',50), nombre:'Janeth Sanchez',         rol:'ae',       reporta_a:id('per',26),  email:email('Janeth Sanchez'),        folder:'ae-janeth-sanchez' },
  { id: id('per',51), nombre:'Gabriel Vidal',          rol:'ae',       reporta_a:id('per',26),  email:email('Gabriel Vidal'),         folder:'ae-gabriel-vidal' },
  // Bajo Alejandra Medrano
  { id: id('per',52), nombre:'Gastón Flores',          rol:'ae',       reporta_a:id('per',27),  email:email('Gastón Flores'),         folder:'ae-gaston-flores' },
  { id: id('per',53), nombre:'Karen Martinez',         rol:'ae',       reporta_a:id('per',27),  email:email('Karen Martinez'),        folder:'ae-karen-martinez' },
  // Ventas Locales
  { id: id('per',54), nombre:'Leticia Morales',        rol:'ae',       reporta_a:id('per',28),  email:email('Leticia Morales'),       folder:'ae-locales-leticia-morales' },
  { id: id('per',55), nombre:'Enrique Sosa',           rol:'ae',       reporta_a:id('per',28),  email:email('Enrique Sosa'),          folder:'ae-locales-enrique-sosa' },
  // Ad Value ejecutivos
  { id: id('per',60), nombre:'Violeta López',          rol:'ae',       reporta_a:id('per',9),   email:email('Violeta López'),         folder:'ae-pi-violeta-lopez' },
  { id: id('per',61), nombre:'Enrique Rodriguez',      rol:'ae',       reporta_a:id('per',9),   email:email('Enrique Rodriguez'),     folder:'ae-pi-enrique-rodriguez' },
  { id: id('per',62), nombre:'Yazmin Manzo',           rol:'ae',       reporta_a:id('per',8),   email:email('Yazmin Manzo'),          folder:'ae-creativo-yazmin-manzo' },
];

const insertPersona = db.prepare(
  `INSERT OR REPLACE INTO persona (id, nombre, rol, reporta_a, whatsapp_group_folder, email, activo)
   VALUES (?, ?, ?, ?, ?, ?, 1)`
);
for (const p of personas) {
  insertPersona.run(p.id, p.nombre, p.rol, p.reporta_a, p.folder, p.email);
}
console.log(`✅ Personas: ${personas.length} insertadas`);

// AEs nacionales para asignación de cuentas
const aeNacionales = personas
  .filter(p => p.rol === 'ae' && !p.folder.includes('locales') && !p.folder.includes('pi') && !p.folder.includes('creativo'))
  .map(p => p.id);

// ===========================================================================
// 2. CUENTAS — Anunciantes nacionales TV Abierta MX
// ===========================================================================

interface CuentaSeed { id: string; nombre: string; tipo: string; vertical: string; ae_idx: number; años: number; fundador: number; }

const cuentas: CuentaSeed[] = [
  { id: id('cta',1),  nombre:'Coca-Cola',           tipo:'directo',  vertical:'Bebidas',            ae_idx:0,  años:15, fundador:1 },
  { id: id('cta',2),  nombre:'Bimbo',               tipo:'directo',  vertical:'Alimentos',          ae_idx:1,  años:12, fundador:1 },
  { id: id('cta',3),  nombre:'P&G',                 tipo:'agencia',  vertical:'Consumo Masivo',     ae_idx:2,  años:10, fundador:1 },
  { id: id('cta',4),  nombre:'Unilever',            tipo:'agencia',  vertical:'Consumo Masivo',     ae_idx:3,  años:8,  fundador:0 },
  { id: id('cta',5),  nombre:"L'Oréal",             tipo:'agencia',  vertical:'Belleza',            ae_idx:4,  años:5,  fundador:0 },
  { id: id('cta',6),  nombre:'Telcel',              tipo:'directo',  vertical:'Telecomunicaciones', ae_idx:5,  años:11, fundador:1 },
  { id: id('cta',7),  nombre:'Liverpool',           tipo:'directo',  vertical:'Retail',             ae_idx:6,  años:6,  fundador:0 },
  { id: id('cta',8),  nombre:'Volkswagen',          tipo:'agencia',  vertical:'Automotriz',         ae_idx:7,  años:9,  fundador:0 },
  { id: id('cta',9),  nombre:'Nestlé',              tipo:'agencia',  vertical:'Alimentos',          ae_idx:8,  años:13, fundador:1 },
  { id: id('cta',10), nombre:'Colgate-Palmolive',   tipo:'agencia',  vertical:'Consumo Masivo',     ae_idx:9,  años:7,  fundador:0 },
  { id: id('cta',11), nombre:'BBVA México',         tipo:'directo',  vertical:'Financiero',         ae_idx:10, años:4,  fundador:0 },
  { id: id('cta',12), nombre:'Farmacias del Ahorro',tipo:'directo',  vertical:'Retail Salud',       ae_idx:11, años:3,  fundador:0 },
  { id: id('cta',13), nombre:'Soriana',             tipo:'directo',  vertical:'Retail',             ae_idx:0,  años:5,  fundador:0 },
  { id: id('cta',14), nombre:'Banamex',             tipo:'directo',  vertical:'Financiero',         ae_idx:1,  años:6,  fundador:0 },
  { id: id('cta',15), nombre:'Kelloggs',            tipo:'agencia',  vertical:'Alimentos',          ae_idx:2,  años:4,  fundador:0 },
];

const insertCuenta = db.prepare(
  `INSERT OR REPLACE INTO cuenta (id, nombre, tipo, vertical, ae_id, años_relacion, es_fundador)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
for (const c of cuentas) {
  insertCuenta.run(c.id, c.nombre, c.tipo, c.vertical, aeNacionales[c.ae_idx % aeNacionales.length], c.años, c.fundador);
}
console.log(`✅ Cuentas: ${cuentas.length} insertadas`);

// ===========================================================================
// 3. CONTACTOS — 2 por cuenta
// ===========================================================================

const insertContacto = db.prepare(
  `INSERT OR REPLACE INTO contacto (id, nombre, cuenta_id, rol, seniority, email)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const decisiores = [
  'Dir. Mktg','VP Marketing','Gerente Mktg','Dir. Publicidad','Dir. Medios',
  'Dir. Comunicación','VP Marca','Dir. Consumer','Head of Media','Dir. Growth',
  'Dir. Brand','VP Mktg','Dir. Comercial','Dir. ATL','Dir. Medios'
];
const compradores = [
  'Planeador Medios','Compras Medios','Media Planner','Comprador TV','Media Buyer',
  'Planeación Medios','Compras TV','Media Planner Sr','Investment Lead','Trading Desk',
  'Media Manager','Compras','Media Buyer Sr','Planeación','Planeador'
];

for (let i = 0; i < cuentas.length; i++) {
  const safe = cuentas[i].nombre.toLowerCase().replace(/[^a-z]/g, '');
  insertContacto.run(id('con', i*2+1), `${decisiores[i]} ${cuentas[i].nombre}`, cuentas[i].id, 'decisor',  'director', `mktg@${safe}.com`);
  insertContacto.run(id('con', i*2+2), `${compradores[i]} ${cuentas[i].nombre}`, cuentas[i].id, 'comprador', 'senior',   `medios@${safe}.com`);
}
console.log(`✅ Contactos: ${cuentas.length * 2} insertados`);

// ===========================================================================
// 4. INVENTARIO — Franjas TV Abierta con precios reales MXN
// ===========================================================================

const inventario = [
  { nombre:'Spot 30s Prime Time Lunes-Viernes',    medio:'tv_abierta', formato:'spot_30', precio:120_000, disponible:80,  vendido:45 },
  { nombre:'Spot 30s Prime Time Sábado',           medio:'tv_abierta', formato:'spot_30', precio:135_000, disponible:40,  vendido:38 },
  { nombre:'Spot 60s Prime Time Lunes-Viernes',    medio:'tv_abierta', formato:'spot_60', precio:220_000, disponible:30,  vendido:12 },
  { nombre:'Noticiero Central 30s',                medio:'tv_abierta', formato:'spot_30', precio:75_000,  disponible:100, vendido:60 },
  { nombre:'Noticiero Central 60s',                medio:'tv_abierta', formato:'spot_60', precio:140_000, disponible:40,  vendido:18 },
  { nombre:'Telenovela Vespertina 30s',            medio:'tv_abierta', formato:'spot_30', precio:55_000,  disponible:120, vendido:55 },
  { nombre:'Matutino Foro TV 30s',                 medio:'tv_abierta', formato:'spot_30', precio:35_000,  disponible:150, vendido:40 },
  { nombre:'Matutino Foro TV 60s',                 medio:'tv_abierta', formato:'spot_60', precio:65_000,  disponible:60,  vendido:15 },
  { nombre:'Futbol Viernes Noche 30s',             medio:'tv_abierta', formato:'spot_30', precio:95_000,  disponible:60,  vendido:58 },
  { nombre:'Futbol Viernes Noche 60s',             medio:'tv_abierta', formato:'spot_60', precio:175_000, disponible:20,  vendido:19 },
  { nombre:'Espacio Liga MX Sábado 30s',           medio:'tv_abierta', formato:'spot_30', precio:110_000, disponible:80,  vendido:71 },
  { nombre:'Especial Navidad 30s (dic)',            medio:'tv_abierta', formato:'spot_30', precio:180_000, disponible:30,  vendido:30 },
  { nombre:'Pre-roll Imagen TV+ 15s',              medio:'ctv',        formato:'preroll', precio:8_500,   disponible:500, vendido:120 },
  { nombre:'Pre-roll Imagen TV+ 30s',              medio:'ctv',        formato:'preroll', precio:14_000,  disponible:300, vendido:85 },
  { nombre:'Mención en Noticiero 30s',             medio:'tv_abierta', formato:'pi',      precio:55_000,  disponible:50,  vendido:12 },
  { nombre:'Integración Programa Matutino',        medio:'tv_abierta', formato:'pi',      precio:220_000, disponible:15,  vendido:4  },
  { nombre:'Branded Content 3 min',               medio:'tv_abierta', formato:'pi',      precio:450_000, disponible:8,   vendido:2  },
];

const insertInv = db.prepare(
  `INSERT OR REPLACE INTO inventario (id, nombre, medio, formato, precio_unitario, disponibilidad, vendidos)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);
for (let i = 0; i < inventario.length; i++) {
  const inv = inventario[i];
  insertInv.run(id('inv', i+1), inv.nombre, inv.medio, inv.formato, inv.precio, inv.disponible, inv.vendido);
}
console.log(`✅ Inventario: ${inventario.length} SKUs TV Abierta`);

// ===========================================================================
// 5. CUOTAS 2026 — escalas MXN reales para TV Abierta nacional
// ===========================================================================

const cuotas = [
  { persona_id: id('per',1),  cuota_anual: 1_800_000_000 }, // VP total org
  // Directores
  { persona_id: id('per',3),  cuota_anual: 560_000_000 },
  { persona_id: id('per',4),  cuota_anual: 540_000_000 },
  { persona_id: id('per',5),  cuota_anual: 480_000_000 },
  { persona_id: id('per',6),  cuota_anual: 220_000_000 }, // Ad Value
  // Gerentes TV
  { persona_id: id('per',20), cuota_anual: 180_000_000 },
  { persona_id: id('per',21), cuota_anual: 165_000_000 },
  { persona_id: id('per',22), cuota_anual: 155_000_000 },
  { persona_id: id('per',23), cuota_anual: 175_000_000 },
  { persona_id: id('per',24), cuota_anual: 160_000_000 },
  { persona_id: id('per',25), cuota_anual: 150_000_000 },
  { persona_id: id('per',26), cuota_anual: 145_000_000 },
  { persona_id: id('per',27), cuota_anual: 130_000_000 },
  { persona_id: id('per',28), cuota_anual: 80_000_000  }, // Locales
  // AEs
  { persona_id: id('per',40), cuota_anual: 58_000_000 },
  { persona_id: id('per',41), cuota_anual: 52_000_000 },
  { persona_id: id('per',42), cuota_anual: 55_000_000 },
  { persona_id: id('per',43), cuota_anual: 48_000_000 },
  { persona_id: id('per',44), cuota_anual: 45_000_000 },
  { persona_id: id('per',45), cuota_anual: 60_000_000 },
  { persona_id: id('per',46), cuota_anual: 50_000_000 },
  { persona_id: id('per',47), cuota_anual: 42_000_000 },
  { persona_id: id('per',48), cuota_anual: 38_000_000 },
  { persona_id: id('per',49), cuota_anual: 35_000_000 },
  { persona_id: id('per',50), cuota_anual: 40_000_000 },
  { persona_id: id('per',51), cuota_anual: 37_000_000 },
  { persona_id: id('per',52), cuota_anual: 33_000_000 },
  { persona_id: id('per',53), cuota_anual: 30_000_000 },
];

const insertCuota = db.prepare(
  `INSERT OR REPLACE INTO cuota (id, persona_id, año, semana, monto_objetivo, monto_real)
   VALUES (?, ?, ?, ?, ?, ?)`
);

const SEMANA_ACTUAL = 20;
let cuotaSeq = 1;
for (const q of cuotas) {
  const semanalObj = Math.round(q.cuota_anual / 52);
  for (let sem = 1; sem <= SEMANA_ACTUAL; sem++) {
    // Factor estacional TV Abierta: ene-feb flojo, jun-ago sube, sep-dic peak
    const factorEstacional = sem <= 8 ? 0.72 : sem <= 14 ? 0.95 : 1.05;
    const variacion = 0.85 + Math.random() * 0.35;
    const real = sem < SEMANA_ACTUAL ? Math.round(semanalObj * factorEstacional * variacion) : 0;
    insertCuota.run(id('cuota', cuotaSeq++), q.persona_id, YEAR, sem, semanalObj, real);
  }
}
console.log(`✅ Cuotas: ${cuotaSeq - 1} registros`);

// ===========================================================================
// 6. CONTRATOS upfront 2026
// ===========================================================================

const contratoMontos = [380_000_000, 290_000_000, 240_000_000, 180_000_000, 120_000_000,
                        320_000_000, 95_000_000,  160_000_000, 210_000_000, 85_000_000];

const insertContrato = db.prepare(
  `INSERT OR REPLACE INTO contrato (id, cuenta_id, año, monto_comprometido, estatus)
   VALUES (?, ?, ?, ?, 'en_ejecucion')`
);
for (let i = 0; i < contratoMontos.length; i++) {
  insertContrato.run(id('ctr', i+1), cuentas[i].id, YEAR, contratoMontos[i]);
}
console.log(`✅ Contratos: ${contratoMontos.length} upfronts 2026`);

// ===========================================================================
// 7. DESCARGAS — billing semanal 1-19
// ===========================================================================

const insertDescarga = db.prepare(
  `INSERT OR REPLACE INTO descarga (id, contrato_id, semana, año, monto_planeado, monto_facturado)
   VALUES (?, ?, ?, ?, ?, ?)`
);

let descSeq = 1;
for (let i = 0; i < contratoMontos.length; i++) {
  const semanal = Math.round(contratoMontos[i] / 52);
  for (let sem = 1; sem < SEMANA_ACTUAL; sem++) {
    const factor = sem <= 8 ? 0.70 : sem <= 14 ? 0.92 : 1.08;
    const variacion = 0.88 + Math.random() * 0.28;
    const facturado = Math.round(semanal * factor * variacion);
    insertDescarga.run(id('desc', descSeq++), id('ctr', i+1), sem, YEAR, semanal, facturado);
  }
}
console.log(`✅ Descargas: ${descSeq - 1} registros de billing`);

// ===========================================================================
// 8. ACTIVIDADES recientes — demo-friendly
// ===========================================================================

const insertActividad = db.prepare(
  `INSERT OR REPLACE INTO actividad (id, persona_id, cuenta_id, tipo, descripcion, fecha, duracion_min)
   VALUES (?, ?, ?, ?, ?, ?, ?)`
);

const actividades = [
  { persona: id('per',1),  cuenta: id('cta',1),  tipo:'reunion',   desc:'Revisión Q2 con Dir. Mktg Coca-Cola', dias:-2, min:60 },
  { persona: id('per',1),  cuenta: id('cta',6),  tipo:'reunion',   desc:'Cierre upfront 2026-2027 Telcel', dias:-5, min:90 },
  { persona: id('per',3),  cuenta: id('cta',2),  tipo:'llamada',   desc:'Seguimiento propuesta Prime Time Bimbo W20', dias:-1, min:30 },
  { persona: id('per',4),  cuenta: id('cta',3),  tipo:'propuesta', desc:'Envío paquete Q3 P&G (telenovela + deportes)', dias:-3, min:0 },
  { persona: id('per',5),  cuenta: id('cta',8),  tipo:'llamada',   desc:'Negociación incremento VW — lanzamiento nuevo modelo', dias:-4, min:45 },
  { persona: id('per',20), cuenta: id('cta',9),  tipo:'reunion',   desc:'Revisión inventario disponible Nestlé mayo', dias:-2, min:45 },
  { persona: id('per',21), cuenta: id('cta',5),  tipo:'propuesta', desc:"Propuesta especial L'Oréal Día de Madres", dias:-1, min:0 },
  { persona: id('per',23), cuenta: id('cta',4),  tipo:'llamada',   desc:'Colateral Unilever producto nuevo', dias:-3, min:20 },
  { persona: id('per',25), cuenta: id('cta',10), tipo:'reunion',   desc:'Brief anual Colgate para S2 2026', dias:-5, min:60 },
  { persona: id('per',40), cuenta: id('cta',1),  tipo:'llamada',   desc:'Comprador Coca-Cola solicita disponibilidad futbol viernes', dias:0, min:15 },
  { persona: id('per',42), cuenta: id('cta',7),  tipo:'email',     desc:'Propuesta Liverpool Buen Fin adelantado (oct)', dias:-1, min:0 },
  { persona: id('per',45), cuenta: id('cta',6),  tipo:'llamada',   desc:'Seguimiento pauta Telcel noticiero central W21', dias:0, min:20 },
  { persona: id('per',47), cuenta: id('cta',11), tipo:'reunion',   desc:'Kick-off campaña BBVA verano 2026', dias:-2, min:50 },
  { persona: id('per',50), cuenta: id('cta',3),  tipo:'llamada',   desc:'P&G: ajuste mezcla Prime Time vs Noticiero Q2', dias:-1, min:25 },
];

let actSeq = 1;
for (const a of actividades) {
  const fecha = new Date();
  fecha.setDate(fecha.getDate() + a.dias);
  insertActividad.run(id('act', actSeq++), a.persona, a.cuenta, a.tipo, a.desc, fecha.toISOString(), a.min);
}
console.log(`✅ Actividades: ${actSeq - 1} registros recientes`);

// ===========================================================================
// SUMMARY
// ===========================================================================

const stats = {
  personas:    (db.prepare('SELECT COUNT(*) as n FROM persona').get()    as { n: number }).n,
  cuentas:     (db.prepare('SELECT COUNT(*) as n FROM cuenta').get()     as { n: number }).n,
  contactos:   (db.prepare('SELECT COUNT(*) as n FROM contacto').get()   as { n: number }).n,
  inventario:  (db.prepare('SELECT COUNT(*) as n FROM inventario').get() as { n: number }).n,
  cuotas:      (db.prepare('SELECT COUNT(*) as n FROM cuota').get()      as { n: number }).n,
  contratos:   (db.prepare('SELECT COUNT(*) as n FROM contrato').get()   as { n: number }).n,
  descargas:   (db.prepare('SELECT COUNT(*) as n FROM descarga').get()   as { n: number }).n,
  actividades: (db.prepare('SELECT COUNT(*) as n FROM actividad').get()  as { n: number }).n,
};

console.log('\n🚀 Demo Imagen TV seeded:');
Object.entries(stats).forEach(([k, v]) => console.log(`   ${k.padEnd(12)}: ${v}`));
console.log('\nLogins de demo:');
console.log('  VP         → mauricio.majul@imagentv.com.mx');
console.log('  Director   → luis.arturo.hernandez@imagentv.com.mx');
console.log('  Gerente    → lorena.pizarro@imagentv.com.mx');
console.log('  AE         → andrea.camarena@imagentv.com.mx');
console.log('  BI/Data    → roger.guevara@imagentv.com.mx');
