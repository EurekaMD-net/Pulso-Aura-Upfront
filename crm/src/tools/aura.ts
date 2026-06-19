/**
 * Aura KB tool — buscar_inteligencia_marca.
 *
 * Pulls a brand's curated Aura intelligence (diagnosis, buyer personas, campaigns, social,
 * opportunity theses, closing material) from the aura-kb corpus, governed by the firewall
 * (brand_key) + RBAC (the caller's role) enforced in searchAuraKb. Resolves the seller's
 * free-text brand to a brand_key first; if ambiguous it returns candidate brands so the agent
 * can ask which one, rather than guessing.
 */

import { resolveBrandKey } from "../aura-brand.js";
import { searchAuraKb, radiografiaForBrand } from "../doc-sync.js";
import {
  resolveAnunciante,
  radiografiaForAnunciante,
  committeeForAnunciante,
} from "../anunciante.js";
import type { ToolContext } from "./index.js";

export async function buscar_inteligencia_marca(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const marca = typeof args.marca === "string" ? args.marca.trim() : "";
  const consulta =
    typeof args.consulta === "string" ? args.consulta.trim() : "";
  if (!marca) return JSON.stringify({ error: 'Falta el parámetro "marca".' });
  if (!consulta)
    return JSON.stringify({ error: 'Falta el parámetro "consulta".' });

  const res = resolveBrandKey(marca);

  if (!res.brandKey) {
    if (res.candidates.length === 0) {
      return JSON.stringify({
        marca,
        encontrada: false,
        resultados: [],
        mensaje: `No hay inteligencia de marca para "${marca}" en el KB de Aura.`,
      });
    }
    // Ambiguous — return options so the agent asks the seller which brand.
    return JSON.stringify({
      marca,
      ambigua: true,
      mensaje: `"${marca}" coincide con varias marcas. Pregunta al vendedor a cuál se refiere.`,
      opciones: res.candidates.slice(0, 8).map((c) => ({
        marca: c.marca,
        brand_key: c.brandKey,
        hallazgos: c.findings,
      })),
    });
  }

  const limite = Math.min(Math.max(Number(args.limite) || 6, 1), 20);
  const hits = await searchAuraKb(consulta, {
    brand: res.brandKey,
    role: ctx.rol,
    limite,
  });

  return JSON.stringify({
    marca,
    brand_key: res.brandKey,
    encontrada: true,
    resultados: hits.map((h) => ({
      titulo: h.titulo,
      cuerpo: h.cuerpo,
      fragmento: h.fragmento,
      similitud: h.similitud,
    })),
    mensaje:
      hits.length === 0
        ? `Sin hallazgos para "${consulta}" en ${res.brandKey} a tu nivel de acceso.`
        : undefined,
  });
}

/**
 * armar_radiografia_marca — the ARMAGEDDON read-path (P3.2).
 *
 * Pulls a brand's four diagnostic cuerpos (diagnóstico 9 fuentes, buyer personas, campañas y
 * temporalidades, inteligencia social) complete, so the agent can run the radiografía (campaign-
 * portfolio diagnosis via the 6 ROAS factors) and the preventa-2027 opportunity thesis. Resolves
 * the free-text brand first (ambiguous → options, unknown → encontrada:false); a missing cuerpo is
 * reported in `faltantes` so the agent says so instead of inventing it. Firewall + RBAC inherited.
 */
export async function armar_radiografia_marca(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const marca = typeof args.marca === "string" ? args.marca.trim() : "";
  if (!marca) return JSON.stringify({ error: 'Falta el parámetro "marca".' });

  const res = resolveBrandKey(marca);

  if (!res.brandKey) {
    if (res.candidates.length === 0) {
      return JSON.stringify({
        marca,
        encontrada: false,
        dimensiones: [],
        mensaje: `No hay inteligencia de marca para "${marca}" en el KB de Aura.`,
      });
    }
    // Ambiguous — return options so the agent asks the seller which brand.
    return JSON.stringify({
      marca,
      ambigua: true,
      mensaje: `"${marca}" coincide con varias marcas. Pregunta al vendedor a cuál se refiere.`,
      opciones: res.candidates.slice(0, 8).map((c) => ({
        marca: c.marca,
        brand_key: c.brandKey,
        hallazgos: c.findings,
      })),
    });
  }

  const radiografia = radiografiaForBrand(res.brandKey, ctx.rol);

  return JSON.stringify({
    marca,
    brand_key: res.brandKey,
    encontrada: radiografia.dimensiones.length > 0,
    dimensiones: radiografia.dimensiones.map((d) => ({
      cuerpo: d.cuerpo,
      titulo: d.titulo,
      estabilidad: d.estabilidad,
      contenido: d.contenido,
    })),
    faltantes: radiografia.faltantes,
    mensaje:
      radiografia.dimensiones.length === 0
        ? `"${marca}" no tiene cuerpos de diagnóstico accesibles a tu nivel; no hay radiografía que armar.`
        : radiografia.faltantes.length > 0
          ? `Radiografía parcial: faltan ${radiografia.faltantes.join(", ")}. Trabaja con lo disponible y dilo abiertamente.`
          : undefined,
  });
}

