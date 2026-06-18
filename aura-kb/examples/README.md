# examples/ — Ejemplos de outputs reales

Outputs de referencia (`.docx` / `.xlsx`) que muestran el formato y la calidad objetivo de los
entregables: materiales de cierre, materiales de lectura, propuestas. Sirven como muestra para el
motor y como plantilla viva para el equipo.

## La regla del sidecar (importante)

Los `.docx` y `.xlsx` son **binarios**: no pueden llevar el frontmatter YAML que usa el resto del
KB. Por eso **cada ejemplo viaja en pareja**:

```
examples/<skill-que-lo-produce>/
├── cierre-marca-x.docx      <- el binario (el ejemplo real)
└── cierre-marca-x.md        <- sidecar con el frontmatter (mismo basename)
```

El motor indexa el **sidecar .md** (lo lee como cualquier otra unidad del KB) y, por su campo
`archivo:`, sabe qué binario le corresponde. Copia `_PLANTILLA.md`, renómbralo igual que tu binario,
y llena el frontmatter.

## Organizacion

Una subcarpeta por **skill que produce el output** (`aura-armageddon/`, `preventa-2027/`,
`tactico-comercial-excel/`, `aura-dark/`...), para que el motor pueda atar cada ejemplo a la
capacidad que lo genera. El `proposito` (cierre / lectura / propuesta) va en el frontmatter, no en
la carpeta.

## Acceso

Respeta `rol_minimo` y `sensibilidad` igual que el resto del KB. Un ejemplo de cierre de
`aura-dark` o `aura-stakeholders` es **material interno** — nunca se le muestra a un cliente.
