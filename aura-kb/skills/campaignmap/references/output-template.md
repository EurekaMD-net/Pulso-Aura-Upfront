# Referencia: Template del MD Output Entregable

CAMPAIGNMAP carga esta referencia justo antes de generar el archivo Markdown final. La estructura del output es **estable** para garantizar que otros skills (BRIEFER, RADAR, APEX, ADA) puedan parsearlo de manera predecible.

---

## Nombre del archivo

Formato obligatorio:

```
campaignmap-[marca-en-kebab-case]-[mercado-en-kebab-case]-[YYYYMMDD].md
```

Ejemplos:
- `campaignmap-coca-cola-sin-azucar-mexico-20260613.md`
- `campaignmap-pluto-tv-latam-20260613.md`
- `campaignmap-kelloggs-zucaritas-caricam-20260613.md`

Reglas:
- Lowercase.
- Espacios → guiones.
- Sin caracteres especiales (eñes, acentos).
- Fecha al final, formato `YYYYMMDD`.

---

## Estructura completa del MD

```markdown
# CampaignMap · [Marca] · [Categoría] · [Mercado]

> **Documento producido por:** CAMPAIGNMAP (investigador táctico forense)
> **Fecha de análisis:** [YYYY-MM-DD]
> **Ventana temporal analizada:** [mes/año inicial – mes/año final]
> **Categoría:** [...]
> **Mercado:** [país / región]
> **Versión:** 1.0

---

## 0. Resumen Ejecutivo

Tres a cinco párrafos en prosa. Responder:

- ¿Qué está pasando con la comunicación pagada y no pagada de la marca en la ventana analizada?
- ¿Cuáles son las 3-5 observaciones más relevantes (sin proponer plan)?
- ¿Dónde están los huecos más grandes (temporalidad sin actividad, pilar sin presencia)?
- ¿Qué nivel de evidencia sustenta el análisis (cuántos hechos verificados vs inferencias vs gaps)?

---

## 1. Brand Base File — Ingesta

> Esta sección aplica solo si el usuario entregó un Brand Base File. Si no, omitir.

### 1.1 Contexto esencial extraído
- [10-15 bullets de contexto: categoría, portafolio, segmentos, JTBD, tensiones, ventaja competitiva, canales]

### 1.2 Pistas declaradas en el brief
- [bullets con campañas mencionadas, embajadores, eventos, claims con etiquetado]

### 1.3 Hipótesis iniciales para validar externamente
- [bullets]

---

## 2. Plan de búsqueda ejecutado

Tabla por pilar de qué fuentes se consultaron y con qué queries clave.

| Pilar | Fuentes consultadas | Queries clave | Cobertura lograda |
|---|---|---|---|
| 1 Paid Advertising | [...] | [...] | [alta/media/baja + por qué] |
| 2 Branded Content | [...] | [...] | [...] |
| 3 Patrocinios | [...] | [...] | [...] |
| 4 Orgánico | [...] | [...] | [...] |

---

## 3. Campaign Ledger

Inventario completo de actividades encontradas. Cada actividad sigue el bloque definido en `references/etiquetado-y-ledger.md`.

### 3.1 Pilar 1 — Paid Advertising

#### Actividad 1.1 — [nombre]
[bloque completo según referencia]

#### Actividad 1.2 — [nombre]
[bloque completo]

[...]

### 3.2 Pilar 2 — Branded Content & Editorial

#### Actividad 2.1 — [nombre]
[...]

### 3.3 Pilar 3 — Patrocinios, Partnerships & Embajadores

#### Actividad 3.1 — [nombre]
[...]

### 3.4 Pilar 4 — Presencia Orgánica & Owned Media

#### Actividad 4.1 — [nombre]
[...]

---

## 4. Lectura Estratégica (forense)

### 4.1 Plataformas de mensaje detectadas
Agrupar las actividades por plataforma de mensaje (precio/promo, innovación, confianza, estilo de vida, propósito) y describir.

| Plataforma de mensaje | Actividades asociadas | Peso relativo en el portafolio |
|---|---|---|
| [...] | [IDs 1.1, 2.3, 3.2...] | [alto/medio/bajo] |

### 4.2 Patrones detectados
- Repetición de claims: [...]
- Fatiga creativa: [...]
- Cambios de tono: [...]
- Cambios de target: [...]
- Cambios de canal: [...]

### 4.3 Debilidades observadas
- [debilidades en prosa]

### 4.4 Campaign Narrative Arc (12-15 meses)
Narración cronológica de cómo evolucionó la comunicación de la marca durante la ventana.

---

## 5. Messaging Map

Matriz que cruza mensajes/RTBs con actividades:

| Mensaje / RTB | Actividades que lo usaron | Pilar dominante |
|---|---|---|
| [...] | [IDs] | [...] |

---

## 6. Audience Map

Audiencias inferidas o declaradas + actividades que les hablaron:

| Audiencia | Señales (cómo se infiere) | Actividades dirigidas | Etiqueta |
|---|---|---|---|
| [...] | [...] | [IDs] | [HECHO/INFERENCIA] |

---

## 7. Seasonality Map del mercado

### 7.1 Temporalidades culturales/comerciales del mercado
[Listar las del mercado pedido, NO defaultear a México.]

### 7.2 Temporalidades propias de la categoría
[Picos de consumo, ciclos de compra, ventanas de lanzamiento típicas]

### 7.3 Temporalidades propias de la marca encontradas
[Detectadas en el Campaign Ledger]

### 7.4 Calendario mes-por-mes

| Mes | Ventana relevante | Trigger | Barreras dominantes | Job dominante | Tipo de mensaje | KPI sensato |
|---|---|---|---|---|---|---|
| Ene | [...] | [...] | [...] | [...] | [...] | [...] |
| Feb | [...] | [...] | [...] | [...] | [...] | [...] |
| ... | | | | | | |
| Dic | [...] | [...] | [...] | [...] | [...] | [...] |

---

## 8. Cruce Actividad × Temporalidades

Mapa visual (en tabla) de qué pilar/actividad ocupó cada ventana y dónde hay huecos.

| Mes | Pilar 1 Paid | Pilar 2 Branded | Pilar 3 Patrocinios | Pilar 4 Orgánico | Observación |
|---|---|---|---|---|---|
| Ene | [IDs o vacío] | [...] | [...] | [...] | [over-investment / white space / mensaje equivocado] |
| ... | | | | | |

### 8.1 White Spaces detectados
- [Ventanas grandes sin actividad significativa, con justificación de por qué sería relevante.]

### 8.2 Over-investments detectados
- [Ventanas donde la marca compite con ruido excesivo.]

### 8.3 Hombros sub-aprovechados
- [Ventanas pre/post pico donde la marca podría capturar a menor costo.]

---

## 9. Territorios GEO recomendados (capa transversal)

> CAMPAIGNMAP **no audita actividad GEO existente**. Esta sección señala territorios donde la marca **debería ser visible para LLMs** dado lo encontrado en los 4 pilares. Es señalamiento, no plan.

| # | Cluster temático | Prompts típicos del comprador | Activo de la marca que justifica el territorio | Gap GEO probable |
|---|---|---|---|---|
| 1 | [...] | [3-5 prompts ejemplo] | [actividad ID o partnership real] | [HIPÓTESIS de gap] |
| 2 | [...] | [...] | [...] | [...] |
| ... | | | | |

Mínimo 5 territorios, máximo 10. Cada uno con justificación.

---

## 10. Opportunity Theses

Lista de 8-15 tesis. Cada tesis sigue esta estructura:

### Tesis 10.1 — [Título de la oportunidad en una frase]

- **Oportunidad:** [una frase clara]
- **Evidencia que la sustenta:**
  - [Qué actividad sí o no se vio + qué temporalidad la abre]
- **Audiencia específica probable:** [...]
- **Territorio de mensaje sugerido:** [no es guion — es un territorio]
- **Mix de canales sugerido:** [con rol por funnel]
- **KPI primario:** [...]
- **KPIs secundarios:** [...] · [...]
- **Riesgos y mitigación:** [...]
- **Idea concreta (una línea):** [...]

### Tesis 10.2 — [...]
[...]

---

## 11. Gaps de información

Lista de todos los `[GAP]` encontrados durante la investigación.

| # | Información faltante | Dónde se buscó | Cómo se obtendría |
|---|---|---|---|
| 1 | [...] | [...] | [Kantar IBOPE / Nielsen / entrevista interna / proveedor de medio / monitoreo manual] |
| ... | | | |

---

## 12. Apéndice de Fuentes

Todas las URLs consultadas, organizadas por pilar y por actividad.

### 12.1 Pilar 1 — Paid Advertising
- **[Actividad 1.1]** [URL] — "[extracto ≤15 palabras]" — consultado YYYY-MM-DD
- **[Actividad 1.2]** [URL] — "[extracto]" — consultado YYYY-MM-DD

### 12.2 Pilar 2 — Branded Content & Editorial
- [...]

### 12.3 Pilar 3 — Patrocinios, Partnerships & Embajadores
- [...]

### 12.4 Pilar 4 — Presencia Orgánica & Owned Media
- [...]

### 12.5 Temporalidades
- [...]

### 12.6 Fuentes generales de contexto de mercado
- [...]

---

## Metadatos del documento

```yaml
skill: campaignmap
version: 1.0
marca: [...]
categoria: [...]
mercado: [...]
ventana_analisis_inicio: YYYY-MM
ventana_analisis_fin: YYYY-MM
fecha_produccion: YYYY-MM-DD
n_actividades_encontradas: [int]
n_hechos_verificados: [int]
n_inferencias: [int]
n_hipotesis: [int]
n_gaps: [int]
pilares_cubiertos: [1, 2, 3, 4]
brand_base_file_ingerido: [true/false]
```

---

*Fin del CampaignMap.*
```

---

## Reglas de estilo del MD

- **No usar imágenes embebidas** (eficiencia como pieza de centro de conocimiento).
- **No exceder 15 palabras** de texto literal de cualquier fuente (citación con paráfraseo).
- **Tablas markdown** con `|` — siempre con encabezados claros.
- **Headers consistentes** (`#`, `##`, `###`) — no saltar niveles.
- **Etiquetas en mayúsculas y corchetes**: `[HECHO VERIFICADO]`, `[INFERENCIA]`, `[HIPÓTESIS]`, `[GAP]`.
- **Bloque YAML de metadatos al final** — facilita parsing por otros skills.
- **Sin emojis** salvo si el usuario los pide explícitamente.
- **Spanish-first** salvo idioma distinto pedido.
