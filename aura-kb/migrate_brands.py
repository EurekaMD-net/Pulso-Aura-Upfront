#!/usr/bin/env python3
"""
migrate_brands.py v2 — Convierte dosieres de marca (.docx) al KB AURA.
- Extracción de marca data-driven (1-3 palabras) con stoplist de categorías (frecuencia + lexicón).
- Dedup por MARCA COMPLETA. Año: 2026 gana; a igualdad se queda uno y reporta el descartado.
- Genera REGISTRO_MARCAS.md y escribe knowledge/brand-intelligence/<marca>/<cuerpo>.md
Uso: python3 migrate_brands.py <origen> <kb_salida> --tipo <cuerpo>
"""
import os, re, sys, datetime, unicodedata, collections
from markitdown import MarkItDown

TYPE_META = {
    "diagnostico_9fuentes":    dict(short="diagnostico-9fuentes",    titulo="Diagnóstico 9 Fuentes",  estabilidad="estable", sensibilidad="baja", rol="estrategia_research", fuente="brandmap"),
    "campanas_temporalidades": dict(short="campanas-temporalidades", titulo="Campañas y Temporalidades", estabilidad="ciclica", sensibilidad="baja", rol="comercial_kam",       fuente="campaignmap"),
    "buyer_personas":          dict(short="buyer-personas",          titulo="Buyer Personas",         estabilidad="estable", sensibilidad="baja", rol="estrategia_research", fuente="buyermap"),
    "inteligencia_social":     dict(short="inteligencia-social",     titulo="Inteligencia Social",    estabilidad="caduca",  sensibilidad="baja", rol="estrategia_research", fuente="socialmap"),
}
CONNECTORS = {"de","del","la","las","los","y","para","con","el","en"}
TYPE_WORDS = {"brand","mapping","buyer","persona","personas","campañas","campanas",
              "temporalidades","inteligencia","social","media","intelligence","sia",
              "diagnostico","9fuentes","fuentes","9",
              "mexico","mx","categoria","perfilamiento"}
YEAR_TOKENS = {"2024","2025","2026","2027","2028","24","25","26","27","28"}
SEED_CAT = set("""detergente galletas galleta condones preservativos desodorantes desinfectante
desinfectantes cereales barras agua aguas tarjetas credito servicio telefonia movil premium
travel tecnologia retailer ecommerce video streaming services pago sistemas multicategoria
ambientadores antihistaminicos aerolineas farmaceuticos gastrointestinales femcare botana
yogurt vegetales calzado deportivo delivery milla ultima natural frescas lab sexual chocolate
refrescos refresco cervezas cerveza snacks snack bebidas bebida alimentos alimento dulces dulce
salados salado salada autos auto ropa hogar salud cuidado personal higiene skincare hair care
mascotas otc financiero chino fast food qsr online banco seguros automotriz lacteos lacteo
farmacias farmacia jabon shampoo panales cafe jugos jugo limpieza pan panaderia
golosinas confiteria vinos licores tequila whisky energizante energizantes isotonica isotonicas
medicamentos analgesicos vitaminas suplementos belleza cosmeticos maquillaje fragancias perfumes
electrodomesticos electronica telecom fintech pagos retail moda accesorios juguetes herramientas
construccion pintura ferreteria muebles colchones llantas neumaticos gasolina combustible
restaurantes cafeterias heladerias panaderias lentes opticas viajes turismo hoteles""".split())

def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")
def slugify(s):
    s = re.sub(r"[^a-z0-9]+", "-", strip_accents(s).lower()).strip("-")
    return s or "marca"
def decode_uescapes(s):
    return re.sub(r"#U([0-9A-Fa-f]{4})", lambda m: chr(int(m.group(1), 16)), s)
def tokens_no_mx(f):
    stem = re.sub(r"\.docx$", "", f, flags=re.I)
    stem = decode_uescapes(stem)
    stem = re.sub(r"[\s_,]+[Mm][Xx]$", "", stem)
    return [t for t in re.split(r"[\s_,]+", stem) if t]
def build_stoplist(files):
    freq = collections.Counter()
    for f in files:
        for t in tokens_no_mx(f): freq[strip_accents(t.lower())] += 1
    return {t for t, c in freq.items() if c >= 3} | SEED_CAT | TYPE_WORDS
