# Registro maestro de skills — plano de orquestación AURA

Catálogo legible por agente de los **19 skills** del ecosistema, su capa, su disparador
y cómo se encadenan. Generado directamente desde el frontmatter de las fichas reales —el
grafo está verificado: cada `depende_de`, `alimenta_a` y `acompana_a` apunta a un skill que
existe o a un destino válido (`vendedor`, `cierre`). Cero referencias rotas.

---

## El flujo, en una línea

El vendedor **conversa con AURA**. AURA identifica la marca y la intención y enruta:

1. **Diagnóstico** — busca la marca en el KB; si faltan findings, los construye (briefer = vía rápida).
2. **ARMAGEDDON** — radiografía → oportunidad (preventa-2027) → táctico (arma el Excel multimedia).
3. **DARK** — cómo trabajar el acercamiento.
4. **STAKEHOLDERS** — el hilado fino, persona por persona.

Con **APEX / RADAR / ADA** acompañando estrategia y táctica de forma transversal y traduciendo a lenguaje de vendedor.

---

## Reglas de orquestación (la lógica del plano)

1. **Gate del KB.** Una marca "ya la tenemos" si sus **4 findings están presentes** en
   `knowledge/brand-intelligence/<marca>/`. No se evalúa caducidad (un protocolo externo mantiene
   la base fresca). Si falta cualquiera, se construye solo el que falte con su especialista.
2. **Los 4 especialistas son el ideal; briefer es la vía rápida.** brandmap, buyermap, campaignmap
   y socialmap son la ruta recomendada. briefer sabe de los 4 temas y sirve para consolidar en una
   síntesis legible o dar una respuesta rápida cuando hay prisa — no los reemplaza.
3. **La recomendación es SIEMPRE multimedia.** En el paso táctico, los 4 medios (tv/ctv/radio/digital)
   alimentan a `tactico-comercial-excel`, que ensambla el Excel. El vendedor **no elige medios**.
   ARMAGEDDON también convoca a un medio puntual si el vendedor pregunta por él en la conversación.
4. **APEX / RADAR / ADA son transversales y NO los invoca el vendedor.** Acompañan las recomendaciones
   estratégicas y tácticas (`invocacion: automatica`) y **traducen su terminología elevada** (journeys,
   geo, LLMs) a lenguaje coloquial de vendedor.

---

## Tabla maestra (por capa)

### Router

| Skill | Rol | Trigger | Salida | Depende de | Alimenta a | Rol mínimo |
|---|---|---|---|---|---|---|
| `aura-amn` | Conversa con el vendedor, identifica marca e intencion (push/pull/preventa) y enruta a las capas | Inquietud comercial del vendedor; en preventa encamina ARMAGEDDON -> DARK -> STAKEHOLDERS | conversacion | — | `aura-armageddon`, `briefer` | transversal |

### Capa 1 · Diagnóstico

| Skill | Rol | Trigger | Salida | Depende de | Alimenta a | Rol mínimo |
|---|---|---|---|---|---|---|
| `brandmap` | Genera el diagnostico de 9 fuentes (THANOS, 4 aristas) | Falta diagnostico-9fuentes en el KB para la marca | md | — | `briefer`, `aura-armageddon` | estrategia_research |
| `briefer` | Consolida los 4 findings en una sintesis legible; via rapida cuando el vendedor tiene prisa (sabe de los 4 temas) | El vendedor pide rapidez o una sintesis - alternativa veloz a los 4 especialistas (no es el ideal) | md | — | vendedor, `aura-armageddon` | comercial_kam |
| `buyermap` | Genera buyer personas estrategicos (5 pilares fusionados, 4 personas de 5 capas) | Falta buyer-personas en el KB para la marca | md | — | `briefer`, `aura-armageddon` | estrategia_research |
| `campaignmap` | Mapea campanas y temporalidades (Campaign Ledger, Seasonality Map, Opportunity Theses) | Falta campanas-temporalidades en el KB para la marca | md | — | `briefer`, `aura-armageddon` | estrategia_research |
| `socialmap` | Mapea inteligencia social (territorios de conversacion, voz organica del consumidor) | Falta inteligencia-social en el KB para la marca | md | — | `briefer`, `aura-armageddon` | estrategia_research |

### Capa 2 · ARMAGEDDON (orquestador + fases)

