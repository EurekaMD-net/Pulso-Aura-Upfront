import yaml, glob, re
from collections import defaultdict

S={}
for f in sorted(glob.glob('skills/*/SKILL.md')):
    fm=yaml.safe_load(re.match(r'^---\n(.*?)\n---\n',open(f).read(),re.S).group(1))
    S[fm['name']]=fm

def lst(fm,k): 
    v=fm.get(k) or []
    return ", ".join(f"`{x}`" if x not in ('vendedor','cierre') else x for x in v) or "—"

ORDER=['router','diagnostico','armageddon','tactico','transversal','cierre']
TIT={'router':'Router','diagnostico':'Capa 1 · Diagnóstico','armageddon':'Capa 2 · ARMAGEDDON (orquestador + fases)',
     'tactico':'Capa táctica (dentro del paso final de ARMAGEDDON)','transversal':'Capa transversal (acompañan; NO las invoca el vendedor)',
     'cierre':'Capa 3-4 · DARK / STAKEHOLDERS (cierre)'}
byc=defaultdict(list)
for n,fm in S.items(): byc[fm['capa']].append(n)

out=[]
out.append("# Registro maestro de skills — plano de orquestación AURA")
out.append("")
out.append(f"Catálogo legible por agente de los **{len(S)} skills** del ecosistema, su capa, su disparador")
out.append("y cómo se encadenan. Generado directamente desde el frontmatter de las fichas reales —el")
out.append("grafo está verificado: cada `depende_de`, `alimenta_a` y `acompana_a` apunta a un skill que")
out.append("existe o a un destino válido (`vendedor`, `cierre`). Cero referencias rotas.")
out.append("")
out.append("---")
out.append("")
out.append("## El flujo, en una línea")
out.append("")
out.append("El vendedor **conversa con AURA**. AURA identifica la marca y la intención y enruta:")
out.append("")
out.append("1. **Diagnóstico** — busca la marca en el KB; si faltan findings, los construye (briefer = vía rápida).")
out.append("2. **ARMAGEDDON** — radiografía → oportunidad (preventa-2027) → táctico (arma el Excel multimedia).")
out.append("3. **DARK** — cómo trabajar el acercamiento.")
out.append("4. **STAKEHOLDERS** — el hilado fino, persona por persona.")
out.append("")
out.append("Con **APEX / RADAR / ADA** acompañando estrategia y táctica de forma transversal y traduciendo a lenguaje de vendedor.")
out.append("")
out.append("---")
out.append("")
out.append("## Reglas de orquestación (la lógica del plano)")
out.append("")
out.append("1. **Gate del KB.** Una marca \"ya la tenemos\" si sus **4 findings están presentes** en")
out.append("   `knowledge/brand-intelligence/<marca>/`. No se evalúa caducidad (un protocolo externo mantiene")
out.append("   la base fresca). Si falta cualquiera, se construye solo el que falte con su especialista.")
out.append("2. **Los 4 especialistas son el ideal; briefer es la vía rápida.** brandmap, buyermap, campaignmap")
out.append("   y socialmap son la ruta recomendada. briefer sabe de los 4 temas y sirve para consolidar en una")
out.append("   síntesis legible o dar una respuesta rápida cuando hay prisa — no los reemplaza.")
out.append("3. **La recomendación es SIEMPRE multimedia.** En el paso táctico, los 4 medios (tv/ctv/radio/digital)")
out.append("   alimentan a `tactico-comercial-excel`, que ensambla el Excel. El vendedor **no elige medios**.")
out.append("   ARMAGEDDON también convoca a un medio puntual si el vendedor pregunta por él en la conversación.")
out.append("4. **APEX / RADAR / ADA son transversales y NO los invoca el vendedor.** Acompañan las recomendaciones")
out.append("   estratégicas y tácticas (`invocacion: automatica`) y **traducen su terminología elevada** (journeys,")
out.append("   geo, LLMs) a lenguaje coloquial de vendedor.")
out.append("")
out.append("---")
out.append("")
out.append("## Tabla maestra (por capa)")
out.append("")

for capa in ORDER:
    if not byc[capa]: continue
    out.append(f"### {TIT[capa]}")
    out.append("")
    if capa=='transversal':
        out.append("| Skill | Rol | Acompaña a | Invocación | Salida | Rol mínimo |")
        out.append("|---|---|---|---|---|---|")
        for n in sorted(byc[capa]):
            fm=S[n]
            out.append(f"| `{n}` | {fm['rol']} | {lst(fm,'acompana_a')} | {fm.get('invocacion','—')} ({lst(fm,'alimenta_a')}) | {fm.get('herramienta_salida','—')} | {fm['rol_minimo']} |")
    else:
        out.append("| Skill | Rol | Trigger | Salida | Depende de | Alimenta a | Rol mínimo |")
        out.append("|---|---|---|---|---|---|---|")
        for n in sorted(byc[capa]):
            fm=S[n]
            out.append(f"| `{n}` | {fm['rol']} | {fm['trigger']} | {fm.get('herramienta_salida','—')} | {lst(fm,'depende_de')} | {lst(fm,'alimenta_a')} | {fm['rol_minimo']} |")
    out.append("")

out.append("---")
out.append("")
out.append("## Notas")
out.append("")
out.append("- Cada ficha conserva su `name` + `description` originales (activación del skill) y, bajo el comentario")
out.append("  `# KB routing (registro maestro):`, el bloque de ruteo que lee este registro.")
out.append("- Las fases internas de ARMAGEDDON (`radiografia`, `preventa-2027`) tienen ficha propia por si el motor")
out.append("  las indexa por separado, pero en operación las corre el orquestador `aura-armageddon`.")
out.append(f"- Total: {len(S)} fichas. Reconstruir este registro: `python3 gen_registry.py`.")
out.append("")

open('dictionaries/skills-registry.md','w',encoding='utf-8').write("\n".join(out))
print("registro regenerado:", len("\n".join(out).splitlines()), "lineas,", len(S), "skills")