def extract_descriptor(f):
    # Plan B: el descriptor (marca + categoría si la trae) ES la identidad de la carpeta.
    # Quita tipo, años, variantes de "campañas" (incl. typos), tokens repetidos y conectores sueltos.
    out, seen = [], set()
    for t in tokens_no_mx(f):
        tl = strip_accents(t.lower())
        if tl in TYPE_WORDS or tl in YEAR_TOKENS or re.fullmatch(r"20\d{2}", t): continue
        if re.fullmatch(r"ca[mn]+pa[nñ]?as?", tl): continue
        if tl in seen: continue
        seen.add(tl); out.append(t)
    drop = CONNECTORS | {"&", "e"}
    while out and strip_accents(out[0].lower()) in drop: out.pop(0)
    while out and strip_accents(out[-1].lower()) in drop: out.pop()
    disp = " ".join(out) if out else "marca"
    return disp, slugify(disp)
def extract_year(name):
    m = re.search(r"(?<!\d)(20\d{2})(?!\d)", name); return m.group(1) if m else None
def yaml_escape(v):
    s = str(v); return '"' + s.replace('"', "'") + '"' if re.search(r"[:#'\"]", s) else s
def build_frontmatter(disp, slug, tipo, year, cat, origin):
    m = TYPE_META[tipo]
    fm = {"id": f"kb-brand-{slug}-{m['short']}", "titulo": f"{disp} · {m['titulo']}", "marca": disp,
          "categoria": cat, "mercado": "MX", "cuerpo": tipo, "tipo_activo": "inteligencia_aplicada",
          "estabilidad": m["estabilidad"], "sensibilidad": m["sensibilidad"], "rol_minimo": m["rol"],
          "aislado_por_cliente": "true", "fuente": m["fuente"], "anio": year or "null",
          "fecha_migracion": datetime.date.today().isoformat(), "archivo_origen": origin}
    if m["estabilidad"] == "caduca": fm["vigencia_hasta"] = f"{year or datetime.date.today().year}-12-31"
    return "\n".join(["---"] + [f"{k}: {yaml_escape(v)}" for k, v in fm.items()] + ["---", ""])

def resolve_target(base, existing):
    """Opción 1: empareja el finding nuevo a una carpeta de marca existente por prefijo."""
    cands = [e for e in existing if e == base or e.startswith(base + "-") or base.startswith(e + "-")]
    if len(cands) == 1: return cands[0], "matched", cands
    if len(cands) == 0: return base, "new", []
    return base, "ambiguous", cands  # coincidió con 2+: se coloca en carpeta propia y se reporta

def detect_type(name):
    """Detecta el cuerpo a partir del nombre del archivo (para lotes mixtos)."""
    low = strip_accents(name).lower()
    if "diagnostico" in low or "9fuentes" in low or "9 fuentes" in low or "brand mapping" in low: return "diagnostico_9fuentes"
    if "campan" in low or "temporalidad" in low: return "campanas_temporalidades"
    if "buyer" in low or "persona" in low: return "buyer_personas"
    if "social" in low or "inteligencia" in low: return "inteligencia_social"
    return "diagnostico_9fuentes"

