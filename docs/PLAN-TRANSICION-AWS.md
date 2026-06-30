# Plan de Transición a AWS — Pulso-Aura (Azteca-Aura) CRM

**Origen:** Hostinger VPS, servicio systemd `agentic-crm` (`tsx engine/src/index.ts`, Node 22, puerto 3000)
**Destino:** AWS corporativo — host EC2 + Amazon Bedrock (Qwen3-32B gestionado). Perfil de plataforma: Snowflake (datos) · Microsoft 365 / Graph (workspace, reemplaza Google) · Slack (canal único, reemplaza WhatsApp) · Amazon Bedrock (inferencia, reemplaza Groq/Fireworks).
**Fecha:** 2026-06-30 · **Repo:** `EurekaMD-net/Pulso-Aura-Upfront`

---

## 1. Propósito y cómo usar este plan

Este documento es **la secuencia que el equipo debe ejecutar**, en orden, con compuertas explícitas de paro/avance (STOP/GO) entre cada paso de riesgo. **No** re-explica la arquitectura: para el detalle técnico de cada componente (topología VPC, endpoints PrivateLink, capa de inferencia, modelo de datos, inventario de egress, registro de riesgos) la referencia única es el documento técnico hermano `docs/AWS-EC2-BEDROCK-TECHNICAL-MAP.md`. Cada vez que aquí se pide "hacer X", el "cómo" y el "por qué" viven en la sección correspondiente de ese mapa, que se cita entre paréntesis (por ejemplo, "ver §5.2 del mapa"). Lea primero las secciones 2 a 6 de este plan (principios, compuertas, decisiones, trabajos de largo plazo, roles) y solo después comience la sección 7 (la secuencia por fases). **Ninguna fase de producción inicia antes de que su compuerta esté en verde.**

---

## 2. Principios de una transición sin sobresaltos

Estos cuatro principios gobiernan todas las decisiones de ejecución. Si una acción los contradice, se detiene la acción, no el principio.

1. **Ninguna fase de producción empieza antes de pasar su compuerta.** Cada fase (F0–F4) tiene criterios de aceptación que son condiciones de avance, no metas opcionales. Una fase con su compuerta en rojo no avanza aunque el calendario presione. El orden F0 → F1 → F2 → F3 → F4 es estricto: F2 no se agenda hasta que F0 esté verde.

2. **Paridad de comportamiento sobre una COPIA de `crm.db`, antes de cualquier tráfico real.** La validación de inferencia, embeddings, RAG y reglas de negocio (firewall de marcas, RBAC) se hace en F2 contra una **copia** del store SQLite sobre EBS, con un conjunto de consultas fijo. El `crm.db` de producción del VPS sigue siendo la fuente de verdad hasta F4. No se valida sobre el dato vivo.

3. **Conciencia del punto de no retorno.** La **primera escritura en vivo de Slack** sobre el `crm.db` de AWS es irreversible: **no existe sincronización inversa hacia el VPS** (ver R-23 y §13-F4 del mapa). Cualquier rollback posterior a ese instante pierde las escrituras de negocio hechas del lado AWS. El rollback solo es seguro **antes** de la primera escritura viva.

4. **El cambio de canal WhatsApp → Slack es big-bang.** No hay entrega dual posible: Slack usa IDs de canal propios y WhatsApp usa JIDs; el tráfico entrante en vivo **no puede espejearse a ambos stacks** (ver §13 caveat y §8 del mapa). "Corrida en paralelo" significa paridad sobre corpus fijo (F2) más un piloto escalonado de Slack (F3), **no** doble entrega. Hay un instante de corte duro inevitable; se planifica, no se evita.

---

## 3. Las CUATRO compuertas duras (STOP/GO)

Estas cuatro compuertas deben quedar en **verde** antes de habilitar producción. Están arriba de todo a propósito: si cualquiera está en rojo o ámbar, **no se avanza a la fase que depende de ella**. Aquí están las cuatro con qué se prueba, criterio de aprobación, y qué hacer si falla.

### Compuerta 1 — Paridad de `tool_calls` en bedrock-mantle para `qwen.qwen3-32b` (bloquea F2)

