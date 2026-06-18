---
id: sop-<nombre>
titulo: <Nombre del proceso>
tipo: <push|pull>                 # push = vender algo específico; pull = responder un brief
trigger: <qué inquietud/barrera dispara este SOP>
gate: <sala|1:1|ambos>           # a quién va el output
roles_permitidos: [comercial_kam]
skills_secuencia:                # orden con dependencias
  - skill: brandmap
    depende_de: []
outputs: [<entregables finales>]
estados: [pendiente, diagnostico, oportunidad, tactico, cierre, listo]
---

# <Nombre del proceso>

## Disparador
<Cuándo AURA enruta aquí. La barrera o necesidad concreta.>

## Secuencia de skills (la cadena)
1. <skill> — <qué produce> — depende de: <…>
2. ...

## Conocimiento requerido
<Qué tags de `knowledge/` deben estar disponibles.>

## Outputs
<Entregables y herramienta que los produce.>

## Reglas / gates
<Sala vs 1:1, RBAC, firewall — además de `skills/_RULES.md`.>

## Máquina de estados
<Estados y transiciones; qué se requiere para pasar de uno al siguiente.>