def main(src, out, tipo=None):
    md = MarkItDown()
    bi = os.path.join(out, "knowledge", "brand-intelligence"); os.makedirs(bi, exist_ok=True)
    existing = set(d for d in os.listdir(bi) if os.path.isdir(os.path.join(bi, d)))
    files = sorted(f for f in os.listdir(src) if f.lower().endswith(".docx"))
    recs = []
    for f in files:
        disp, slug = extract_descriptor(f)
        recs.append(dict(file=f, slug=slug, disp=disp, cat="por_definir", year=extract_year(f),
                         tipo=tipo or detect_type(f)))
    status = {"matched": [], "new": [], "ambiguous": []}; collisions = []; written = []
    for r in sorted(recs, key=lambda x: x["file"]):
        t = r["tipo"]; short = TYPE_META[t]["short"]
        target, st, cands = resolve_target(r["slug"], existing)
        dest = os.path.join(bi, target, short + ".md")
        if os.path.exists(dest):  # ese finding ya existe en esa carpeta -> no pisar
            i = 2; alt = f"{target}-{i}"
            while os.path.exists(os.path.join(bi, alt, short + ".md")) or alt in existing:
                i += 1; alt = f"{target}-{i}"
            target = alt; dest = os.path.join(bi, target, short + ".md")
            collisions.append(dict(disp=r["disp"], file=r["file"], slug=target))
        try: text = md.convert(os.path.join(src, r["file"])).text_content
        except Exception as e: print("  ERROR", r["file"], e); continue
        r["words"] = len(text.split()); r["final_slug"] = target; r["status"] = st; r["cands"] = cands
        fm = build_frontmatter(r["disp"], target, t, r["year"], r["cat"], r["file"])
        os.makedirs(os.path.join(bi, target), exist_ok=True)
        with open(dest, "w", encoding="utf-8") as fh: fh.write(fm + text.strip() + "\n")
        existing.add(target); status[st].append(r); written.append(r)
    label = TYPE_META[tipo]["short"] if tipo else "adicionales"
    write_registro(out, written, collisions, label, status)
    print(f"  escritos:{len(written)} emparejados:{len(status['matched'])} nuevos:{len(status['new'])} ambiguos:{len(status['ambiguous'])} colisiones:{len(collisions)}")
    return written, collisions

def write_registro(out, written, collisions, label, status):
    THIN = 800
    matched, new, amb = status["matched"], status["new"], status["ambiguous"]
    L = [f"# Registro — lote {label}", "",
         f"_{datetime.date.today().isoformat()}_ · emparejado opción 1 (prefijo de marca)", "",
         f"**Archivos:** {len(written)} · **Emparejados:** {len(matched)} · "
         f"**Nuevos:** {len(new)} · **Ambiguos:** {len(amb)} · **Colisiones:** {len(collisions)}", "",
         "## Detalle (qué tipo se detectó y dónde cayó)", "",
         "| Marca (del archivo) | Tipo detectado | Carpeta destino | Estado |", "|---|---|---|---|"]
    for r in sorted(written, key=lambda x: x["file"]):
        L.append(f"| {r['disp']} | {TYPE_META[r['tipo']]['short']} | `{r['final_slug']}` | {r['status']} |")
    L.append("")
    if new:
        L += ["## Nuevos — crearon carpeta (sin marca previa con ese nombre)", "",
              "_O la marca es nueva, o su nombre difiere de la carpeta existente. Revisar._", ""]
        for r in sorted(new, key=lambda x: x["final_slug"]): L.append(f"- {r['disp']} → `{r['final_slug']}`")
        L.append("")
    if amb:
        L += ["## Ambiguos — coincidieron con 2+ marcas (revisar)", ""]
        for r in sorted(amb, key=lambda x: x["final_slug"]):
            L.append(f"- {r['disp']} → `{r['final_slug']}` · candidatos: " + ", ".join("`"+c+"`" for c in r["cands"]))
        L.append("")
    if collisions:
        L += ["## Colisiones (mismo finding ya existía; separado con sufijo)", ""]
        for c in collisions: L.append(f"- {c['disp']} → `{c['slug']}`")
        L.append("")
    thin = [r for r in written if r.get("words", 0) < THIN]
    if thin:
        L += ["## Findings delgados (<800 palabras)", ""]
        for r in sorted(thin, key=lambda x: x["words"]):
            L.append(f"- {r['disp']} ({TYPE_META[r['tipo']]['short']}): {r['words']} palabras")
    with open(os.path.join(out, f"REGISTRO_{label}.md"), "w", encoding="utf-8") as fh:
        fh.write("\n".join(L) + "\n")

if __name__ == "__main__":
    src, out = sys.argv[1], sys.argv[2]
    tipo = sys.argv[sys.argv.index("--tipo") + 1] if "--tipo" in sys.argv else None
    print(f"Migrando {src} -> {out} (tipo: {tipo or 'autodetectado por nombre'})")
    main(src, out, tipo)
    print(f"Listo. Ver REGISTRO_{TYPE_META[tipo]['short'] if tipo else 'adicionales'}.md")