- **Qué se prueba:** que el endpoint `bedrock-mantle` devuelve bloques `tool_calls` con forma OpenAI bien formados **y** entrega deltas de `tool_call` por índice en streaming SSE, usando los esquemas reales de las ~76 herramientas en español del agente. Se corre `scripts/inference-probe.ts` e `inference-bench.ts` contra el endpoint mantle en vivo (ver §4.1 y R-1 del mapa).
- **Criterio de aprobación:** round-trip de `tool_calls` verde sobre los esquemas reales; `inferWithTools()` y `parseSSEStream()` reciben los deltas que esperan; las herramientas que escriben en BD (`registrar_actividad`, `cerrar_propuesta`) aterrizan sus efectos.
- **Si falla:** **no se agenda F2.** Anteponer Bedrock con `aws-samples/bedrock-access-gateway` (mapea tools de OpenAI a `toolConfig` de Converse) **o** añadir un adaptador acotado de Converse nativo en el seam de proveedor existente — sin reescribir `inference-adapter.ts`. Esta es la decisión D-tools.

### Compuerta 2 — Residencia del camino de inferencia real (bloquea F2)

- **Qué se prueba:** que el camino caliente de inferencia (`bedrock-mantle.<region>.api.aws`) es alcanzable de forma **privada** desde una subred sin IP pública. PrivateLink está confirmado para `bedrock-runtime`, **no** para `bedrock-mantle` (ver §5.2, R-2 y D1 del mapa).
- **Criterio de aprobación:** se confirma un servicio PrivateLink de mantle alcanzable desde subred sin IP pública; o se adopta el camino alternativo verificado como privado.
- **Si falla (mantle sin PrivateLink):** adoptar el camino gateway: anteponer Bedrock con `bedrock-access-gateway` llamando a **`InvokeModel`/Converse nativo sobre el endpoint PrivateLink de `bedrock-runtime`** (que sí es privado), y apuntar `INFERENCE_PRIMARY_URL` al gateway in-VPC. Esta opción resuelve además la Compuerta 1 de un solo movimiento. Esta es la decisión D1.

### Compuerta 3 — Recarga en caliente de la API key de Bedrock (≤12h) (bloquea estabilidad de producción)

- **Qué se prueba:** que al escribir una nueva Bedrock API key (las keys de corto plazo expiran en ≤12h), el proceso `tsx` en ejecución la **toma sin reinicio**. Hoy `loadProviders()` lee `process.env` fijado al arranque y `readSecrets()` lo congela por spawn — escribir la nueva key a Secrets Manager o `.env` **no** actualiza el proceso vivo (ver §5.5, R-9 y D-auth del mapa).
- **Criterio de aprobación:** una rotación de key no produce ningún 401 de inferencia ni requiere `systemctl restart`; las solicitudes en vuelo no se cortan.
- **Si falla:** implementar el hot-reload (un sidecar de refresco escribe la key a archivo/secret; `callProvider()` la re-lee por solicitud o vía handler `SIGHUP`). Alternativa registrada: usar una **long-term Bedrock API key** en Secrets Manager (más simple, pero contraviene la guía de AWS de keys de corto plazo — tradeoff deliberado). Esta es la decisión D-auth.

### Compuerta 4 — Ventana de corte / punto de no retorno del canal (bloquea F4)

- **Qué se prueba:** que la secuencia de corte de F4 (congelar `crm.db` → snapshot/`.backup` final → restore a EBS → re-embed delta → re-registro de Slack → flip) está ensayada, cronometrada y dentro del RTO acordado, y que el punto de no retorno está definido y comunicado.
- **Criterio de aprobación:** restore de prueba verificado dentro del RTO; el piloto escalonado de Slack (F3) aprobado; el punto de no retorno (primera escritura viva de Slack en el `crm.db` de AWS) entendido y aceptado por el operador; plan de comunicación y capacitación a vendedores listo.
- **Si falla:** no se ejecuta el flip. El VPS permanece como fuente de verdad. Se cierra la brecha (ensayar de nuevo el restore, completar el piloto, ajustar el RTO) y se reintenta la ventana. El rollback solo es válido **antes** de la primera escritura viva.

---

## 4. Decisiones que DEBEN cerrarse ANTES de iniciar

Estas decisiones de §15 del mapa bloquean el arranque o el avance entre fases. Deben quedar resueltas y firmadas antes de comenzar la fase que cada una bloquea. (Decisiones de menor urgencia — D3 región es excepción, ver abajo — pueden cerrarse durante F0/F1, pero estas siete son condición de partida.)

Tabla — Decisión | Responsable | Bloquea (celdas en texto plano):