/**
 * armar_radiografia_anunciante — the PORTFOLIO rollup (P3.5).
 *
 * The Upfront deal is with the ANUNCIANTE across its whole brand portfolio. Resolves the
 * advertiser, lists ALL its brands, and returns a bounded per-brand summary (which cuerpos exist
 * + a short resumen) so the agent can assert portfolio-level needs and decide which brands to
 * deep-dive with armar_radiografia_marca. Ambiguous → options; unknown → encontrada:false.
 */
export async function armar_radiografia_anunciante(
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<string> {
  const anunciante =
    typeof args.anunciante === "string" ? args.anunciante.trim() : "";
  if (!anunciante)
    return JSON.stringify({ error: 'Falta el parámetro "anunciante".' });

  const res = resolveAnunciante(anunciante);
  if (!res.anunciante) {
    if (res.candidates.length === 0) {
      return JSON.stringify({
        anunciante,
        encontrada: false,
        marcas: [],
        mensaje: `No hay anunciante "${anunciante}" en el mapa de marcas de Aura.`,
      });
    }
    return JSON.stringify({
      anunciante,
      ambigua: true,
      mensaje: `"${anunciante}" coincide con varios anunciantes/grupos. Pregunta a cuál se refiere.`,
      opciones: res.candidates.slice(0, 10).map((c) => ({
        anunciante: c.anunciante,
        grupo: c.grupo,
        marcas: c.marcas,
      })),
    });
  }

  const port = radiografiaForAnunciante(anunciante, ctx.rol);
  if (!port) {
    return JSON.stringify({
      anunciante,
      encontrada: false,
      marcas: [],
      mensaje: `No se pudo armar el portafolio de "${anunciante}".`,
    });
  }

  return JSON.stringify({
    anunciante: port.anunciante,
    grupo: port.grupo,
    encontrada: true,
    totales: port.totales,
    marcas: port.marcas.map((m) => ({
      marca: m.marca,
      brand_key: m.brand_key,
      cuerpos_disponibles: m.cuerpos_disponibles,
      faltantes: m.faltantes,
      resumen: m.resumen,
    })),
    mensaje:
      port.totales.marcas === 0
        ? `"${port.anunciante}" no tiene marcas con inteligencia en el KB.`
        : `Portafolio de ${port.totales.marcas} marca(s). Sintetiza la necesidad GLOBAL del anunciante (no marca por marca) y profundiza con armar_radiografia_marca donde haga falta.`,
  });
}

/**
 * mapa_poder_anunciante — STAKEHOLDERS over the REAL committee (P3.5).
 *
 * Returns the anunciante's CRM cuenta(s) and their contactos (comprador/planeador/decisor +
 * seniority) — the actual people to ponderar and work, instead of a generic method. When no
 * committee is on file (`sin_comite`), the agent coaches the power map from method and asks the rep.
 */
export async function mapa_poder_anunciante(
  args: Record<string, unknown>,
  _ctx: ToolContext,
): Promise<string> {
  const anunciante =
    typeof args.anunciante === "string" ? args.anunciante.trim() : "";
  if (!anunciante)
    return JSON.stringify({ error: 'Falta el parámetro "anunciante".' });

  const res = resolveAnunciante(anunciante);
  if (!res.anunciante) {
    if (res.candidates.length === 0) {
      return JSON.stringify({
        anunciante,
        encontrada: false,
        mensaje: `No hay anunciante "${anunciante}" en el mapa de marcas de Aura.`,
      });
    }
    return JSON.stringify({
      anunciante,
      ambigua: true,
      mensaje: `"${anunciante}" coincide con varios anunciantes/grupos. Pregunta a cuál se refiere.`,
      opciones: res.candidates.slice(0, 10).map((c) => ({
        anunciante: c.anunciante,
        grupo: c.grupo,
        marcas: c.marcas,
      })),
    });
  }

  const comite = committeeForAnunciante(anunciante)!;
  return JSON.stringify({
    anunciante: comite.anunciante,
    encontrada: true,
    sin_comite: comite.sin_comite,
    cuentas: comite.cuentas.map((c) => ({
      cuenta: c.cuenta,
      tipo: c.tipo,
      contactos: c.contactos,
    })),
    mensaje: comite.sin_comite
      ? "No hay comité registrado en el CRM para este anunciante. Arma el mapa de poder con el método (ponderar a los 3 que deciden) y pregunta al vendedor por los nombres y cargos."
      : "Usa estos contactos como base del mapa de poder: pondera a los 3 que deciden y arma la ficha por persona. Recuerda: material interno de guerra, jamás al cliente.",
  });
}
