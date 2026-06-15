#!/usr/bin/env tsx
/**
 * Seed Demo — Inventario TV Abierta (CRM Pulso)
 *
 * Genera el inventario completo de spots y PI para el demo de Imagen Televisión.
 * Modelo: /root/claude/jarvis-kb/projects/expansion-crm/demo-tv-inventario-modelo.md §12
 *
 * Tablas que crea (NUEVAS, independientes del schema CRM base):
 *   - plaza            — Catálogo de plazas (CDMX, GDL, MTY)
 *   - programa         — Rejilla de programación (14 franjas)
 *   - inventario_spot  — Ledger de posiciones (nacional + local por plaza)
 *   - inventario_pi    — Inventario PI por programa y semana
 *   - paquete_template — 8 paquetes spot+PI
 *   - orden_compra     — OC de anunciantes
 *   - orden_compra_spot — Relación OC ↔ spots
 *   - orden_compra_pi  — Relación OC ↔ PI
 *
 * Run:
 *   cd /root/claude/crm-azteca
 *   npx tsx scripts/seed-demo-inventario.ts
 *
 * Notas de diseño:
 *   - Un spot es 'nacional' O 'local' — NUNCA los dos (campo `cobertura`)
 *   - Los spots locales existen por plaza; incluso CDMX tiene su comercialización local
 *   - W01–W20 2026 = histórico sintético con ocupación realista por franja
 *   - Precio: tarifa carta por spot 20s en MXN (no GRP/TRP)
 *   - Granularidad de bloque: número + nombre ("Corte de las 21:00, tercer bloque")
 */

import { getDatabase } from '../crm/src/db.js';
import { v4 as uuidv4 } from 'uuid';

const db = getDatabase();
db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

// ===========================================================================
// SCHEMA — Tablas nuevas de inventario TV
// ===========================================================================

function createInventarioSchema(): void {
  db.exec(`
    -- Plazas de comercialización local
    CREATE TABLE IF NOT EXISTS plaza (
      id     TEXT PRIMARY KEY,
      nombre TEXT NOT NULL,
      estado TEXT
    );

    -- Rejilla de programación
    CREATE TABLE IF NOT EXISTS programa (
      id                   TEXT PRIMARY KEY,
      nombre               TEXT NOT NULL,
      franja_label         TEXT NOT NULL,
      horario_inicio       TEXT NOT NULL,
      horario_fin          TEXT NOT NULL,
      genero               TEXT NOT NULL CHECK(genero IN (
                             'noticiero','telenovela','revista','deportes',
                             'entretenimiento','especial','documental')),
      audiencia_primaria   TEXT NOT NULL,
      min_comerciales_hora INTEGER NOT NULL,
      num_bloques          INTEGER NOT NULL,
      dias_semana          TEXT NOT NULL DEFAULT 'LMXJVSD',
      activo               INTEGER NOT NULL DEFAULT 1
    );

    -- Paquetes template (necesita existir antes de orden_compra)
    CREATE TABLE IF NOT EXISTS paquete_template (
      id                   TEXT PRIMARY KEY,
      nombre               TEXT NOT NULL,
      descripcion          TEXT,
      spots_semana         INTEGER NOT NULL,
      pi_tipo              TEXT,
      pi_unidades_semana   INTEGER DEFAULT 0,
      precio_mes           REAL NOT NULL,
      categoria_ideal      TEXT,
      programa_ids         TEXT
    );

    -- Orden de compra (necesita existir antes de inventario_spot)
    CREATE TABLE IF NOT EXISTS orden_compra (
      id              TEXT PRIMARY KEY,
      anunciante_id   TEXT NOT NULL REFERENCES cuenta(id),
      semana_inicio   TEXT NOT NULL,
      semana_fin      TEXT NOT NULL,
      tipo            TEXT NOT NULL CHECK(tipo IN ('spoteo','pi','paquete','mixto')),
      paquete_id      TEXT REFERENCES paquete_template(id),
      monto_total     REAL NOT NULL,
      descuento_pct   REAL DEFAULT 0,
      estado          TEXT NOT NULL DEFAULT 'confirmada'
                        CHECK(estado IN ('borrador','confirmada','facturada','cancelada')),
      agencia         TEXT,
      notas           TEXT,
      created_at      TEXT DEFAULT (datetime('now'))
    );

    -- Ledger de posiciones de spot
    CREATE TABLE IF NOT EXISTS inventario_spot (
      id              TEXT PRIMARY KEY,
      fecha           TEXT NOT NULL,
      semana_iso      TEXT NOT NULL,
      programa_id     TEXT NOT NULL REFERENCES programa(id),
      bloque_num      INTEGER NOT NULL,
      bloque_nombre   TEXT NOT NULL,
      posicion        INTEGER NOT NULL,
      cobertura       TEXT NOT NULL CHECK(cobertura IN ('nacional','local')),
      plaza_id        TEXT REFERENCES plaza(id),
      duracion_seg    INTEGER NOT NULL DEFAULT 20 CHECK(duracion_seg IN (20,40,120)),
      tarifa_carta    REAL NOT NULL,
      orden_compra_id TEXT REFERENCES orden_compra(id),
      anunciante_id   TEXT REFERENCES cuenta(id),
      categoria_bloque TEXT,
      UNIQUE(fecha, programa_id, bloque_num, posicion, cobertura, plaza_id)
    );

    -- Inventario PI
    CREATE TABLE IF NOT EXISTS inventario_pi (
      id              TEXT PRIMARY KEY,
      fecha           TEXT NOT NULL,
      semana_iso      TEXT NOT NULL,
      programa_id     TEXT NOT NULL REFERENCES programa(id),
      tipo_pi         TEXT NOT NULL CHECK(tipo_pi IN (
                        'PI-MEN','PI-CAP','PI-ENT','PI-SUP',
                        'PI-PRO','PI-INT','PI-PAT','PI-COR')),
      descripcion     TEXT,
      duracion_seg    INTEGER,
      tarifa_carta    REAL NOT NULL,
      orden_compra_id TEXT REFERENCES orden_compra(id),
      anunciante_id   TEXT REFERENCES cuenta(id)
    );

    -- Relación OC ↔ Spots
    CREATE TABLE IF NOT EXISTS orden_compra_spot (
      orden_compra_id TEXT NOT NULL REFERENCES orden_compra(id),
      spot_id         TEXT NOT NULL REFERENCES inventario_spot(id),
      PRIMARY KEY (orden_compra_id, spot_id)
    );

    -- Relación OC ↔ PI
    CREATE TABLE IF NOT EXISTS orden_compra_pi (
      orden_compra_id TEXT NOT NULL REFERENCES orden_compra(id),
      pi_id           TEXT NOT NULL REFERENCES inventario_pi(id),
      PRIMARY KEY (orden_compra_id, pi_id)
    );

    -- Índices para consultas rápidas del demo
    CREATE INDEX IF NOT EXISTS idx_spot_fecha      ON inventario_spot(fecha);
    CREATE INDEX IF NOT EXISTS idx_spot_semana     ON inventario_spot(semana_iso);
    CREATE INDEX IF NOT EXISTS idx_spot_programa   ON inventario_spot(programa_id);
    CREATE INDEX IF NOT EXISTS idx_spot_cobertura  ON inventario_spot(cobertura, plaza_id);
    CREATE INDEX IF NOT EXISTS idx_spot_disponible ON inventario_spot(orden_compra_id) WHERE orden_compra_id IS NULL;
    CREATE INDEX IF NOT EXISTS idx_pi_semana       ON inventario_pi(semana_iso);
    CREATE INDEX IF NOT EXISTS idx_pi_programa     ON inventario_pi(programa_id);
    CREATE INDEX IF NOT EXISTS idx_oc_anunciante   ON orden_compra(anunciante_id);
  `);
  console.log('✅ Schema de inventario TV creado');
}