| Skill | Rol | Trigger | Salida | Depende de | Alimenta a | Rol mínimo |
|---|---|---|---|---|---|---|
| `aura-armageddon` | Orquesta el cierre - diagnostico (4 mapping si faltan), radiografia, oportunidades y plan tactico multimedia (Excel) | Intencion de preventa / marca con conocimiento listo | docx+xlsx | `brandmap`, `buyermap`, `campaignmap`, `socialmap`, `radiografia`, `preventa-2027` | `aura-dark` | comercial_kam |
| `preventa-2027` | Construye el documento estrategico de oportunidades de marca para la Preventa 2027 | Tras la radiografia, dentro de ARMAGEDDON | docx | `radiografia` | `tv-lineal-tactical`, `ctv-tactical`, `radio-tactical`, `digital-azteca-tactical`, `aura-dark` | comercial_kam |
| `radiografia` | Diagnostica el portafolio de campanas de la marca y encuentra whitespaces (no prescribe medios) | Inicio de ARMAGEDDON, con el conocimiento de marca listo | insumo-interno | `brandmap`, `buyermap`, `campaignmap`, `socialmap` | `preventa-2027` | comercial_kam |

### Capa táctica (dentro del paso final de ARMAGEDDON)

| Skill | Rol | Trigger | Salida | Depende de | Alimenta a | Rol mínimo |
|---|---|---|---|---|---|---|
| `ctv-tactical` | Tactica creativa de CTV - plataforma, formato, audiencia y funnel | Paso tactico de ARMAGEDDON (siempre, recomendacion multimedia) o el vendedor pregunta por este medio | insumo-tactico | `preventa-2027` | `tactico-comercial-excel` | comercial_kam |
| `digital-azteca-tactical` | Tactica digital AMN - propiedad, formato, audiencia segmentada y KPI | Paso tactico de ARMAGEDDON (siempre, recomendacion multimedia) o el vendedor pregunta por este medio | insumo-tactico | `preventa-2027` | `tactico-comercial-excel` | comercial_kam |
| `radio-tactical` | Tactica creativa de radio y audio - estacion, formato y horario | Paso tactico de ARMAGEDDON (siempre, recomendacion multimedia) o el vendedor pregunta por este medio | insumo-tactico | `preventa-2027` | `tactico-comercial-excel` | comercial_kam |
| `tactico-comercial-excel` | Ensambla el plan tactico comercial multimedia en Excel (objetivo, medio, propiedad, cantidad, precio, KPI) | Paso final tactico - bajar la recomendacion multimedia a Excel | xlsx | `tv-lineal-tactical`, `ctv-tactical`, `radio-tactical`, `digital-azteca-tactical`, `preventa-2027` | `aura-armageddon` | comercial_kam |
| `tv-lineal-tactical` | Tactica creativa de TV abierta - propiedades, formatos, dayparts y timing | Paso tactico de ARMAGEDDON (siempre, recomendacion multimedia) o el vendedor pregunta por este medio | insumo-tactico | `preventa-2027` | `tactico-comercial-excel` | comercial_kam |

### Capa transversal (acompañan; NO las invoca el vendedor)

| Skill | Rol | Acompaña a | Invocación | Salida | Rol mínimo |
|---|---|---|---|---|---|
| `ada` | Estratega de audiencias duales (humanas + LLMs); geo y share of answer | `aura-armageddon` | automatica (`aura-armageddon`, vendedor) | recomendacion | estrategia_research |
| `apex` | Estratega y tactico de medios; efectividad y justificacion de inversion (ROAS, ante CFO/CMO) | `aura-armageddon` | automatica (`aura-armageddon`, vendedor) | recomendacion | estrategia_research |
| `radar` | Arquitecto de inversion por influencia; touchpoints y journeys; presupuestacion por efectos | `aura-armageddon` | automatica (`aura-armageddon`, vendedor) | recomendacion | estrategia_research |

### Capa 3-4 · DARK / STAKEHOLDERS (cierre)

| Skill | Rol | Trigger | Salida | Depende de | Alimenta a | Rol mínimo |
|---|---|---|---|---|---|---|
| `aura-dark` | Construye como trabajar el acercamiento - comite, secuencia y negociacion (sala invisible) | Tras tener argumento y recomendacion (ARMAGEDDON); o reto de persuasion/comite/negociacion | md | `aura-armageddon` | `aura-stakeholders` | restringido_senior |
| `aura-stakeholders` | Hilado fino persona por persona - mapa de poder, ponderacion y plan de influencia individual | Tras DARK; o reto de mapa de poder / como mover a una persona | md | `aura-dark` | cierre | restringido_senior |

---

## Notas

- Cada ficha conserva su `name` + `description` originales (activación del skill) y, bajo el comentario
  `# KB routing (registro maestro):`, el bloque de ruteo que lee este registro.
- Las fases internas de ARMAGEDDON (`radiografia`, `preventa-2027`) tienen ficha propia por si el motor
  las indexa por separado, pero en operación las corre el orquestador `aura-armageddon`.
- Total: 19 fichas. Reconstruir este registro: `python3 gen_registry.py`.
