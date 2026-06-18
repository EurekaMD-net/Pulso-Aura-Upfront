# CONVENTIONS · cómo se escribe todo en este KB

## 1. Frontmatter YAML (obligatorio en knowledge, sops, experiments, skills)

Cada archivo abre con un bloque `---` con los tags de `taxonomy/`. Esquema base:

```yaml
---
id: kb-<seccion>-<slug>            # único, en kebab-case
titulo: Título legible
tipo_activo: inteligencia_aplicada # ver taxonomy/tipo-activo.yaml
estabilidad: caduca                # ver taxonomy/estabilidad.yaml
sensibilidad: media                # ver taxonomy/sensibilidad.yaml
rol_minimo: comercial_kam          # ver taxonomy/rol-acceso.yaml
aislado_por_cliente: false         # firewall: true en inteligencia de marca
fuente: brandmap                   # skill o autor que lo generó
fecha: 2026-06-15
vigencia_hasta: 2026-09-30         # solo si estabilidad = caduca
---
```

Campos adicionales por sección (ver la plantilla de cada carpeta):
- **knowledge / brand-intelligence:** `marca`, `categoria`, `mercado`, `cuerpo`.
- **sops:** `tipo` (push/pull), `trigger`, `gate`, `roles_permitidos`, `skills_secuencia`.
- **experiments:** `contexto`, `nivel_certeza`, `medio`.
- **skills:** `rol`, `fase`, `entradas`, `salidas`, `herramienta_salida`, `depende_de`.

## 2. Tiers de evidencia (disciplina epistémica, no negociable)

Toda afirmación en `knowledge/` y `experiments/` se marca con uno de:

- `CERTEZA_FUERTE` — dato auditado o verificable.
- `HIPOTESIS_FUNDAMENTADA` — inferencia con evidencia sólida.
- `HIPOTESIS_POR_VALIDAR` — supuesto que requiere prueba propia.

Nunca se presenta una hipótesis como hecho.

## 3. Naming
- Carpetas en inglés; contenido en español. (Convención de repo; cambiable.)
- Archivos en `kebab-case.md`. Plantillas con prefijo `_`.
- Marca en `brand-intelligence/<slug-marca>/` con un archivo por cuerpo `C1..C6`.

## 4. Reglas que viven en código, no en prosa
El motor debe hacer cumplir, no solo sugerir: `aislado_por_cliente` (firewall entre marcas),
el `gate` sala/1:1 de los SOPs, y el `rol_minimo` (RBAC). Ver `skills/_RULES.md`.
