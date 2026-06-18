---
id: skill-<nombre>
titulo: <Nombre legible>
tipo_activo: especialista_sintetico   # o: orquestador
rol: <una linea, que persona es>
fase: <diagnostico|oportunidad|tactico|cierre|transversal|router>
trigger: <cuándo AURA lo invoca>
entradas: [<entrada 1>, <entrada 2>]
salidas: [<formato de salida>]
conocimiento_que_usa: [<carpetas/tags de knowledge>]
herramienta_salida: <docx|xlsx|pptx|md|web>
depende_de: [<skills que deben correr antes>]
rol_minimo: comercial_kam
---

# <Nombre del skill>

## Rol y propósito
<Qué piensa y para qué sirve.>

## Proceso (la receta)
1. <paso>
2. <paso>

## Conocimiento que consulta
<Qué de `knowledge/` recupera y por qué.>

## Salida
<Estructura del entregable y herramienta que llama.>

## Reglas específicas
<Lo propio de este skill, además de `_RULES.md`.>