| Decisión                                                                                                                        | Responsable                 | Bloquea                                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| D1 — Residencia: tiene bedrock-mantle servicio PrivateLink, o se adopta gateway hacia InvokeModel privado                       | Equipo Infra AWS            | F2                                                                                                                  |
| D-auth — Modelo de key Bedrock: hot-reload del key de corto plazo (≤12h) vs long-term key                                       | Equipo Infra AWS + Operador | Estabilidad de inferencia en produccion                                                                             |
| D-tools — Paridad de tool_calls en mantle: directa vs gateway/Converse adapter                                                  | Equipo Infra AWS            | F2                                                                                                                  |
| D2 — Backend de Whisper: self-host CPU in-VPC vs Amazon Transcribe (adapter + opt-out + transcoder OGG/Opus)                    | Operador + Equipo Infra AWS | Dimensionamiento de instancia EC2                                                                                   |
| D-doc — MS365 createDocument al lanzamiento: mail+calendar+file-read primero con doc-gen fast-follow, vs paridad completa dia-1 | Operador                    | Cronograma de cutover (F3/F4)                                                                                       |
| D3 — Region AWS (us-east-1 asumida)                                                                                             | Operador + Equipo Infra AWS | URL de mantle, disponibilidad in-region de Qwen3-32B, region de endpoints, re-precio de tokens (cierra antes de F0) |
| D-snow — Superficie de ejecucion de Snowflake: host-side vs in-container                                                        | Equipo Infra AWS            | Capa factual P4 sobre AWS (F2)                                                                                      |

Notas:

- **D3 (región)** es la primera en cerrarse: define la URL de mantle que F0 prueba, por lo que se resuelve **antes de F0**, no durante.
- **D2 (Whisper)** se cierra antes de dimensionar la instancia EC2 (F1), porque la opción de self-host GPU es la única que reintroduciría una GPU al plan (ver §4.4 del mapa). Las opciones sin GPU (self-host CPU in-VPC, o Amazon Transcribe) mantienen el host CPU-only.
- Las demás decisiones de §15 (D4 concurrencia, D5 Hindsight, D6 modelo de embedding, D7 facts del model-card, D-net postura de firewall, D-gov gobernanza de datos, D-rpo RPO/RTO, D8 exposición dashboard, D9 run-user, D10 AMI, D11 Jarvis, D12 tipo de org Slack, D13 ventana de freeze) no bloquean el arranque pero deben cerrarse dentro de la fase donde aplican; se referencian en los pasos de cada fase en la sección 7.

---

## 5. Trabajos de "largo plazo" a solicitar el Día 1 (en paralelo a todo)

Estos trámites tienen tiempos de espera externos (aprobaciones corporativas, consentimiento de identidad, cuotas de proveedor). Se **solicitan el primer día del proyecto**, en paralelo a F0/F1, porque su latencia — no su esfuerzo — es lo que puede bloquear el lanzamiento (ver R-25 del mapa).

- [ ] **Aprobación de la app de Slack** ante el org-admin de **Enterprise Grid**. Las apps de Socket Mode no se listan en Marketplace pero **sí** se permiten para distribución interna; se radica al inicio del proyecto (ver §7.1 del mapa). Responsable: IT-Identidad (admin de Slack) con apoyo del Operador.
- [ ] **Registro de la app de Entra ID** (Microsoft Graph) + **scoping con `New-ApplicationAccessPolicy`** (o RBAC for Applications) limitando a buzones/sitios de las personas. El permiso de aplicación `Mail.Send`/`Calendars` otorga enviar-como-CUALQUIER-buzón de todo el tenant; el scoping es **compuerta de lanzamiento**, no follow-up (ver §7.2 y R-7 del mapa). Responsable: IT-Identidad (admin de Entra).
- [ ] **Aumento de cuota TPM/RPM de Bedrock** para `qwen.qwen3-32b` en la región elegida, y decisión sobre **Provisioned Throughput** si las ráfagas de ventas arriesgan 429 (ver §8 y R-20 del mapa). Responsable: Equipo Infra AWS.
- [ ] **Elección de región** (D3) finalizada y comunicada. Responsable: Operador + Equipo Infra AWS.
- [ ] **Política de opt-out de servicios de IA** a nivel AWS Organizations para **Amazon Transcribe** (si se usa) y postura explícita para **Amazon Bedrock** (model-invocation logging on/off, retención, clasificación de datos). Transcribe puede almacenar/usar audio sin opt-out; Bedrock necesita una postura explícita (ver §5.7, D-gov del mapa). Responsable: Equipo Infra AWS + Operador.

---

## 6. Roles y responsabilidades

Tres roles ejecutan este plan. Cada paso de la sección 7 nombra al responsable principal.

**Equipo Infra AWS** — Propietario de la landing zone y de todo lo que vive dentro de la cuenta AWS: VPC, subredes, NAT + AWS Network Firewall, endpoints PrivateLink, Security Groups, rol IAM de instancia, EC2 + EBS, Docker + `crm-net`, Secrets Manager + entrypoint shim, ECR + CodeBuild, CloudWatch + canary, snapshots DLM + backups S3, cuotas de Bedrock, validación de DNS de contenedor, PrivateLink de Snowflake. Ejecuta las compuertas 1, 2 y 3.