// ===========================================================================
// PLAZAS
// ===========================================================================

const PLAZAS = [
  { id: 'PLZ-CDMX', nombre: 'Ciudad de México', estado: 'CDMX' },
  { id: 'PLZ-GDL',  nombre: 'Guadalajara',       estado: 'Jalisco' },
  { id: 'PLZ-MTY',  nombre: 'Monterrey',          estado: 'Nuevo León' },
] as const;

// ===========================================================================
// REJILLA DE PROGRAMACIÓN
// ===========================================================================

interface ProgramaSeed {
  id: string; nombre: string; franja_label: string;
  horario_inicio: string; horario_fin: string;
  genero: string; audiencia_primaria: string;
  min_comerciales_hora: number; num_bloques: number;
  dias_semana: string;
}

const PROGRAMAS: ProgramaSeed[] = [
  { id:'PRG-01', nombre:'Buenos Días Imagen',         franja_label:'Madrugada/Mañana',    horario_inicio:'06:00', horario_fin:'07:00', genero:'noticiero',       audiencia_primaria:'mix',           min_comerciales_hora:8,  num_bloques:4, dias_semana:'LMXJVSD' },
  { id:'PRG-02', nombre:'Despierta con Imagen',        franja_label:'Mañana temprana',     horario_inicio:'07:00', horario_fin:'09:00', genero:'revista',         audiencia_primaria:'muj_45_mas',    min_comerciales_hora:10, num_bloques:4, dias_semana:'LMXJV'  },
  { id:'PRG-03', nombre:'Hoy en Imagen',               franja_label:'Mañana alta',         horario_inicio:'09:00', horario_fin:'11:00', genero:'revista',         audiencia_primaria:'muj_45_mas',    min_comerciales_hora:10, num_bloques:4, dias_semana:'LMXJV'  },
  { id:'PRG-04', nombre:'Noticias Imagen Mediodía',    franja_label:'Mediodía',            horario_inicio:'11:00', horario_fin:'13:00', genero:'noticiero',       audiencia_primaria:'mix',           min_comerciales_hora:10, num_bloques:4, dias_semana:'LMXJV'  },
  { id:'PRG-05', nombre:'La Familia de la Tarde',      franja_label:'Tarde',               horario_inicio:'13:00', horario_fin:'15:00', genero:'entretenimiento', audiencia_primaria:'muj_45_mas',    min_comerciales_hora:12, num_bloques:4, dias_semana:'LMXJVSD' },
  { id:'PRG-06', nombre:'Telenovela Vespertina',        franja_label:'Vespertino',          horario_inicio:'15:00', horario_fin:'17:00', genero:'telenovela',      audiencia_primaria:'muj_45_mas',    min_comerciales_hora:13, num_bloques:3, dias_semana:'LMXJVSD' },
  { id:'PRG-07', nombre:'Infórmate con Imagen',        franja_label:'Tarde noche',         horario_inicio:'17:00', horario_fin:'19:00', genero:'noticiero',       audiencia_primaria:'mix',           min_comerciales_hora:11, num_bloques:4, dias_semana:'LMXJV'  },
  { id:'PRG-08', nombre:'Deportes Imagen',             franja_label:'Pre-Prime deportes',  horario_inicio:'19:00', horario_fin:'20:00', genero:'deportes',        audiencia_primaria:'adulto_hombre', min_comerciales_hora:12, num_bloques:4, dias_semana:'LMXJV'  },
  { id:'PRG-09', nombre:'Fútbol Total Imagen',         franja_label:'Deportes finde',      horario_inicio:'19:00', horario_fin:'21:00', genero:'deportes',        audiencia_primaria:'adulto_hombre', min_comerciales_hora:13, num_bloques:4, dias_semana:'SD'      },
  { id:'PRG-10', nombre:'Noticiero Imagen Estelar',    franja_label:'Noticiero Estelar',   horario_inicio:'20:00', horario_fin:'21:00', genero:'noticiero',       audiencia_primaria:'mix',           min_comerciales_hora:12, num_bloques:3, dias_semana:'LMXJV'  },
  { id:'PRG-11', nombre:'Imagen Prime Noticias',       franja_label:'Apertura Prime',      horario_inicio:'21:00', horario_fin:'21:30', genero:'noticiero',       audiencia_primaria:'mix',           min_comerciales_hora:12, num_bloques:3, dias_semana:'LMXJV'  },
  { id:'PRG-12', nombre:'Amor y Venganza',             franja_label:'Telenovela Prime',    horario_inicio:'21:30', horario_fin:'22:30', genero:'telenovela',      audiencia_primaria:'muj_45_mas',    min_comerciales_hora:15, num_bloques:3, dias_semana:'LMXJV'  },
  { id:'PRG-13', nombre:'Imagen Nocturno',             franja_label:'Post-Prime',          horario_inicio:'22:30', horario_fin:'23:00', genero:'entretenimiento', audiencia_primaria:'joven',         min_comerciales_hora:13, num_bloques:3, dias_semana:'LMXJV'  },
  { id:'PRG-14', nombre:'Cierre del Día Imagen',       franja_label:'Trasnoche',           horario_inicio:'23:00', horario_fin:'00:00', genero:'noticiero',       audiencia_primaria:'mix',           min_comerciales_hora:8,  num_bloques:3, dias_semana:'LMXJVSD' },
];

