---
id: sop-cierre-preventa-2027
titulo: Cierre Preventa 2027 (workflow canónico)
tipo: push
trigger: Defender/crecer volumen de una marca-ancla antes del upfront del competidor.
gate: ambos
roles_permitidos: [comercial_kam, restringido_senior]
skills_secuencia:
  - skill: brandmap
    depende_de: []
  - skill: buyermap
    depende_de: []
  - skill: campaignmap
    depende_de: []
  - skill: socialmap
    depende_de: []
  - skill: briefer
    depende_de: [brandmap, buyermap, campaignmap, socialmap]
  - skill: radiografia
    depende_de: [briefer]
  - skill: preventa-2027
    depende_de: [radiografia]
  - skill: tv-lineal-tactical
    depende_de: [preventa-2027]
  - skill: ctv-tactical
    depende_de: [preventa-2027]
  - skill: radio-tactical
    depende_de: [preventa-2027]
  - skill: digital-azteca-tactical
    depende_de: [preventa-2027]
  - skill: aura-dark
    depende_de: [preventa-2027]
  - skill: aura-stakeholders
    depende_de: [aura-dark]
outputs: [paquete_cierre_docx, plan_tactico_xlsx, plan_sala, plan_por_persona]
estados: [pendiente, diagnostico, oportunidad, tactico, cierre, listo]
---

# Cierre Preventa 2027 — workflow canónico

Orquestado por **AURA ARMAGEDDON** (diagnóstico → oportunidad → táctico) y cerrado por
**AURA DARK → STAKEHOLDERS**.

## Disparador
Marca-ancla con volumen en riesgo o con whitespace de campaña, antes del upfront enemigo.
Puede dispararlo una alerta de JARVIS (Pulso): "vas corto con la cuenta X".

## Secuencia (resumen)
1. **Diagnóstico:** brandmap · buyermap · campaignmap · socialmap → briefer consolida.
2. **Oportunidad:** radiografia (whitespaces) → preventa-2027 (qué de AMN lo resuelve).
3. **Táctico:** los cuatro especialistas de medio definen propiedades, bundles, KPIs.
4. **Cierre:** aura-dark (comité como bloque) → aura-stakeholders (persona por persona).

## Conocimiento requerido
`knowledge/doctrine` (efectividad/ISE, funnel), el dosier de la marca (C1–C6),
`knowledge/platform-intelligence` y `knowledge/catalogs`.

## Reglas / gates
- El output táctico/argumento va a **sala** (objetivo compartido).
- El output de STAKEHOLDERS es **1:1** y `restringido_senior`: nunca al grupo ni al cliente.
- Firewall por cliente activo en todo el dosier de marca.

## Máquina de estados
`pendiente → diagnostico → oportunidad → tactico → cierre → listo`.
No se avanza de un estado sin completar las dependencias del anterior.