**IT-Identidad (admins de Entra + Slack)** — Propietario de la identidad corporativa: registro y consentimiento de la app de Entra ID, `ApplicationAccessPolicy` scoping, reconciliación de `persona.email` a UPN verificado de Entra, aprobación de la app de Slack en Enterprise Grid, instalación de la app de Slack por usuario. Sin estos, todas las herramientas de MS365 dan 404 y el canal Slack no arranca.

**Operador / dueño del producto** — Propietario de las decisiones de negocio y del corpus: cierra las decisiones de §15 que le competen (D2, D-doc, D5, D6, etc.), valida la paridad de comportamiento en F2, dirige el piloto escalonado de Slack, ejecuta la capacitación de vendedores, autoriza el flip de F4 y acepta el punto de no retorno. Es quien dice GO/STOP en cada compuerta de negocio.

---

## 7. La secuencia por fases F0 → F4

Sigue el contenido de §13 del mapa, hecho accionable paso a paso. **Las fases son estrictamente ordenadas.** Cada fase declara: Objetivo · Pre-requisitos · Pasos ordenados · Criterios de aceptación (la compuerta a pasar) · Rollback · Responsable.

---

### F0 — Prueba de inferencia (sin tráfico de producción)

**Objetivo:** probar que la capa de generación funciona y es privada, antes de tocar nada de infraestructura de producción.

**Pre-requisitos:**

- D3 (región) cerrada — define la URL de mantle a probar.
- Acceso habilitado a Amazon Bedrock con `qwen.qwen3-32b` en la región elegida.
- Los esquemas reales de las ~76 herramientas en español disponibles para la sonda.

**Pasos ordenados:**

1. Habilitar Bedrock Qwen3-32B en la cuenta y región.
2. Correr `scripts/inference-probe.ts` e `inference-bench.ts` contra el endpoint `bedrock-mantle` en vivo, con los esquemas reales de herramientas en español.
3. Verificar bloques `tool_calls` bien formados **y** deltas de `tool_call` por índice en streaming SSE (Compuerta 1).
4. Medir latencia bajo concurrencia y documentarla.
5. Confirmar si `bedrock-mantle` tiene PrivateLink desde una subred sin IP pública; elegir el camino privado: mantle-PL directo **vs** gateway → `InvokeModel` nativo sobre `bedrock-runtime` (Compuerta 2 / D1).
6. Confirmar la perilla de desactivación de thinking-mode que mantle honra para Qwen3 (`reasoning_effort` vs `enable_thinking` vs `extra_body`) y los límites exactos de contexto/salida del model-card (D7).

**Criterios de aceptación (compuerta para avanzar):**

- [ ] Round-trip de `tool_calls` verde sobre esquemas reales (Compuerta 1).
- [ ] Camino de inferencia privado elegido y alcanzable (Compuerta 2).
- [ ] Latencia documentada.
- [ ] Perilla de thinking-mode y límites de contexto confirmados.

**Rollback:** N/A — no hay tráfico de producción ni recursos de estado en F0.

**Responsable:** Equipo Infra AWS (con apoyo del Operador para validar el comportamiento de las herramientas).

---

### F1 — Landing zone (VPC + host + seguridad, sin tráfico de producción)

**Objetivo:** levantar la base de infraestructura completa y endurecida, sin tráfico de producción.

**Pre-requisitos:**

- F0 con compuerta verde (camino de inferencia privado elegido).
- D2 (Whisper) cerrada — define el dimensionamiento de la instancia.
- D9 (run-user), D10 (AMI) decididas antes de aprovisionar el host.

**Pasos ordenados (incorpora los ítems de infra de §12 del mapa):**

