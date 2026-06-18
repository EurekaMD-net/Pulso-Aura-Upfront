# AURA · Knowledge Base (`aura-kb`)

Base de conocimiento del lado **AURA** (conocimiento exógeno / efectividad) para fusionarse con
el motor **Pulso** (conocimiento endógeno / amplificación). Pulso sabe el **QUÉ** (la cuenta, lo
que ya pasó); AURA sabe el **CÓMO** (la doctrina, los skills, la efectividad). Este repo es la
mitad AURA: el conocimiento que el motor indexa, y los skills que lo usan.

Estado actual: **320 marcas / 969 findings** en `knowledge/brand-intelligence/`, **19 fichas de
skills** en `skills/`, registro de orquestación sincronizado en `dictionaries/skills-registry.md`.

---

## Mapa del repo

```
aura-kb/
├── knowledge/              Lo que se recupera para fundamentar (RAG).
│   ├── brand-intelligence/ 320 carpetas, una por marca, con hasta 4 findings .md c/u.
│   ├── doctrine/           Doctrina estable (Binet&Field, Sharp, efectividad, ISE...).
│   ├── platform-intelligence/  Inteligencia por plataforma (Disney+, Pluto, Tubi, competidores).
│   └── catalogs/           Catalogos operativos (propiedades, formatos, rate cards).
├── skills/                 Las capacidades invocables. 19 fichas + reglas globales.
│   ├── _RULES.md           Constitucion que aplica a TODOS los skills.
│   ├── _TEMPLATE/          Molde para crear una ficha nueva.
│   └── <skill>/SKILL.md    Cada ficha: name+description (activacion) + bloque de ruteo KB.
├── examples/               Ejemplos de outputs reales (.docx/.xlsx) + su sidecar .md. Ver abajo.
├── sops/                   Workflows encadenados (p. ej. cierre-preventa-2027).
├── experiments/            Outcomes de experimentos (cierra el loop de aprendizaje).
├── taxonomy/               7 vocabularios controlados (valores permitidos del frontmatter).
├── dictionaries/           Glosario, propiedades-amn, formatos, y skills-registry.md.
└── CONVENTIONS.md          Como se escribe todo (frontmatter, tiers de evidencia, naming).
```

---

## El principio: una taxonomia, un frontmatter

Lo que vuelve estas carpetas **un** KB navegable por un agente es que **cada unidad se
autodescribe** con un frontmatter YAML que usa los valores de `taxonomy/`. Hay **dos dialectos**
de frontmatter; el motor los distingue por la carpeta:

**1. Findings de conocimiento** (`knowledge/...`) — describen un activo de informacion:
`marca`, `cuerpo`, `estabilidad`, `sensibilidad`, `rol_minimo`, `aislado_por_cliente`, `tipo_activo`.
El motor los indexa como unidades de RAG y respeta `sensibilidad` / `rol_minimo` al recuperarlos.

**2. Fichas de skill** (`skills/<skill>/SKILL.md`) — ademas de su `name` + `description` de
activacion, llevan, bajo el comentario `# KB routing (registro maestro):`, un bloque de **ruteo**:

| Campo | Para que sirve |
|---|---|
| `capa` / `fase` | Donde vive el skill en el flujo (router, diagnostico, armageddon, tactico, transversal, cierre). |
| `rol` | Que hace, en una linea. |
| `trigger` | Cuando se dispara. |
| `entradas` / `salidas` / `herramienta_salida` | Que consume y que produce (md / docx / xlsx / insumo). |
| `conocimiento_que_usa` | Que de `knowledge/` lee. |
| `depende_de` / `alimenta_a` | **Las aristas del grafo.** Quien corre antes y quien consume su salida. |
| `acompana_a` / `invocacion` | Solo transversales: a quien acompanan y que es `automatica` (no la invoca el vendedor). |
| `rol_minimo` | Control de acceso: el rol minimo que puede ver su salida. |

---

## Como el motor lee el ruteo (la orquestacion)

El grafo de skills se reconstruye leyendo `depende_de` / `alimenta_a` / `acompana_a` de cada ficha.
Esta **verificado coherente**: cada referencia apunta a un skill que existe o a un destino valido
(`vendedor`, `cierre`). El recorrido completo de una venta:

1. **`aura-amn`** (router) conversa, identifica marca e intencion (push / pull / **preventa**) y enruta.
2. **Diagnostico**: busca la marca en `knowledge/brand-intelligence/`. Si faltan findings, los
   construye con `brandmap` / `buyermap` / `campaignmap` / `socialmap`. `briefer` = via rapida.
3. **`aura-armageddon`** orquesta sus fases internas `radiografia` -> `preventa-2027` -> tactico.
4. **Tactico**: los 4 medios (`tv-lineal` / `ctv` / `radio` / `digital-azteca`) alimentan a
   `tactico-comercial-excel`, que ensambla el Excel. La recomendacion es **siempre multimedia**.
5. **Transversales** (`apex` / `radar` / `ada`) acompanan estrategia y tactica y **traducen** su
   jerga (journeys, geo, LLMs) a lenguaje de vendedor. El vendedor **no** los invoca.
6. **Cierre**: `aura-dark` (acercamiento, comite, negociacion) -> `aura-stakeholders` (persona a persona).

El mapa completo, con las 4 reglas de orquestacion y la tabla por capa, vive en
**`dictionaries/skills-registry.md`** (generado desde el frontmatter real; reconstruible con
`gen_registry.py`).

---

## Control de acceso (no negociable)

Dos campos gobiernan que se expone y a quien:

- `rol_minimo` — el rol minimo que puede ver el activo. Va de `tier1_amplio` a `restringido_senior`.
- `sensibilidad` — `aura-dark` y `aura-stakeholders` producen **material interno de guerra**:
  nada de eso se le muestra jamas a un cliente. Los findings de inteligencia competitiva nunca se
  comparten en crudo. El motor debe filtrar por estos campos **antes** de recuperar o entregar.

---

## Como crecer el repo

- **Marca nueva** -> una carpeta en `knowledge/brand-intelligence/<marca>/` con sus findings .md.
  El script `migrate_brands.py` convierte dossiers .docx a este formato con su frontmatter.
- **Skill nuevo** -> copia `skills/_TEMPLATE/`, conserva `name` + `description`, y agrega el bloque
  de ruteo (mismos campos de la tabla de arriba). Luego corre `gen_registry.py` para resincronizar.
- **Ejemplo de output** -> ver `examples/README.md` (los binarios llevan un sidecar .md).

---

## Punteros

- `CONVENTIONS.md` — frontmatter, tiers de evidencia (certeza fuerte / hipotesis fundamentada /
  por validar), naming.
- `taxonomy/` — los valores permitidos de cada eje.
- `dictionaries/skills-registry.md` — el plano de orquestacion completo.
- `skills/_RULES.md` — la constitucion que aplica a todos los skills.