// Tarifa carta por spot 20s NACIONAL (MXN)
const TARIFA_NACIONAL: Record<string, number> = {
  'PRG-01': 18_000, 'PRG-02': 25_000, 'PRG-03': 28_000, 'PRG-04': 32_000,
  'PRG-05': 40_000, 'PRG-06': 55_000, 'PRG-07': 45_000, 'PRG-08': 65_000,
  'PRG-09': 70_000, 'PRG-10': 120_000,'PRG-11': 150_000,'PRG-12': 195_000,
  'PRG-13': 80_000, 'PRG-14': 22_000,
};

// Local = 15% del precio nacional
const TARIFA_LOCAL_FACTOR = 0.15;

// ===========================================================================
// UTILIDADES DE FECHA
// ===========================================================================

function isoWeek(date: Date): string {
  const tmp = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

function dateRange(startDate: string, endDate: string): Date[] {
  const dates: Date[] = [];
  const cur = new Date(startDate + 'T00:00:00Z');
  const end = new Date(endDate + 'T00:00:00Z');
  while (cur <= end) { dates.push(new Date(cur)); cur.setUTCDate(cur.getUTCDate() + 1); }
  return dates;
}

function formatDate(d: Date): string { return d.toISOString().slice(0, 10); }

function dayChar(d: Date): string { return 'SDLMXJV'[d.getUTCDay()] ?? 'L'; }

const ORDINAL = ['', 'primer', 'segundo', 'tercer', 'cuarto'];

function bloqueName(horarioInicio: string, bloqueNum: number): string {
  const [hStr, mStr] = horarioInicio.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const bloqueMins = m + (bloqueNum - 1) * 30;
  const bloqueH = h + Math.floor(bloqueMins / 60);
  const bloqueM = bloqueMins % 60;
  const timeStr = `${String(bloqueH % 24).padStart(2, '0')}:${String(bloqueM).padStart(2, '0')}`;
  return `Corte de las ${timeStr}, ${ORDINAL[bloqueNum] ?? String(bloqueNum)} bloque`;
}

function weekNumFromISO(isoWeek_: string): number {
  return parseInt(isoWeek_.split('-W')[1], 10);
}

// ===========================================================================
// OCUPACIÓN SINTÉTICA
// ===========================================================================

const OCC_BASE: Record<string, number> = {
  'PRG-01':0.40,'PRG-02':0.55,'PRG-03':0.55,'PRG-04':0.60,
  'PRG-05':0.65,'PRG-06':0.70,'PRG-07':0.65,'PRG-08':0.75,
  'PRG-09':0.78,'PRG-10':0.88,'PRG-11':0.90,'PRG-12':0.95,
  'PRG-13':0.72,'PRG-14':0.38,
};

function seasonalFactor(weekNum: number): number {
  if (weekNum <= 2)  return 0.60;
  if (weekNum <= 4)  return 0.65;
  if (weekNum <= 8)  return 0.72;
  if (weekNum <= 10) return 0.75;
  if (weekNum <= 13) return 0.80;
  if (weekNum <= 17) return 0.85;
  if (weekNum <= 20) return 0.88;
  return 0.85;
}

// ===========================================================================
// ANUNCIANTES
// ===========================================================================

interface AnuncianteSeed { id: string; nombre: string; tier: number; categoria: string; cobertura: 'nacional'|'local'; }

const ANUNCIANTES: AnuncianteSeed[] = [
  { id:'cta-anun-001', nombre:'Procter & Gamble',         tier:1, categoria:'CPG',             cobertura:'nacional' },
  { id:'cta-anun-002', nombre:'Genomma Lab',               tier:1, categoria:'Farma OTC',       cobertura:'nacional' },
  { id:'cta-anun-003', nombre:'Unilever',                  tier:1, categoria:'CPG',             cobertura:'nacional' },
  { id:'cta-anun-004', nombre:'Organización Bimbo',        tier:1, categoria:'Alimentos',       cobertura:'nacional' },
  { id:'cta-anun-005', nombre:'Coca-Cola',                 tier:1, categoria:'Bebidas',         cobertura:'nacional' },
  { id:'cta-anun-006', nombre:'Kimberly-Clark',            tier:2, categoria:'Higiene',         cobertura:'nacional' },
  { id:'cta-anun-007', nombre:'Nestlé',                    tier:2, categoria:'Alimentos',       cobertura:'nacional' },
  { id:'cta-anun-008', nombre:'Walmart de México',         tier:2, categoria:'Retail',          cobertura:'nacional' },
  { id:'cta-anun-009', nombre:'Cervecería Cuauhtémoc',     tier:2, categoria:'Cerveza',         cobertura:'nacional' },
  { id:'cta-anun-010', nombre:'BBVA México',               tier:2, categoria:'Financiero',      cobertura:'nacional' },
  { id:'cta-anun-011', nombre:'Telcel / América Móvil',    tier:2, categoria:'Telecom',         cobertura:'nacional' },
  { id:'cta-anun-012', nombre:'AT&T México',               tier:2, categoria:'Telecom',         cobertura:'nacional' },
  { id:'cta-anun-013', nombre:'Grupo Bayer',               tier:2, categoria:'Farma',           cobertura:'nacional' },
  { id:'cta-anun-014', nombre:'Grupo Modelo / AB InBev',   tier:2, categoria:'Cerveza',         cobertura:'nacional' },
  { id:'cta-anun-015', nombre:'Grupo Coppel',              tier:2, categoria:'Retail/Fin',      cobertura:'nacional' },
  { id:'cta-anun-016', nombre:'Grupo Lala',                tier:3, categoria:'Lácteos',         cobertura:'nacional' },
  { id:'cta-anun-017', nombre:'Alpura',                    tier:3, categoria:'Lácteos',         cobertura:'nacional' },
  { id:'cta-anun-018', nombre:"L'Oréal México",            tier:3, categoria:'Belleza',         cobertura:'nacional' },
  { id:'cta-anun-019', nombre:'Colgate-Palmolive',         tier:3, categoria:'Higiene/Hogar',   cobertura:'nacional' },
  { id:'cta-anun-020', nombre:'Volkswagen México',         tier:3, categoria:'Automotriz',      cobertura:'nacional' },
  { id:'cta-anun-021', nombre:'General Motors México',     tier:3, categoria:'Automotriz',      cobertura:'nacional' },
  { id:'cta-anun-022', nombre:'Nissan México',             tier:3, categoria:'Automotriz',      cobertura:'nacional' },
  { id:'cta-anun-023', nombre:'Banamex / Citibanamex',     tier:3, categoria:'Financiero',      cobertura:'nacional' },
  { id:'cta-anun-024', nombre:'HSBC México',               tier:3, categoria:'Financiero',      cobertura:'nacional' },
  { id:'cta-anun-025', nombre:'Santander México',          tier:3, categoria:'Financiero',      cobertura:'nacional' },
  { id:'cta-anun-026', nombre:'Honda México',              tier:3, categoria:'Automotriz',      cobertura:'nacional' },
  { id:'cta-anun-027', nombre:'Toyota México',             tier:3, categoria:'Automotriz',      cobertura:'nacional' },
  { id:'cta-anun-028', nombre:'Soriana',                   tier:3, categoria:'Retail',          cobertura:'nacional' },
  { id:'cta-anun-029', nombre:'Chedraui',                  tier:3, categoria:'Retail',          cobertura:'nacional' },
  { id:'cta-anun-030', nombre:'Liverpool',                 tier:3, categoria:'Retail premium',  cobertura:'nacional' },
  { id:'cta-anun-031', nombre:'Grupo Financiero Multiva',  tier:3, categoria:'Financiero',      cobertura:'nacional' },
  { id:'cta-anun-032', nombre:'PepsiCo',                   tier:4, categoria:'CPG/Botanas',     cobertura:'nacional' },
  { id:'cta-anun-033', nombre:'Johnson & Johnson',         tier:4, categoria:'Salud/Higiene',   cobertura:'nacional' },
  { id:'cta-anun-034', nombre:'Reckitt Benckiser',         tier:4, categoria:'Salud/Hogar',     cobertura:'nacional' },
  { id:'cta-anun-035', nombre:'Hospitales Ángeles',        tier:4, categoria:'Salud privada',   cobertura:'nacional' },
  { id:'cta-anun-036', nombre:'Hoteles Camino Real',       tier:4, categoria:'Hospitalidad',    cobertura:'nacional' },
  { id:'cta-anun-037', nombre:'Heineken México',           tier:4, categoria:'Cerveza premium', cobertura:'nacional' },
  { id:'cta-anun-038', nombre:'Seguros Monterrey NYL',     tier:4, categoria:'Seguros',         cobertura:'nacional' },
  { id:'cta-anun-039', nombre:'GNP Seguros',               tier:4, categoria:'Seguros',         cobertura:'nacional' },
  { id:'cta-anun-040', nombre:'Elektra / Banco Azteca',    tier:4, categoria:'Retail/Fin',      cobertura:'nacional' },
  { id:'cta-anun-041', nombre:'Cinépolis',                 tier:4, categoria:'Entretenimiento', cobertura:'nacional' },
  { id:'cta-anun-042', nombre:'Spotify',                   tier:4, categoria:'Tech/Streaming',  cobertura:'nacional' },
  { id:'cta-anun-043', nombre:'Uber / Uber Eats',          tier:4, categoria:'Tech/Apps',       cobertura:'nacional' },
  { id:'cta-anun-044', nombre:'Aeromexico',                tier:4, categoria:'Aerolínea',       cobertura:'nacional' },
  { id:'cta-anun-045', nombre:'Volaris',                   tier:4, categoria:'Aerolínea',       cobertura:'nacional' },
  { id:'cta-anun-046', nombre:'PEMEX',                     tier:4, categoria:'Gobierno/Energía',cobertura:'nacional' },
  { id:'cta-anun-047', nombre:'SEP / Gobierno Federal',    tier:4, categoria:'Gobierno',        cobertura:'nacional' },
  { id:'cta-anun-048', nombre:'Cruz Roja Mexicana',        tier:4, categoria:'ONG/Salud',       cobertura:'nacional' },
  { id:'cta-anun-049', nombre:'Telmex / Infinitum',        tier:4, categoria:'Telecom/Internet',cobertura:'nacional' },
  { id:'cta-anun-050', nombre:'Grupo Herdez',              tier:4, categoria:'Alimentos',       cobertura:'nacional' },
  // Locales
  { id:'cta-loc-001', nombre:'OXXO CDMX',                  tier:3, categoria:'Retail Local',    cobertura:'local' },
  { id:'cta-loc-002', nombre:'Farmacias del Ahorro CDMX',  tier:3, categoria:'Farma Local',     cobertura:'local' },
  { id:'cta-loc-003', nombre:'Gobierno CDMX',              tier:4, categoria:'Gobierno Local',  cobertura:'local' },
  { id:'cta-loc-004', nombre:'Mercado Libre MX',           tier:3, categoria:'eCommerce',       cobertura:'local' },
  { id:'cta-loc-005', nombre:'Suburbia GDL',               tier:3, categoria:'Retail Local',    cobertura:'local' },
  { id:'cta-loc-006', nombre:'Gobierno Jalisco',           tier:4, categoria:'Gobierno Local',  cobertura:'local' },
  { id:'cta-loc-007', nombre:'FEMSA GDL',                  tier:3, categoria:'Bebidas Local',   cobertura:'local' },
  { id:'cta-loc-008', nombre:'Gobierno Nuevo León',        tier:4, categoria:'Gobierno Local',  cobertura:'local' },
  { id:'cta-loc-009', nombre:'CEMEX MTY',                  tier:3, categoria:'Industrial',      cobertura:'local' },
  { id:'cta-loc-010', nombre:'Farmacias Benavides MTY',    tier:3, categoria:'Farma Local',     cobertura:'local' },
  { id:'cta-loc-011', nombre:'Plaza Galerías CDMX',        tier:4, categoria:'Retail Local',    cobertura:'local' },
  { id:'cta-loc-012', nombre:'Hospital Español CDMX',      tier:4, categoria:'Salud Local',     cobertura:'local' },
  { id:'cta-loc-013', nombre:'ITESO GDL',                  tier:4, categoria:'Educación',       cobertura:'local' },
  { id:'cta-loc-014', nombre:'TecMilenio MTY',             tier:4, categoria:'Educación',       cobertura:'local' },
  { id:'cta-loc-015', nombre:'Construrama MTY',            tier:4, categoria:'Construcción',    cobertura:'local' },
];

// ===========================================================================
// PAQUETES
// ===========================================================================

const PAQUETES = [
  { id:'PKG-AMA',     nombre:'Paquete Ama de Casa',      descripcion:'Revista matutina + PI mención + spots vespertinos',              spots_semana:12, pi_tipo:'PI-MEN', pi_unidades_semana:2, precio_mes:1_200_000, categoria_ideal:'CPG, Belleza, Hogar',               programa_ids:JSON.stringify(['PRG-02','PRG-03','PRG-06']) },
  { id:'PKG-NOT',     nombre:'Paquete Noticiero',         descripcion:'Noticiero Estelar + Prime apertura + PI credibilidad',           spots_semana:8,  pi_tipo:'PI-ENT', pi_unidades_semana:1, precio_mes:1_800_000, categoria_ideal:'Financiero, Telecom, Gobierno',       programa_ids:JSON.stringify(['PRG-10','PRG-11']) },
  { id:'PKG-TELV',    nombre:'Paquete Telenovela Prime',  descripcion:'Telenovela Prime + spots + PI integración trama',               spots_semana:10, pi_tipo:'PI-INT', pi_unidades_semana:1, precio_mes:3_200_000, categoria_ideal:'CPG, Belleza, Moda, Lácteos',          programa_ids:JSON.stringify(['PRG-12','PRG-06']) },
  { id:'PKG-DEP',     nombre:'Paquete Deportes',          descripcion:'Fútbol + Deportes + súpers + spots',                           spots_semana:12, pi_tipo:'PI-SUP', pi_unidades_semana:4, precio_mes:2_100_000, categoria_ideal:'Cerveza, Automotriz, Telecom, Botanas', programa_ids:JSON.stringify(['PRG-08','PRG-09']) },
  { id:'PKG-360',     nombre:'Paquete 360° Imagen',       descripcion:'Cobertura total: Prime + Noticiero + Deportes + PI',           spots_semana:25, pi_tipo:'PI-PAT', pi_unidades_semana:3, precio_mes:5_500_000, categoria_ideal:'Tier 1 y 2 all verticals',             programa_ids:JSON.stringify(['PRG-10','PRG-12','PRG-08']) },
  { id:'PKG-DIG',     nombre:'Paquete Digital Integrado', descripcion:'TV + Digital CTV + menciones',                                 spots_semana:15, pi_tipo:'PI-CAP', pi_unidades_semana:2, precio_mes:2_800_000, categoria_ideal:'Tech, Streaming, eCommerce',           programa_ids:JSON.stringify(['PRG-12','PRG-13']) },
  { id:'PKG-GOB',     nombre:'Paquete Gobierno',          descripcion:'Noticiero + revista + cápsulas informativas',                  spots_semana:10, pi_tipo:'PI-CAP', pi_unidades_semana:3, precio_mes:1_600_000, categoria_ideal:'Gobierno, ONG, Educación',             programa_ids:JSON.stringify(['PRG-04','PRG-10','PRG-14']) },
  { id:'PKG-UPFRONT', nombre:'Paquete Upfront Anual',     descripcion:'Contrato anual multi-franja — precio preferencial',            spots_semana:40, pi_tipo:'PI-PAT', pi_unidades_semana:5, precio_mes:18_000_000,categoria_ideal:'Tier 1 — presupuesto anual',           programa_ids:JSON.stringify(['PRG-02','PRG-06','PRG-10','PRG-12']) },
];

// ===========================================================================
// SEED DE SPOTS
// ===========================================================================

type SpotRow = {
  id: string; fecha: string; semana_iso: string; programa_id: string;
  bloque_num: number; bloque_nombre: string; posicion: number;
  cobertura: string; plaza_id: string | null; duracion_seg: number;
  tarifa_carta: number; orden_compra_id: null; anunciante_id: null; categoria_bloque: null;
};

function buildSpots(dates: Date[]): SpotRow[] {
  const rows: SpotRow[] = [];

  for (const date of dates) {
    const fechaStr = formatDate(date);
    const semana = isoWeek(date);
    const dayC = dayChar(date);

    for (const prg of PROGRAMAS) {
      if (!prg.dias_semana.includes(dayC)) continue;

      const tarifaNac = TARIFA_NACIONAL[prg.id] ?? 30_000;
      const tarifaLoc = tarifaNac * TARIFA_LOCAL_FACTOR;

      // Nacional: total spots/hora / num_bloques
      const spotsPerBloqueNac = Math.round((prg.min_comerciales_hora * 60) / 20 / prg.num_bloques);
      // Local: 4 unidades/hora / num_bloques ≈ 1-2 por bloque
      const spotsPerBloqueLocal = Math.max(1, Math.round(4 / prg.num_bloques));

      for (let b = 1; b <= prg.num_bloques; b++) {
        const bn = bloqueName(prg.horario_inicio, b);

        // Spots nacionales
        for (let pos = 1; pos <= spotsPerBloqueNac; pos++) {
          rows.push({ id:uuidv4(), fecha:fechaStr, semana_iso:semana, programa_id:prg.id,
            bloque_num:b, bloque_nombre:bn, posicion:pos, cobertura:'nacional', plaza_id:null,
            duracion_seg:20, tarifa_carta:tarifaNac, orden_compra_id:null, anunciante_id:null, categoria_bloque:null });
        }

        // Spots locales — 1 por bloque por plaza
        for (const plaza of PLAZAS) {
          for (let pos = 1; pos <= spotsPerBloqueLocal; pos++) {
            rows.push({ id:uuidv4(), fecha:fechaStr, semana_iso:semana, programa_id:prg.id,
              bloque_num:b, bloque_nombre:bn, posicion:pos, cobertura:'local', plaza_id:plaza.id,
              duracion_seg:20, tarifa_carta:tarifaLoc, orden_compra_id:null, anunciante_id:null, categoria_bloque:null });
          }
        }
      }
    }
  }

  return rows;
}

// ===========================================================================
// OCUPACIÓN
// ===========================================================================

function assignOccupancy(): void {
  const spots = db.prepare(`
    SELECT id, semana_iso, programa_id, tarifa_carta
    FROM inventario_spot WHERE cobertura = 'nacional'
    ORDER BY semana_iso, programa_id, bloque_num, posicion
  `).all() as Array<{ id: string; semana_iso: string; programa_id: string; tarifa_carta: number; }>;

  const insertOC = db.prepare(`
    INSERT OR IGNORE INTO orden_compra
      (id, anunciante_id, semana_inicio, semana_fin, tipo, monto_total, descuento_pct, estado, agencia)
    VALUES (@id, @anunciante_id, @semana_inicio, @semana_fin, @tipo, @monto_total, @descuento_pct, @estado, @agencia)
  `);
  const updateSpot = db.prepare(`
    UPDATE inventario_spot SET orden_compra_id=@oc_id, anunciante_id=@anunciante_id WHERE id=@spot_id
  `);
  const insertOCS = db.prepare(`
    INSERT OR IGNORE INTO orden_compra_spot (orden_compra_id, spot_id) VALUES (?, ?)
  `);

  // Agrupar por semana+programa
  const byKey = new Map<string, typeof spots>();
  for (const s of spots) {
    const k = `${s.semana_iso}|${s.programa_id}`;
    if (!byKey.has(k)) byKey.set(k, []);
    byKey.get(k)!.push(s);
  }

  let ocCount = 0; let spotsAssigned = 0;

  const batch = db.transaction((entries: Array<[string, typeof spots]>) => {
    for (const [key, group] of entries) {
      const [weekISO, prgId] = key.split('|');
      const weekNum = weekNumFromISO(weekISO);
      const occ = seasonalFactor(weekNum) * (OCC_BASE[prgId] ?? 0.70);
      const toSell = Math.floor(group.length * occ);

      const eligible = ANUNCIANTES.filter(a => {
        if (a.cobertura !== 'nacional') return false;
        if (prgId === 'PRG-12' || prgId === 'PRG-11') return a.tier <= 2;
        if (prgId === 'PRG-10' || prgId === 'PRG-04') return !['Cerveza','Cerveza premium'].includes(a.categoria);
        if (prgId === 'PRG-08' || prgId === 'PRG-09') return ['Cerveza','Cerveza premium','Automotriz','Telecom','CPG/Botanas'].includes(a.categoria);
        return true;
      });
      if (eligible.length === 0) continue;

      const shuffled = [...group].sort(() => Math.random() - 0.5);
      let sold = 0; let aIdx = 0;

      while (sold < toSell && aIdx < eligible.length * 3) {
        const anun = eligible[aIdx % eligible.length]; aIdx++;
        const qty = Math.min(Math.max(2, Math.floor(toSell / eligible.length)), toSell - sold, 6);
        if (qty <= 0) break;
        const batch_ = shuffled.slice(sold, sold + qty);
        if (batch_.length === 0) break;

        const ocId = `OC-${weekISO}-${prgId}-${anun.id}`;
        const monto = batch_.reduce((s, sp) => s + sp.tarifa_carta, 0) * 0.85;
        insertOC.run({ id:ocId, anunciante_id:anun.id, semana_inicio:weekISO, semana_fin:weekISO,
          tipo:'spoteo', monto_total:monto, descuento_pct:15, estado:'facturada',
          agencia: anun.tier <= 2 ? 'GroupM / Mindshare' : null });
        for (const sp of batch_) {
          updateSpot.run({ oc_id:ocId, anunciante_id:anun.id, spot_id:sp.id });
          insertOCS.run(ocId, sp.id);
        }
        sold += batch_.length; spotsAssigned += batch_.length; ocCount++;
      }
    }
  });

  batch(Array.from(byKey.entries()));
  console.log(`✅ Ocupación: ${spotsAssigned.toLocaleString()} spots asignados, ${ocCount} OCs`);
}

// ===========================================================================
// MAIN
// ===========================================================================

function main() {
  console.log('🚀 Seed Inventario TV Abierta — iniciando...\n');

  createInventarioSchema();

  // Plazas
  const insPlaza = db.prepare(`INSERT OR IGNORE INTO plaza (id, nombre, estado) VALUES (@id, @nombre, @estado)`);
  for (const p of PLAZAS) insPlaza.run(p);
  console.log(`✅ Plazas: ${PLAZAS.length}`);

  // Programas
  const insPrg = db.prepare(`
    INSERT OR IGNORE INTO programa
      (id, nombre, franja_label, horario_inicio, horario_fin, genero, audiencia_primaria, min_comerciales_hora, num_bloques, dias_semana)
    VALUES (@id, @nombre, @franja_label, @horario_inicio, @horario_fin, @genero, @audiencia_primaria, @min_comerciales_hora, @num_bloques, @dias_semana)
  `);
  for (const p of PROGRAMAS) insPrg.run(p);
  console.log(`✅ Programas: ${PROGRAMAS.length}`);

  // Paquetes
  const insPkg = db.prepare(`
    INSERT OR IGNORE INTO paquete_template
      (id, nombre, descripcion, spots_semana, pi_tipo, pi_unidades_semana, precio_mes, categoria_ideal, programa_ids)
    VALUES (@id, @nombre, @descripcion, @spots_semana, @pi_tipo, @pi_unidades_semana, @precio_mes, @categoria_ideal, @programa_ids)
  `);
  for (const p of PAQUETES) insPkg.run(p);
  console.log(`✅ Paquetes: ${PAQUETES.length}`);

  // Anunciantes (upsert en tabla cuenta del CRM)
  const insCta = db.prepare(`
    INSERT OR IGNORE INTO cuenta (id, nombre, tipo, industria, tier, tamano, estado)
    VALUES (@id, @nombre, 'anunciante', @categoria, @tier, 'grande', 'activa')
  `);
  let ctaOk = 0;
  for (const a of ANUNCIANTES) {
    try { insCta.run({ id:a.id, nombre:a.nombre, categoria:a.categoria, tier:a.tier }); ctaOk++; }
    catch { /* ya existe */ }
  }
  console.log(`✅ Anunciantes: ${ctaOk} insertados (${ANUNCIANTES.length - ctaOk} ya existían)`);

  // Spots W01–W20 2026
  const dates = dateRange('2026-01-05', '2026-05-17');
  console.log(`\n⚙️  Generando spots para ${dates.length} días (W01–W20 2026)...`);

  const insSpot = db.prepare(`
    INSERT OR IGNORE INTO inventario_spot
      (id, fecha, semana_iso, programa_id, bloque_num, bloque_nombre, posicion,
       cobertura, plaza_id, duracion_seg, tarifa_carta, orden_compra_id, anunciante_id, categoria_bloque)
    VALUES
      (@id, @fecha, @semana_iso, @programa_id, @bloque_num, @bloque_nombre, @posicion,
       @cobertura, @plaza_id, @duracion_seg, @tarifa_carta, @orden_compra_id, @anunciante_id, @categoria_bloque)
  `);

  const insertBatch = db.transaction((rows: SpotRow[]) => {
    for (const r of rows) insSpot.run(r as Parameters<typeof insSpot.run>[0]);
    return rows.length;
  });

  // Procesa en chunks para no saturar memoria
  const CHUNK = 5000;
  let totalSpots = 0;
  const allSpots = buildSpots(dates);
  for (let i = 0; i < allSpots.length; i += CHUNK) {
    totalSpots += insertBatch(allSpots.slice(i, i + CHUNK));
    if (i % 50000 === 0 && i > 0) process.stdout.write(`  ... ${totalSpots.toLocaleString()} spots\r`);
  }
  console.log(`✅ Spots generados: ${totalSpots.toLocaleString()}                 `);

  // Ocupación
  console.log('\n⚙️  Asignando ocupación sintética...');
  assignOccupancy();

  // Resumen
  const counts = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM inventario_spot) as spots,
      (SELECT COUNT(*) FROM inventario_spot WHERE orden_compra_id IS NOT NULL) as spots_vendidos,
      (SELECT COUNT(*) FROM inventario_spot WHERE cobertura='nacional') as spots_nac,
      (SELECT COUNT(*) FROM inventario_spot WHERE cobertura='local') as spots_loc,
      (SELECT COUNT(*) FROM orden_compra) as ordenes,
      (SELECT COUNT(*) FROM programa) as programas,
      (SELECT COUNT(*) FROM paquete_template) as paquetes
  `).get() as Record<string, number>;

  console.log('\n📊 Resumen:');
  console.log(`   Programas:          ${counts.programas}`);
  console.log(`   Paquetes template:  ${counts.paquetes}`);
  console.log(`   Spots totales:      ${counts.spots.toLocaleString()}`);
  console.log(`     └ Nacionales:     ${counts.spots_nac.toLocaleString()}`);
  console.log(`     └ Locales:        ${counts.spots_loc.toLocaleString()}`);
  const occ = counts.spots > 0 ? Math.round(counts.spots_vendidos / counts.spots * 100) : 0;
  console.log(`   Spots vendidos:     ${counts.spots_vendidos.toLocaleString()} (${occ}% ocupación)`);
  console.log(`   Órdenes de compra:  ${counts.ordenes.toLocaleString()}`);
  console.log('\n✅ Seed completado.');
}

main();