1. Crear VPC en 2 AZ; subredes privadas (host sin IP pública + ENIs de endpoints) y públicas (NAT Gateway + AWS Network Firewall).
2. Crear los endpoints de interfaz (PrivateLink, con Private DNS): `bedrock-runtime`, `secretsmanager`, `ssm` + `ssmmessages` + `ec2messages`, `transcribe` + `transcribestreaming`, `ecr.api` + `ecr.dkr`, `logs`, `kms`, `sts`; endpoint gateway (gratis) para `s3`; PrivateLink de Snowflake vía `SYSTEM$GET_PRIVATELINK_CONFIG` + zona hospedada privada.
3. Configurar AWS Network Firewall con allow-list de egress por FQDN: `slack.com`/`*.slack.com`, `graph.microsoft.com`, `login.microsoftonline.com`, `smtp.office365.com` (solo si se construye envío SMTP); **DENY explícito de `api.anthropic.com`**. (D-net define postura/AZ del firewall.)
4. Crear Security Groups (instancia sin ingress desde internet; per-endpoint 443 solo desde el SG de instancia) + rol IAM de instancia de mínimo privilegio (ver §5.4 del mapa).
5. Aprovisionar EC2 (m7i, x86_64, Ubuntu 24.04 o AL2023 según D10, subred privada) con **IMDSv2 y hop-limit=1**; bloquear `169.254.169.254` desde `crm-net` (regla bridge/iptables).
6. Adjuntar EBS gp3 100 GB / 3000 IOPS y **correr load-test de IOPS** bajo fan-out con el patrón DELETE-journal + `busy_timeout=5s` (R-13); ajustar IOPS si surge latencia de escritura SQLite.
7. Instalar Docker CE + Node 22 + `amazon-ecr-credential-helper`; provisionar `crm-net` al arranque (oneshot / `ExecStartPre docker network create crm-net || true`); ordenar el servicio con `After=docker.service network-online.target Requires=docker.service`.
8. Crear repos ECR + pipeline CodeBuild (build/push con **digest pinneado**, no `:latest`) + permisos ECR en el instance profile; mantener `LABEL keep="true"` en ambos Dockerfiles y cualquier prune cron con `--filter "label!=keep=true"` (R-11).
9. Migrar secretos a Secrets Manager + entrypoint shim que produce el `EnvironmentFile` del unit systemd; portar el unit verbatim (WorkingDirectory=raíz del repo, ExecStart=`tsx engine/src/index.ts`, `TZ=America/Mexico_City`, `Restart=on-failure RestartSec=10`).
10. Dejar **sin set** `ANTHROPIC_API_KEY`/`CLAUDE_CODE_OAUTH_TOKEN`/`ANTHROPIC_AUTH_TOKEN` (el proxy arranca keyless; cualquier llamada da 502) y confirmar el DENY de firewall de `api.anthropic.com` (R-26).
11. Instalar el agente CloudWatch (journald + stdout de contenedores) y desplegar el **canary de round-trip sintético** (EventBridge → mensaje sintético Slack → contenedor agente → Bedrock → respuesta); alarmar sobre el canary, **no** sobre `/health` (ver §8 del mapa).
12. Validar la cadena de DNS de contenedor: desde un contenedor agente vivo en `crm-net`, confirmar que `bedrock-*`/`transcribe`/`secretsmanager` resuelven a las IPs privadas de los endpoints (R-15, §5.6).

**Criterios de aceptación (compuerta para avanzar):**

- [ ] Host alcanzable vía SSM Session Manager (sin bastión).
- [ ] Los secretos resuelven desde Secrets Manager.
- [ ] **Egress observado = solo allow-list**; `api.anthropic.com` denegado (verificado).
- [ ] Harness del canary corre.
- [ ] DNS de contenedor resuelve los endpoints de forma privada.
- [ ] IMDSv2 hop-limit=1 confirmado; `169.254.169.254` bloqueado desde `crm-net`.

**Rollback:** teardown de la landing zone (no hay estado de producción que perder).

**Responsable:** Equipo Infra AWS.

---

### F2 — Paridad de datos + inferencia (shadow sobre una COPIA de `crm.db`)

**Objetivo:** demostrar paridad de comportamiento sobre un corpus fijo, sin tocar el dato vivo del VPS.

**Pre-requisitos:**

- F1 con compuerta verde.
- **Compuertas 1, 2 y 3 verdes** (tool_calls, residencia, hot-key-reload) — son condición de inicio de F2.
- D-snow (superficie de ejecución de Snowflake) cerrada; D5 (continuidad Hindsight) y D6 (modelo de embedding) decididas.

**Pasos ordenados:**

