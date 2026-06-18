# Referencia: Etiquetado, Reglas de Triangulación y Campaign Ledger

Este documento define con precisión la convención de etiquetado de CAMPAIGNMAP y la estructura formal del Campaign Ledger. Se carga cuando el skill está normalizando hallazgos o redactando el output.

---

## Convención de etiquetas

CAMPAIGNMAP usa 4 etiquetas — **siempre una y solo una** por afirmación relevante.

### `[HECHO VERIFICADO]`
- **Definición**: el dato proviene de una fuente directa y citable.
- **Requisitos para usar esta etiqueta**:
  - Al menos **una URL** específica (no genérica al dominio).
  - **Extracto breve verificable** (frase o párrafo de la fuente).
  - **Fecha de consulta** del recurso.
  - Idealmente, **una segunda fuente independiente** que coincida (triangulación). Cuando triangulado, anotar `[HECHO VERIFICADO – triangulado 2 fuentes]`.
- **Ejemplos válidos**:
  - "Nike firmó a Edson Álvarez como embajador en marzo 2024" + URL al press release de Nike + extracto + fecha de consulta.
  - "La campaña 'Vive Auténtico' de Corona se lanzó en abril 2025" + URL del newsroom + URL del Meta Ads Library mostrando el ad activo desde 14-abril.

### `[INFERENCIA]`
- **Definición**: deducción razonada a partir de señales verificadas, pero la conclusión específica no está declarada explícitamente.
- **Requisitos**:
  - Listar **las señales que sustentan la inferencia** (cada una idealmente verificable).
  - Indicar **nivel de confianza** opcionalmente (alta/media/baja).
- **Ejemplos válidos**:
  - "La campaña apunta a NSE C+ urbano (`[INFERENCIA]` – señales: casting joven aspiracional, OOH concentrado en zonas Insurgentes/Polanco/Santa Fe, claim de aspiracional, partnership con Spotify Wrapped MX)."
  - "El objetivo principal era performance (`[INFERENCIA]` – señales: CTA directo a landing de compra, formato direct response 6s, sin claim emocional)."

### `[HIPÓTESIS]`
- **Definición**: propuesta plausible que aún no tiene evidencia suficiente para ser inferencia. Más débil que `[INFERENCIA]`.
- **Requisitos**:
  - Indicar **cómo se validaría** (qué fuente o método confirmaría).
- **Ejemplos válidos**:
  - "Probablemente hay un patrocinio activo con Liga MX (`[HIPÓTESIS]` – validar consultando `ligamx.net/patrocinadores` y newsroom de la marca)."

### `[GAP]`
- **Definición**: información que falta y que CAMPAIGNMAP reconoce no haber podido encontrar.
- **Requisitos**:
  - Decir **qué se buscaba**.
  - Decir **dónde se buscó**.
  - Proponer **cómo se obtendría** (fuente paga, entrevista interna, monitoreo manual, etc.).
- **Ejemplos válidos**:
  - "Inversión en TV no encontrada `[GAP]` – buscado en newsroom, prensa especializada y reportes IAB MX. Se obtendría con Kantar IBOPE Media (paywall) o reporte interno del cliente."

---

## Regla de oro

Si una afirmación no encaja claramente en `[HECHO VERIFICADO]`, **bájala** a `[INFERENCIA]`. Si no encaja claramente en `[INFERENCIA]`, **bájala** a `[HIPÓTESIS]`. Si tampoco, **márcala como `[GAP]`**. Nunca inventar.

---

## Reglas de triangulación

Para datos críticos, exigir al menos dos fuentes independientes:

| Dato | Triangulación obligatoria |
|---|---|
| Fechas de flight (inicio/fin de campaña) | Sí |
| Claim/copy principal | Sí (idealmente con captura del creative) |
| Embajador o partnership declarado | Sí (anuncio de marca + anuncio del talento/propiedad) |
| Monto de inversión (cuando se declara) | Sí, y siempre marcar la fuente — los montos pueden ser estimados de prensa |
| Resultados/performance declarado | Sí, con escrutinio extra de credibilidad |
| Patrocinio mayor (deportivo/cultural) | Sí (propiedad + marca) |

Fuentes "independientes" significa de organizaciones distintas, no dos notas del mismo medio repostando la misma fuente original.

---

## Estructura formal del Campaign Ledger

Cada actividad publicitaria encontrada se registra como un bloque con esta ficha. **No dejar campos vacíos**: usar `No encontrado` o `[GAP]` cuando aplique.

```markdown
#### Actividad [Pilar.Número] — [Nombre o ID de la actividad]

- **Pilar:** [1 Paid / 2 Branded Content / 3 Patrocinios / 4 Orgánico]
- **Tipo específico:** [spot TV / valla OOH / branded article / sponsor festival / embajador / etc.]
- **Fechas:** [YYYY-MM-DD a YYYY-MM-DD, o mes/temporada] · **Etiqueta de evidencia:** [HECHO VERIFICADO / INFERENCIA / HIPÓTESIS]
- **Mercado(s):** [país o ciudades específicas]
- **Objetivo principal:** [Awareness / Consideración / Performance / Trade / Brand Building / Retención] · **Cómo se infiere:** [razón]
- **Insight o tensión humana:** [si se detecta] · **Etiqueta:** [HECHO / INFERENCIA]
- **Claim / propuesta principal:** [copy exacto entre comillas si es posible, sin pasar 15 palabras textuales]
- **RTBs (pruebas/razones para creer):** [producto / precio / promo / garantía / autoridad / endorser]
- **Audiencia objetivo:** [declarada o inferida + señales]
- **Canales y formatos usados:** [lista]
- **Rol funnel:** [ToFu / MoFu / BoFu, por canal si aplica]
- **KPIs probables:** [reach, VTR, ad recall, consideration lift, CTR, CVR, CAC, ROAS, footfall...]
- **Creatividades clave:** [URLs a video / KV / landing] · [fecha de captura]
- **Notas de ejecución:** [tono, códigos culturales, mecánica de promo, CTA]
- **Performance declarado:** [si existe + credibilidad: alta/media/baja]
- **Plataforma de mensaje:** [precio/promo / innovación / confianza / estilo de vida / propósito]
- **Etiqueta general:** [HECHO VERIFICADO / INFERENCIA / HIPÓTESIS]
- **Fuentes:**
  - [URL 1] — "[extracto breve]" — consultado YYYY-MM-DD
  - [URL 2] — "[extracto breve]" — consultado YYYY-MM-DD
```

---

## Reglas de citación

- Cada URL del Apéndice de Fuentes va con el nombre del recurso, **extracto breve verificable** (≤15 palabras textuales por extracto — paráfraseo el resto) y **fecha de consulta**.
- Si la fuente está detrás de paywall, declararlo: `[paywall – Forbes MX]`.
- No usar imágenes embebidas en el .md (eficiencia para el centro de conocimiento). Si una creatividad es relevante, citar URL y describir verbalmente.

---

## Anti-alucinación: checklist final

Antes de redactar el bloque, CAMPAIGNMAP se pregunta:

1. ¿Estoy citando algo que vi yo (URL + extracto), o estoy completando un patrón típico de la categoría?
2. Si lo segundo → bájalo a `[INFERENCIA]` o `[HIPÓTESIS]`.
3. ¿La fecha exacta viene de la fuente o la estoy redondeando? Si redondeada → declararlo.
4. ¿El claim que pongo entre comillas existe textualmente en la fuente o lo estoy parafraseando? Si parafraseo → quitar comillas.
5. ¿Estoy mezclando campañas globales con la versión local del mercado pedido? Separar.