1. Hacer una **copia** de `crm.db` del VPS a EBS (vía snapshot/restore de EBS o `sqlite3 .backup`); **verificar conteos de tablas y filas** pre/post, en especial `anunciante_snowflake_map`, `anunciante_marca`, `cierre_meta`, `crm_documents` (la llave de join de Snowflake viaja **dentro** de `crm.db`; ver §6.1 del mapa).
2. Desplegar host + contenedores efímeros + sidecar Hindsight sobre la copia de `crm.db`.
3. Repointar inferencia: `INFERENCE_PRIMARY_URL` (mantle o gateway in-VPC según D1), `INFERENCE_PRIMARY_MODEL=qwen.qwen3-32b`, key vía Secrets Manager con **hot-reload activo** (Compuerta 3). Bajar `INFERENCE_CONTEXT_LIMIT≈30000`, `INFERENCE_TOKEN_BUDGET≈24000`, `INFERENCE_MAX_TOKENS≤8000` (ventana 32K, R-4). Añadir la rama Bedrock para desactivar thinking-mode (R-17).
4. Repointar embeddings: gateway `/v1/embeddings` (config) **o** adaptador nativo `InvokeModel` en `crm/src/embedding.ts`; modelo Titan Text Embeddings V2 @ 1024 dims (sin cambio de schema) o Cohere Embed Multilingual según D6 (validar con regresión de recall en español).
5. Repointar transcripción según D2: self-host Whisper in-VPC (config-only) **o** adaptador Amazon Transcribe es-MX + transcoder OGG/Opus + opt-out (R-16).
6. Repointar el egress LLM propio del sidecar Hindsight a Bedrock (`HINDSIGHT_API_LLM_*`); incluirlo/excluirlo explícitamente del allow-list.
7. Conectar Snowflake en read-only vía PrivateLink (rol read-only + network policy al VPCE + key-pair auth, PEM en Secrets Manager); **quitar Snowflake del allow-list de NAT** (ver §6.5). Si D-snow resolvió "in-container": añadir `SNOWFLAKE_*` al allowlist de `readSecrets()` y hacer el VPCE alcanzable desde `crm-net` (R-18).
8. Ejecutar el **re-embed por tabla sombra**: construir `crm_vec_embeddings_new`, re-embeber los **17,986 chunks / 971 documentos** en ella usando una **key dedicada de largo plazo** (R-19, para que un job que exceda el TTL de 12h no envenene la tabla con vectores trigram), correr **regresión de recall** (doc conocido → hit esperado) y **swap atómico** (rename) al final. La ventana de recall degradado queda acotada al instante del swap, no a todo el re-embed (ver §6.2).
9. Neutralizar **QuickChart**: self-host en `crm-net` o desactivar; verificar **cero egress** de valores de negocio a `quickchart.io` (R-3).
10. Correr el harness de paridad sobre el conjunto de consultas fijo + las suites de firewall de marcas y RBAC.

**Criterios de aceptación (compuerta para avanzar):**

- [ ] Paridad de comportamiento sobre el corpus fijo.
- [ ] Suites de firewall de marcas y RBAC verdes.
- [ ] Canary verde.
- [ ] Regresión de recall pasa.
- [ ] Egress de Bedrock observado = privado.
- [ ] QuickChart neutralizado (cero egress verificado).

**Rollback:** el VPS permanece como sistema de registro; se descarta el stack AWS de F2 sin pérdida (todo se hizo sobre una copia).

**Responsable:** Equipo Infra AWS (infra/inferencia) + Operador (validación de paridad de negocio).

---

### F3 — Build del cutover de canal + workspace (Slack + MS365)

**Objetivo:** dejar Slack y Microsoft 365 funcionales y pilotados, todavía con WhatsApp/Google como red de seguridad.

**Pre-requisitos:**

- F2 con compuerta verde.
- Trabajos de largo plazo (sección 5) avanzados: app de Slack aprobada en Enterprise Grid; app de Entra registrada y consentida con `ApplicationAccessPolicy` scoping.
- D-doc (createDocument al lanzamiento) cerrada; D12 (tipo de org Slack + change management) decidida.

**Pasos ordenados:**

1. Promover el canal Slack: tomar el `SlackChannel` (Bolt Socket Mode) del skill `add-slack` **no promovido** y **hacer hand-merge** al orquestador vivo (`index.ts` ~600 líneas) — **no** correr `apply-skill.ts` (apunta a un `index.ts` obsoleto de 499 líneas; ver §7.1). Endurecer: paginación acotada de metadata, manejo de notas de voz + archivos (descarga vía bot token → `transcribe()`, espejo de `whatsapp.ts:244-323`, añadir scope `files:read`), formateador mrkdwn + split inteligente.
2. Mapear persona → canal: ligar cada `slack:Cxxxx` a una persona CRM para que el agente actúe como el AE correcto y use ese `persona.email` en las herramientas de workspace.
3. Decidir routing thread-aware (`thread_ts`) como v1 o v1.1 con stakeholders (R-24; el skill aplana respuestas al root del canal).
4. Configurar `SLACK_ONLY=true`; mantener WhatsApp instalado durante la transición, retirar solo tras probar paridad.
5. Construir `crm/src/workspace/microsoft/auth.ts` sobre `@azure/msal-node` `ConfidentialClientApplication` (client-credentials, cache+refresh de token in-memory) + `@microsoft/microsoft-graph-client`; actuar "como" persona vía `/users/{upn}/...` bajo permisos de Aplicación. Reemplazar el `throw "not yet implemented"` de `getProvider()` (provider.ts:20-39).
6. Implementar las familias de herramientas en el orden de D-doc: **primero mail + calendar + file-read**; document-generation (`.docx`/`.pptx`/Excel workbook API) como **fast-follow** (R-21; es el ítem que puede deslizar todo el cutover si se exige día-1).
7. Añadir `MICROSOFT_TENANT_ID/CLIENT_ID/CLIENT_SECRET` + `WORKSPACE_PROVIDER` al allowlist de `readSecrets()` del contenedor (si no, las herramientas in-container ven un workspace no configurado).
8. **Reconciliar `persona.email` → UPN de Entra** (IT-Identidad): si no coinciden, toda llamada Graph `/users/{upn}` da 404 y rompe todas las herramientas MS365 a la vez (R-8); añadir validación de arranque `User.Read.All`.
9. Confirmar que el `ApplicationAccessPolicy` scoping está activo **antes** de go-live (R-7; el permiso de app envía-como-cualquier-buzón sin scoping).
10. Ejecutar el **piloto escalonado**: un subconjunto de AEs sobre Slack (e2e incluyendo voz; MS365 send-mail/read-file/calendar), con la app de Slack instalada por usuario.

**Criterios de aceptación (compuerta para avanzar):**

- [ ] Slack e2e (incluida transcripción de voz) verde.
- [ ] MS365 send-mail, read-file y calendar funcionales.
- [ ] Todos los UPN de personas resuelven (validación de arranque pasa).
- [ ] `ApplicationAccessPolicy` scoping confirmado.
- [ ] Piloto escalonado de AEs aprobado por el Operador.

**Rollback:** re-habilitar WhatsApp vía la interfaz `Channel` compartida; Google permanece como fallback. **Esto solo es válido pre-PONR** (antes del flip de F4).

**Responsable:** Equipo Infra AWS + IT-Identidad (identidad/scoping) + Operador (piloto y aprobación).

---

### F4 — Cutover de producción (AWS se vuelve el sistema de registro)

**Objetivo:** hacer el flip controlado: AWS pasa a ser la fuente de verdad.

**Pre-requisitos:**

- F3 con compuerta verde (piloto aprobado).
- **Las 4 compuertas en verde.**
- D-rpo (RTO/RPO) y D13 (presupuesto de ventana de freeze) cerradas.
- Plan de comunicación y capacitación a vendedores listo (ver sección 8).

**Pasos ordenados (la secuencia exacta de freeze está en la sección 8):**

1. **Congelar `crm.db`** en el VPS (detener escrituras de negocio).
2. Tomar el **snapshot/`.backup` final** del `crm.db` congelado.
3. **Restore** a EBS en AWS.
4. **Re-embed delta** si hubo cambios desde el re-embed de sombra de F2.
5. **Re-registro de Slack** (canales/personas para los IDs de Slack en `messages.db`; recordar que `registered_groups`/`chats`/`messages`/`sessions` son net-new para Slack, ver §6.3).
6. **Flip** a vivo.
7. Verificar **test-restore dentro del RTO** y correr e2e real con un Director/Gerente; reconciliar cifras de Snowflake con su provenance.

**Criterios de aceptación:**

- [ ] Restore de prueba verificado dentro del RTO.
- [ ] Cifras de Snowflake reconciliadas con provenance.
- [ ] e2e real (Director/Gerente) pasa.

**Punto de no retorno (PONR):** **la primera escritura viva de Slack al `crm.db` de AWS.** No hay sincronización inversa al VPS; cualquier rollback posterior pierde las escrituras de negocio del lado AWS (R-23).

**Rollback (solo ANTES de la primera escritura viva):** mantener el VPS caliente; apagar las herramientas de Snowflake vía `isSnowflakeConfigured`; re-habilitar WhatsApp/Google. Después del PONR no hay rollback — el corte es duro.

**Responsable:** Operador (autoriza el flip y acepta el PONR) + Equipo Infra AWS (ejecuta freeze/snapshot/restore/flip) + IT-Identidad (re-registro de Slack).

---

## 8. Ventana de corte (freeze) y cambio big-bang a Slack

### 8.1 Secuencia exacta de F4 (orden estricto)

1. **Congelar `crm.db`** en el VPS — detener el servicio `agentic-crm` o poner el bot en modo solo-lectura; ninguna escritura nueva de negocio a partir de aquí.
2. **Snapshot / `.backup` final** — `VACUUM INTO` / `.backup` del `crm.db` congelado; verificar checksum.
3. **Restore a EBS** — colocar el `crm.db` en el volumen EBS gp3 de AWS; **verificar conteos de tablas y filas** contra el snapshot (esp. las tablas de la llave de join de Snowflake).
4. **Re-embed delta** — re-embeber solo los chunks nuevos/cambiados desde el re-embed de sombra de F2, en la tabla de vectores; correr la regresión de recall acotada.
5. **Re-registro de Slack** — crear `registered_groups`/`chats`/`sessions` para los IDs de canal de Slack (estado net-new; los datos WhatsApp-JID no migran), aplicar el mapeo persona → canal.
6. **Flip** — habilitar `SLACK_ONLY=true`, apuntar tráfico vivo al stack AWS.
7. **Verificación post-flip** — test-restore dentro del RTO; e2e real Director/Gerente; reconciliación de Snowflake.

### 8.2 Definición del punto de no retorno

El PONR es **el instante de la primera escritura viva de Slack al `crm.db` de AWS** (paso 6, en el momento que un vendedor real genera una actividad/cierre). A partir de ese instante:

- No existe sync inverso hacia el VPS.
- Cualquier rollback pierde las escrituras de negocio hechas en AWS.
- El rollback de §7-F4 **solo** es válido antes de este instante.

Por eso la ventana de freeze debe ser corta y ensayada: minimiza el tiempo entre congelar el VPS y completar el flip, y la ventana de exposición a un rollback costoso.

### 8.3 Comunicación y capacitación para el cambio big-bang a Slack

El cambio de WhatsApp a Slack es human-facing y sin doble entrega (Principio 4). Se planifica como gestión de cambio, no solo técnica (ver §8 y R-25 del mapa):

- [ ] **Piloto escalonado primero** (ya cubierto en F3): un subconjunto de AEs opera en Slack y aprueba antes del cutover total. No hay flip masivo sin piloto verde.
- [ ] **Capacitación a vendedores**: sesión(es) sobre cómo interactuar con el agente en Slack (menciones, hilos según la decisión v1/v1.1 de routing, notas de voz, archivos).
- [ ] **Instalación de la app de Slack por usuario**: coordinada con IT-Identidad; cada AE debe tener la app instalada antes de su corte.
- [ ] **Comunicación del corte**: fecha/hora de la ventana de freeze, qué esperar (breve indisponibilidad durante el freeze), a quién escalar.
- [ ] **Plan de soporte post-flip**: canal de incidencias y responsable de guardia durante las primeras horas tras el PONR.

---

## 9. Checklist final "Listo para Producción"

No se ejecuta el flip de F4 hasta que **todas** estas casillas estén marcadas. Consolida las cuatro compuertas y los controles de seguridad/datos.

**Las 4 compuertas duras:**

- [ ] Compuerta 1 — Paridad de `tool_calls` (y deltas de streaming) en `bedrock-mantle` para `qwen.qwen3-32b`, verde sobre esquemas reales en español.
- [ ] Compuerta 2 — Residencia: camino de inferencia real confirmado como **privado** (PrivateLink de mantle, o gateway → `InvokeModel` privado sobre `bedrock-runtime`).
- [ ] Compuerta 3 — Recarga en caliente de la Bedrock API key (≤12h) probada: rotación sin 401 ni reinicio.
- [ ] Compuerta 4 — Ventana de corte / PONR ensayada, cronometrada y dentro del RTO; piloto de Slack aprobado.

**Red y seguridad:**

- [ ] Egress observado = lista blanca (solo Slack/Graph/login.microsoftonline.com, y SMTP O365 si se construyó).
- [ ] `api.anthropic.com` denegado en AWS Network Firewall (verificado) y keys Anthropic sin set.
- [ ] IMDSv2 con hop-limit=1; `169.254.169.254` bloqueado desde `crm-net`.
- [ ] QuickChart neutralizado (self-host o desactivado; cero egress de valores de negocio verificado).

**Datos y recuperación:**

- [ ] Restore de prueba verificado **dentro del RTO** (D-rpo cerrada).
- [ ] Paridad de comportamiento probada sobre la **copia** de `crm.db` (F2), incluida la regresión de recall tras el swap atómico.

**Canal y workspace:**

- [ ] Piloto escalonado de Slack aprobado por el Operador.
- [ ] UPN de todas las personas resuelven; `ApplicationAccessPolicy` scoping activo (MS365 no envía-como-cualquier-buzón).

> Referencia de detalle para cualquier ítem: `docs/AWS-EC2-BEDROCK-TECHNICAL-MAP.md` (§4 Bedrock, §5 networking/residencia, §6 datos, §11 riesgos, §12 backlog, §13 fases, §15 decisiones abiertas).
