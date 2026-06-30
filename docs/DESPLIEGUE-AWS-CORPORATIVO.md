# Despliegue Corporativo en AWS — Pulso-Aura

|                          |                                                                                                                    |
| :----------------------- | :----------------------------------------------------------------------------------------------------------------- |
| **Doc ID**               | DEPLOY-AWS-CORP-003 (perfil corporativo: Snowflake + Microsoft 365 + Slack)                                        |
| **Estado**               | Borrador para revisión de Infraestructura / Seguridad (pre-ejecución)                                              |
| **Fecha**                | 2026-06-24                                                                                                         |
| **Propietario**          | Fede (product owner)                                                                                               |
| **Audiencia primaria**   | Equipo de Infraestructura, Redes y Seguridad corporativa                                                           |
| **Audiencia secundaria** | El mantenedor de `EurekaMD-net/Pulso-Aura-Upfront` (Claude Code)                                                   |
| **Reemplaza**            | DEPLOY-AWS-CORP-002                                                                                                |
| **Relacionados**         | `docs/AURA-P4-PLAN.md` (Snowflake) · `docs/INFERENCE-MIGRATION-2026-06-20.md` · `engine/.claude/skills/add-slack/` |

> **Propósito.** Especificación técnica completa para llevar Pulso-Aura del VPS actual a un despliegue corporativo en AWS **conservando el comportamiento y la fluidez de producción**, escrita para que Infraestructura pueda aprovisionar, conectar, asegurar y operar el sistema sin leer el código. Refleja la arquitectura real verificada contra el repositorio.

> **Perfil corporativo de esta revisión (003).** Tres definiciones de plataforma respecto a 002:
>
> 1. **Snowflake es el único proveedor de datos corporativo** — se elimina el cubo MSSQL/SQL Server.
> 2. **Suite Microsoft 365 en lugar de Google** — Outlook/Exchange, OneDrive/SharePoint, Calendar, Excel/PowerPoint vía Microsoft Graph (reemplaza Gmail y las herramientas Google).
> 3. **Slack es el único canal** — reemplaza por completo a WhatsApp.
>
> **Aviso de esfuerzo (importante).** Dos de estos cambios son **desarrollo nuevo**, no sólo configuración de infra: el código actual integra **Google** (no Microsoft) y su canal vivo es **WhatsApp** (Slack está en un _skill_, no aún en `src/`). Esto se detalla en §11 y §12 y se refleja en el plan por fases y en las decisiones abiertas.

---

## 1. Cómo funciona Pulso-Aura HOY (modelo de ejecución real)

Entender esto es prerrequisito. **No es una app web monolítica.** Son dos superficies:

### 1.1 Proceso anfitrión (host)

- Un único proceso Node.js **22** que corre **TypeScript en vivo vía `tsx`** (no compilado): `tsx engine/src/index.ts`.
- En el VPS corre como servicio **systemd** (`agentic-crm`), con `WorkingDirectory` = raíz del repo y `TZ=America/Mexico_City`.
- Responsabilidades del host: conexión al **canal** (objetivo corporativo: **Slack**), enrutamiento de mensajes, cola de concurrencia, scheduler, **dashboard HTTP**, _credential-proxy_, y el **lanzamiento de los contenedores de agente**.

### 1.2 Contenedores de agente efímeros (el “cerebro” que razona)

- **Por cada mensaje entrante**, el host ejecuta `docker run -i --rm ... agentic-crm-agent:latest`. El contenedor procesa ese mensaje y **se autodestruye** (`--rm`).
- Dentro corre el _agent-runner_ de CRM: bucle agéntico (razonamiento + llamadas a las **76 herramientas** del CRM + síntesis).
- **Inferencia: 100% vía endpoints compatibles con OpenAI. Pulso-Aura NUNCA llama a Anthropic.** Usa `inferWithTools()` → `crm/src/inference-adapter.ts` → `POST {INFERENCE_PRIMARY_URL}/v1/chat/completions` (hoy Groq `qwen/qwen3-32b`), con respaldo a `INFERENCE_FALLBACK_URL` (hoy Fireworks `qwen3p7-plus`).
- **Seguridad:** el repo aún contiene un camino heredado de NanoClaw (Claude Agent SDK + _credential-proxy_ :7462) que **está muerto para el CRM** (el `Dockerfile` de CRM sobrescribe el `ENTRYPOINT`). Se trata en §6.3 (**bloquear `api.anthropic.com` por Security Group**).

### 1.3 Implicación clave para AWS

Como el cerebro del agente ya habla **formato OpenAI**, **vLLM se conecta directo** (expone `/v1/chat/completions`); no se requiere _shim_ Anthropic↔OpenAI. Self-hostear inferencia es **repuntar `INFERENCE_PRIMARY_URL`** a vLLM local (con la salvedad de red de §7.4).

```
Slack ─▶ Proceso host (tsx, Node 22, systemd)
           │  enruta, encola (MAX_CONCURRENT_CONTAINERS), agenda, dashboard:3000, proxy:7462
           ▼
        docker run -i --rm  --network crm-net  agentic-crm-agent:latest   (1 por mensaje)
           │  agent-runner → inferWithTools() → POST {INFERENCE_PRIMARY_URL}/v1/chat/completions
           ▼
        Inferencia OpenAI-compatible  (HOY: Groq/Fireworks · OBJETIVO: vLLM local en la VPC)
```

---

## 2. Alcance del despliegue

### 2.1 En alcance

Migrar el sistema (CRM agéntico “compañero de cierre”, corpus Aura, datos CRM, RAG híbrido, scheduler, memoria Hindsight) del VPS a AWS, con estos cambios:

1. **Inferencia self-hosted en GPU** (reemplaza la API externa de inferencia).
2. **Embeddings y transcripción de voz self-hosted** (residencia de datos).
3. **Slack como canal único** (reemplaza WhatsApp). — _desarrollo nuevo, §11.1_
4. **Suite Microsoft 365** vía Graph (reemplaza Gmail + herramientas Google). — _desarrollo nuevo, §11.2_
5. **Snowflake como único proveedor de datos corporativo** (se elimina el cubo MSSQL).

### 2.2 Fuera de alcance (esta fase)

- Sin cambios a la metodología/corpus Aura, _brand-firewall_ ni jerarquía RBAC. Sólo cambia **dónde** corre y las **integraciones de plataforma**.
- Sin cambios a la lógica de razonamiento del agente. La inferencia se alcanza por adaptador OpenAI-compatible; cambiar de proveedor es **configuración** (§7).
- Sin topología multi-región / alta disponibilidad (nodo único; D4 en §12.1).
- Sin migrar el almacén relacional/vectorial fuera de SQLite (D4).
- **WhatsApp se retira; no hay operación dual de canal.**

---

## 3. Inventario de componentes y dependencias de runtime

| Componente                 | Qué es                                               | Dónde corre                    | Notas para infra                                  |
| :------------------------- | :--------------------------------------------------- | :----------------------------- | :------------------------------------------------ |
| **Proceso host**           | Node 22 + `tsx` (TS en vivo)                         | EC2 (systemd o contenedor)     | `WorkingDirectory`=repo; `TZ=America/Mexico_City` |
| **Contenedores de agente** | `agentic-crm-agent:latest`, efímeros `--rm`          | Docker en el mismo EC2         | 1 por mensaje; red `crm-net`; límites de recursos |
| **Imagen base**            | `nanoclaw-agent:latest` (`FROM node:22-slim`)        | Build local/ECR                | Base de la imagen de CRM                          |
| **vLLM (objetivo)**        | Inferencia OpenAI-compatible                         | GPU del EC2 (o contenedor)     | Expone `/v1` :8000                                |
| **Embeddings (objetivo)**  | Servidor self-hosted 1024-dim                        | CPU o GPU compartida           | OpenAI-compatible `/v1/embeddings`                |
| **Whisper (objetivo)**     | Transcripción de notas de voz                        | CPU/GPU                        | OpenAI-compatible `/v1/audio/transcriptions`      |
| **Hindsight**              | Memoria de largo plazo (sidecar HTTP)                | Contenedor (puertos 8888/9999) | **Opcional**: _fallback_ a SQLite si no está sano |
| **SQLite**                 | `data/store/crm.db` + `sqlite-vec` (1024-dim) + FTS5 | Volumen EBS                    | Dato irremplazable; respaldos obligatorios        |
| **Dashboard HTTP**         | UI web + acortador (`/go/<code>`)                    | Host, puerto 3000              | **Ingreso** — decidir exposición (§5.2)           |
| **Credential proxy**       | Heredado (Anthropic SDK); **no usado por CRM**       | Host, puerto 7462              | Inocuo; bloquear `api.anthropic.com` por SG       |
| **Docker engine**          | Runtime de contenedores                              | EC2                            | Requerido; red `crm-net` debe existir             |

**Dependencias de sistema horneadas en las imágenes** (ya vienen en el `Dockerfile`): Node 22, `poppler-utils` (`pdftotext`), navegador **Lightpanda** (se descarga de GitHub en _build_), `sqlite3`, `python3/make/g++`. El _build_ requiere **egress a `github.com`** (binario de Lightpanda) y al registro npm.

---

## 4. Requisitos de infraestructura AWS

### 4.1 Cómputo (EC2 GPU)

- **Instancia única** GPU en subred privada (D1: co-localizar app + inferencia).
- Familia objetivo: **`g6e`** (NVIDIA L40S 48 GB). **Confirmar disponibilidad y precio en la región** (D-open-4).
- **CPU/RAM — atención:** el modelo de contenedor efímero **lanza un contenedor Docker por mensaje** además de vLLM, embeddings, Whisper, Hindsight y el host. `g6e.xlarge` (4 vCPU/32 GiB) es **demasiado ajustado**; recomendado **mínimo `g6e.2xlarge` (8 vCPU/64 GiB)**; validar bajo carga (§9.3).
- **VRAM y cuantización:** un denso de 27B en fp16 ocupa ~54 GB → **no cabe** en 48 GB. **Hay que cuantizar** (AWQ/GPTQ/fp8 → ~16–27 GB) y dejar margen para **KV-cache** (el corpus Aura se inyecta en el _system prompt_; prompts grandes). Elección de modelo en §7.2.

### 4.2 Almacenamiento (EBS)

- **EBS gp3** para datos: `data/store/crm.db` + `sqlite-vec`/FTS5 + `attachments/`. Inicial 50–100 GB.
- **EBS separado para pesos del modelo** (decenas de GB) — persistir para que los reinicios **no** redescarguen (§8.5).
- **S3** para respaldos de `crm.db` + snapshots EBS; opcionalmente para pesos.

### 4.3 Red / VPC

- Subred **privada**, instancia **sin IP pública** (Slack por Socket Mode = salida WebSocket, sin ingreso público).
- **NAT Gateway con EIP fija** para los egress permitidos (§5) — necesaria para _allowlist_ de Snowflake.
- **Red de contenedores `crm-net`** (bridge de Docker) debe existir: `docker network create crm-net`.
- **Security Groups: denegar por defecto**; permitir sólo el egress de §5.1. **Denegar `api.anthropic.com`** (§6.3).

### 4.4 IAM y secretos

- **Rol de instancia IAM** de mínimo privilegio (secretos específicos, S3 de respaldo, ECR). Sin llaves de usuario en disco.
- **AWS Secrets Manager / SSM** para todos los secretos (§10). **Mecanismo:** un **_entrypoint shim_** que lee los secretos del store y los exporta como variables de entorno **antes** de iniciar `tsx` (vía limpia, sin tocar lógica). Infra provee ese script.

### 4.5 Registro de imágenes

- **ECR** para `nanoclaw-agent:latest` y `agentic-crm-agent:latest`. El rol IAM permite `ecr:GetAuthorizationToken`/`BatchGetImage`.

---

## 5. Inventario COMPLETO de egress / ingress (crítico para auditoría)

### 5.1 Egress saliente (lista exhaustiva del perfil corporativo)

| #   | Destino                                                                        | Dirección              | Propósito                                                | Variable / control                                 |
| :-- | :----------------------------------------------------------------------------- | :--------------------- | :------------------------------------------------------- | :------------------------------------------------- |
| 1   | **Inferencia** (objetivo: vLLM **local**, en VPC)                              | Saliente               | Cerebro del agente                                       | `INFERENCE_PRIMARY_URL` + `INFERENCE_FALLBACK_URL` |
| 2   | **Embeddings** (objetivo: local, en VPC)                                       | Saliente               | RAG / vectorización 1024-dim                             | `EMBEDDING_URL`, `EMBEDDING_MODEL`                 |
| 3   | **Whisper / transcripción** (objetivo: local)                                  | Saliente               | Notas de voz → texto                                     | `WHISPER_API_URL`, `WHISPER_API_KEY`               |
| 4   | **Snowflake** (proveedor de datos corporativo)                                 | Saliente               | Gasto/datos factuales, bajo demanda                      | Rol _read-only_, key-pair, **IP NAT en allowlist** |
| 5   | **Microsoft 365 / Graph** (`graph.microsoft.com`, `login.microsoftonline.com`) | Saliente               | Outlook, OneDrive/SharePoint, Calendar, Excel/PowerPoint | App en Entra ID; permisos _least-scope_            |
| 6   | **Microsoft 365 SMTP** (`smtp.office365.com`) _o_ Graph `sendMail`             | Saliente               | Envío de correo                                          | `SMTP_*` (Modern Auth) o Graph                     |
| 7   | **Brave Search** (`api.search.brave.com`)                                      | Saliente               | Búsqueda web del agente                                  | `BRAVE_SEARCH_API_KEY`                             |
| 8   | **Slack** (canal único)                                                        | Saliente (WebSocket)   | Mensajería                                               | Tokens app+bot en Secrets Manager; Socket Mode     |
| 9   | **Hugging Face**                                                               | Saliente, una vez      | Descarga de pesos                                        | Sólo durante F1; cerrar después                    |
| 10  | **GitHub**                                                                     | Saliente, _build-time_ | Binario de Lightpanda                                    | Sólo al construir la imagen                        |
| 11  | **`api.anthropic.com`**                                                        | —                      | **No usado por CRM**                                     | **DENEGAR por SG** (defensa en profundidad)        |

> **Eliminados respecto a 002:** el **cubo MSSQL/SQL Server** (Snowflake es ahora el único proveedor de datos) y **WhatsApp/Meta** (Slack es el único canal). **Sustituido:** Google Workspace → **Microsoft 365**.
> Para residencia de datos plena, **1, 2 y 3 deben ser locales (en la VPC)**. La transcripción de voz (#3) es la fuga “oculta”: hoy envía **audio confidencial** a un Whisper externo; self-hostearlo es config-only (apuntar `WHISPER_API_URL` a un server local).

### 5.2 Ingreso entrante

- **Dashboard HTTP** (`DASHBOARD_BASE_URL`, def. `:3000`): UI + acortador `/go/<code>` usado en mensajes a vendedores. **Decisión de exposición** (D-open-7):
  - **Opción A (recomendada):** interno a la VPC; acceso de operadores por VPN/SSM. Los enlaces `/go/<code>` requieren entonces un dominio interno alcanzable.
  - **Opción B:** detrás de **ALB corporativo con TLS** + auth (`DASHBOARD_JWT_SECRET`), si los vendedores abren enlaces desde fuera de la red.
- **Slack (Socket Mode): sin ingreso público.**

---

## 6. Residencia de datos y postura de seguridad

### 6.1 Clasificación de datos

| Dato                                              | Sensibilidad             | Ubicación                              | ¿Sale de la VPC?                |
| :------------------------------------------------ | :----------------------- | :------------------------------------- | :------------------------------ |
| Corpus Aura (320 marcas / 969 hallazgos)          | Confidencial, interno    | EBS (SQLite + vectores)                | **No**                          |
| Datos CRM (cuentas, contactos, metas, pipeline)   | Confidencial             | EBS (SQLite)                           | **No**                          |
| Contenido de conversación (prompts, razonamiento) | Confidencial             | Inferencia local (vLLM)                | **No** (#1 self-host)           |
| Embeddings de corpus/documentos                   | Confidencial (derivado)  | Embeddings local                       | **No** (#2)                     |
| **Audio de notas de voz**                         | **Confidencial**         | **Whisper local**                      | **No — sólo si #3 es local**    |
| **Gasto/datos factuales (Snowflake)**             | Confidencial (de origen) | Lectura bajo demanda, nunca persistido | Pull _read-only_, entrante      |
| Documentos/correo/calendario (Microsoft 365)      | Confidencial (de origen) | Graph bajo demanda                     | Pull autenticado, _least-scope_ |
| Memoria largo plazo (Hindsight)                   | Confidencial             | EBS / local                            | **No**                          |

### 6.2 Control de acceso

- **En-app:** se preservan **sin cambios** la jerarquía RBAC (**4 roles: `ae` / `gerente` / `director` / `vp`**) y el _brand-firewall_ de Aura.
- **Instancia:** sin IP pública; subred privada; acceso admin por la **vía aprobada por seguridad** (SSM Session Manager o bastión — D-open-3).
- **AWS:** rol IAM de mínimo privilegio (Secrets, S3, ECR). Sin llaves de usuario IAM en la instancia.
- **Snowflake:** rol dedicado **sólo lectura**, key-pair (no password); lecturas parametrizadas por anunciante, nunca _bulk export_.
- **Microsoft 365:** app registrada en **Entra ID** con permisos _least-scope_; decidir **delegados vs. application** (D-open-10); secreto/cert en Secrets Manager.

### 6.3 Sellar el egress heredado a Anthropic (defensa en profundidad)

La regla “Pulso-Aura nunca usa Anthropic” es cierta **por convención de `ENTRYPOINT`**, no por imposición. La imagen base aún incluye el Claude Agent SDK y un proxy cuyo upstream por defecto es `api.anthropic.com`. Acciones: (1) **SG deny por defecto** ⇒ `api.anthropic.com` fuera de la _allowlist_; (2) documentar que el camino del Agent SDK está **muerto** para el CRM; idealmente **eliminarlo de la imagen** en limpieza posterior.

---

## 7. Inferencia, embeddings y transcripción self-hosted

### 7.1 Arquitectura

El adaptador del CRM es **OpenAI-compatible**, así que los tres servidores locales exponen APIs estilo OpenAI y se conectan por configuración:

| Servicio      | Servidor sugerido                                | Endpoint                     | Variable                                   |
| :------------ | :----------------------------------------------- | :--------------------------- | :----------------------------------------- |
| LLM (cerebro) | **vLLM**                                         | `/v1/chat/completions` :8000 | `INFERENCE_PRIMARY_URL`                    |
| Embeddings    | **TEI** o vLLM                                   | `/v1/embeddings`             | `EMBEDDING_URL` (**1024-dim obligatorio**) |
| Transcripción | **faster-whisper** / whisper.cpp (OpenAI-compat) | `/v1/audio/transcriptions`   | `WHISPER_API_URL`                          |

### 7.2 Elección de modelo LLM

- **No** adoptar “Qwen 3.6” a ciegas: en **nuestro propio benchmark** (`docs/INFERENCE-MIGRATION-2026-06-20.md`), `qwen3.6-plus` **entró en bucle 3/3 y tardó 22 s** (el peor candidato); **`qwen3-32b` pasó 3/3 a 0.9 s**.
- El **primario actual, `qwen/qwen3-32b`, ya es de pesos abiertos (Apache-2.0)** y **se self-hostea directo** en vLLM: es el **objetivo de menor riesgo** (modelo ya validado en producción).
- **Acción F0:** tomar `qwen3-32b` (cuantizado, una GPU) como **línea base a vencer**; adoptar otra variante abierta **sólo si** gana en _nuestro_ benchmark de _síntesis-tras-herramienta_ **y** cabe cuantizada. Verificar que los repos HF existan antes de comprometerlos.

### 7.3 Igualar la fluidez del VPS (latencia)

La “fluidez” actual = **0.9 s** (Groq). Una sola GPU self-hosted **no la iguala automáticamente** bajo concurrencia. Para no degradar: cuantizar, fijar `--max-model-len` acorde al corpus, y **medir latencia concurrente** (§9.3). **Plan B documentado:** si la GPU única no alcanza el SLA, conservar un **endpoint OpenAI-compatible administrado en la misma región** (cumpliendo residencia) o ir a GPU separada (D1 lo deja como cambio de config).

### 7.4 Gotcha de red `localhost` vs host-gateway (crítico)

Los contenedores corren en `crm-net`. Si vLLM/embeddings/Whisper/Hindsight corren **en el host**, `INFERENCE_PRIMARY_URL=http://localhost:8000/v1` **NO funciona** desde el contenedor (`localhost` = el propio contenedor). Opciones:

- **Opción 1 (recomendada):** correr vLLM/embeddings/Whisper/Hindsight **como contenedores en `crm-net`** y direccionar por **nombre de servicio** (`http://vllm:8000/v1`).
- **Opción 2:** apuntar a la **host-gateway** de Docker (como el credential-proxy en `7462`), p. ej. `http://host.docker.internal:8000/v1`.

---

## 8. Datos, persistencia y respaldo

- **`crm.db`** (SQLite) en `data/store/crm.db` (override `CRM_DB_PATH`), con `sqlite-vec` (**1024-dim**, debe coincidir con los embeddings) y FTS5. **Dato irremplazable.**
- **Hindsight:** `HINDSIGHT_ENABLED=true`, `HINDSIGHT_URL` (def. `http://localhost:8888`), `HINDSIGHT_API_KEY`. **Si no está sano, degrada a SQLite** (no bloquea). Para residencia, correr el contenedor **dentro de la VPC**.
- **Corpus Aura** (`aura-kb/`, 320 marcas / 969 hallazgos): se siembra/embebe con `npm run sync:aura-kb` / `verify:aura-kb`.
- **Datos corporativos = Snowflake** (único proveedor): lecturas _read-only_ bajo demanda, **nunca persistidas** localmente; esquema/identificador de anunciante/semántica de cifras confirmados con el equipo de datos (ver `AURA-P4-PLAN.md`).
- **Respaldos (obligatorio, F4):** snapshots EBS + copia de `crm.db` a S3, **con restauración de prueba verificada**.
- **Sincronización de corte:** el VPS sigue como _system of record_ hasta F4. Como los datos CRM **cambian a diario**, **F4 debe congelar + resincronizar `crm.db`** justo antes del corte.

---

## 9. Operación (igualar la robustez del VPS)

### 9.1 Health check que ejerce la ruta real

`systemd active` **no** prueba que el bot funciona — el `/health` no ejercita el _spawn_ del contenedor. El _probe_ **debe disparar un round-trip real** entrante→agente→saliente, y alarmar ante GPU OOM, disco y round-trip fallido.

### 9.2 Guarda anti-prune de la imagen efímera

Como los contenedores son `--rm`, entre mensajes la imagen parece “sin uso” y un _prune_ la borraría, **dejando mudo al bot**. Ambas imágenes llevan `LABEL keep="true"`. Cualquier limpieza de imágenes en el host AWS **debe preservar `label=keep=true`**.

### 9.3 Concurrencia y límites

- `MAX_CONCURRENT_CONTAINERS` (def. **3**): tope simultáneo; el resto se encola por grupo.
- Límites por contenedor: `CONTAINER_MEMORY`, `CONTAINER_CPUS`, `CONTAINER_PIDS_LIMIT`.
- **Gate nuevo:** probar **N vendedores concurrentes** contra **una** GPU. Riesgo operativo #1 del nodo único.

### 9.4 Arranque en frío

vLLM tarda **minutos** en cargar 27–32B a VRAM. En reinicio (spot/crash — nodo único = SPOF declarado), el bot está caído ese intervalo. Mitigar con pesos persistidos (§4.2), alarma de liveness y ventana de recuperación documentada.

### 9.5 Logs y observabilidad

- Host → **CloudWatch** (stdout/stderr + métricas GPU/disco).
- `TZ=America/Mexico_City` en systemd **y** en los contenedores.
- Caveat `tsx`: cachea en `/tmp/tsx-*/`; si el comportamiento no coincide con el código tras un deploy, limpiar la caché.

---

## 10. Variables de entorno (superficie de configuración completa)

> Todas migran de `.env` a Secrets Manager/SSM (§4.4). Ninguna vive en el repo ni en disco en texto plano.

| Grupo                               | Variables                                                                                                                                                                             | Notas                                                                                                                |
| :---------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------------------------------------------------------------------------------------------------------------- |
| **Inferencia**                      | `INFERENCE_PRIMARY_URL/KEY/MODEL`, `INFERENCE_FALLBACK_URL/KEY/MODEL`, `INFERENCE_MAX_TOKENS`, `INFERENCE_TIMEOUT_MS`                                                                 | Objetivo: PRIMARY→vLLM local. Mantener patrón primario/respaldo                                                      |
| **Embeddings**                      | `EMBEDDING_URL`, `EMBEDDING_MODEL`                                                                                                                                                    | Salida 1024-dim obligatoria                                                                                          |
| **Transcripción**                   | `WHISPER_API_URL`, `WHISPER_API_KEY`                                                                                                                                                  | Objetivo: Whisper local                                                                                              |
| **Memoria**                         | `HINDSIGHT_ENABLED`, `HINDSIGHT_URL`, `HINDSIGHT_API_KEY`                                                                                                                             | Degradación a SQLite si ausente                                                                                      |
| **Datos (Snowflake)**               | `SNOWFLAKE_*` (rol _read-only_, key-pair)                                                                                                                                             | **Único proveedor de datos**; IP NAT en allowlist; ver `AURA-P4-PLAN.md`                                             |
| **Canal (Slack único)**             | `SLACK_ONLY=true`, `SLACK_APP_TOKEN`, `SLACK_BOT_TOKEN`, `CONTAINER_IMAGE`, `TRIGGER_PATTERN`, `ASSISTANT_NAME`                                                                       | WhatsApp retirado (sin `WHATSAPP_TRIGGER_WORD`)                                                                      |
| **Microsoft 365** _(a implementar)_ | `MS_GRAPH_TENANT_ID`, `MS_GRAPH_CLIENT_ID`, `MS_GRAPH_CLIENT_SECRET`, flags de módulo (correo/archivos/calendario), `EMAIL_ENABLED`, `SMTP_HOST/PORT/USER/PASS`, `SMTP_FROM` (→ O365) | Reemplaza `GOOGLE_SERVICE_ACCOUNT_KEY`/`GOOGLE_CALENDAR_ENABLED`. Correo: SMTP O365 (Modern Auth) o Graph `sendMail` |
| **Búsqueda**                        | `BRAVE_SEARCH_API_KEY`                                                                                                                                                                | Búsqueda web del agente                                                                                              |
| **Dashboard**                       | `DASHBOARD_BASE_URL`, `DASHBOARD_JWT_SECRET`                                                                                                                                          | Decidir exposición (§5.2)                                                                                            |
| **Contenedores**                    | `MAX_CONCURRENT_CONTAINERS`, `CONTAINER_MEMORY`, `CONTAINER_CPUS`, `CONTAINER_PIDS_LIMIT`, `CREDENTIAL_PROXY_PORT` (7462)                                                             | Red `crm-net` debe existir                                                                                           |
| **Sistema**                         | `TZ=America/Mexico_City`                                                                                                                                                              | systemd + contenedores                                                                                               |
| **Eliminadas**                      | ~~`CUBO_MSSQL_HOST/USER/PASS/DB`~~, ~~`CUBO_SYNC_ENABLED`~~, ~~`GOOGLE_SERVICE_ACCOUNT_KEY`~~, ~~`GOOGLE_CALENDAR_ENABLED`~~, ~~`WHATSAPP_TRIGGER_WORD`~~                             | Perfil corporativo                                                                                                   |

---

## 11. Integraciones de plataforma (alcance real — esto es desarrollo, no sólo config)

### 11.1 Slack como canal único (reemplaza WhatsApp)

El adaptador Slack **existe pero aún no está en `engine/src/channels/`**: vive en el _skill_ `engine/.claude/skills/add-slack/` y se aplica con `npx tsx scripts/apply-skill.ts .claude/skills/add-slack`. WhatsApp y Slack implementan la **misma interfaz `Channel`**, por lo que tras aplicarlo el modo se fija con `SLACK_ONLY=true`.

**Trabajo real (no “sólo activar”):**

- **Aplicar el skill** y fijar `SLACK_ONLY=true`; **retirar WhatsApp/Baileys** (sin estado de auth de WhatsApp).
- **Notas de voz en Slack: desarrollo nuevo.** La transcripción actual depende de la descarga de medios de Baileys; el adaptador Slack hoy **sólo procesa texto** (limitación en su `SKILL.md`). Para paridad de voz hay que implementar descarga vía `files.info` de Slack + manejo de formato (D-open-9).
- **Mapeo persona→canal/DM: desarrollo nuevo.** Hoy la persona mapea a `whatsapp_group_folder`; no existe lógica persona→DM/canal de Slack ni espejo del organigrama. Requiere cambio de esquema + enrutamiento.

### 11.2 Suite Microsoft 365 (reemplaza Gmail y herramientas Google)

**Estado actual:** el código integra **Google** (`crm/src/workspace/google/` — auth + correo; `persona.calendar_id` = Google Calendar; `doc-sync` indexa Google Docs/Sheets). **No existe ningún código Microsoft/Graph.** Por tanto esta es una **migración de desarrollo**, no de infraestructura.

**Diseño objetivo (vía Microsoft Graph):**

- Implementar un proveedor paralelo `crm/src/workspace/microsoft/` (la carpeta `workspace/<provider>/` ya es el _seam_ de extensión) que cubra: **Outlook/Exchange** (correo), **OneDrive/SharePoint** (archivos/doc-sync), **Microsoft 365 Calendar** (reemplaza `calendar_id` de Google), **Excel/PowerPoint** (reemplaza Sheets/Slides).
- **Autenticación:** registrar una **app en Microsoft Entra ID** (Azure AD); decidir **permisos delegados vs. application** (D-open-10); secreto/certificado en Secrets Manager; egress a `graph.microsoft.com` + `login.microsoftonline.com`.
- **Correo (camino corto):** el envío saliente ya usa **SMTP genérico** (`EMAIL_ENABLED`, `SMTP_HOST`), por lo que apuntar a **`smtp.office365.com`** es casi config-only (sujeto a la política de Modern Auth/SMTP AUTH del tenant). La integración rica (archivos/calendario/lectura de correo) **sí** requiere Graph.
- **Identidad de persona:** sustituir `calendar_id` (Google) por el identificador M365/UPN del usuario; alinear con el mapeo de identidad de Slack (§11.1) — un único trabajo de “identidad corporativa” por persona.

---

## 12. Plan de despliegue por fases (con gates verificables)

Cada fase tiene acciones, _gate_ (evidencia que la cierra) y _rollback_. Una fase no está “lista” hasta que su _gate_ pasa.

### 12.1 Fases

**F0 — Decisión y evaluación de modelo** _(desbloquea todo)_

- **Acciones.** Levantar vLLM con `qwen3-32b` cuantizado (línea base) en `g6e` de prueba; correr el benchmark interno de _tool-calling_ en español; **medir latencia concurrente**.
- **Gate.** Resultado documentado: variante elegida con score vs. baseline externo y latencia bajo carga; sin regresión más allá del umbral.
- **Rollback.** N/A.

**F1 — Instancia base**

- **Acciones.** Provisionar EC2 `g6e` en VPC privada; EBS (datos + pesos); rol IAM; Secrets Manager; _entrypoint shim_; CloudWatch; NAT; crear `crm-net`. Persistir pesos.
- **Gate.** Instancia alcanzable por la vía admin aprobada; secretos resolubles en runtime; CloudWatch con logs + métricas GPU; egress NAT limitado a §5.1; `api.anthropic.com` denegado.
- **Rollback.** Desmontar; sin tráfico productivo.

**F2 — App + inferencia/embeddings/Whisper local + datos Snowflake**

- **Acciones.** Desplegar host + contenedores + Hindsight; apuntar `INFERENCE_*`, `EMBEDDING_*`, `WHISPER_API_URL` a los servidores **locales** (regla host-gateway §7.4); migrar `crm.db`; conectar **Snowflake** (read-only, key-pair); verificar RAG, _brand-firewall_ y RBAC idénticos.
- **Gate.** Paridad de comportamiento sobre un set fijo de consultas; suites _brand-firewall_/RBAC verdes; **health check ejerce la ruta real**; latencia concurrente dentro de SLA; query Snowflake _read-only_ con procedencia.
- **Rollback.** El VPS sigue como _system of record_; revertir tráfico al VPS.

**F3 — Slack (canal único) + Suite Microsoft 365** _(desarrollo, §11)_

- **Acciones.** Aplicar skill `add-slack` con `SLACK_ONLY=true`; crear app Slack (Socket Mode); mapear personas→canales/DMs; implementar voz en Slack si se requiere paridad; **retirar WhatsApp**. Implementar el proveedor `workspace/microsoft/` (Graph): correo, archivos, calendario; registrar app en Entra ID; migrar identidad de persona (UPN/M365).
- **Gate.** Loop end-to-end en Slack para un usuario de prueba (incl. voz si aplica); mapeo de organigrama correcto; RBAC intacto; operaciones M365 (enviar correo, leer archivo/calendario) verificadas con la app de Entra ID.
- **Rollback.** Reactivar WhatsApp por config (interfaz compartida); el módulo Google permanece como respaldo hasta validar M365.

**F4 — Endurecimiento + Snowflake final + corte**

- **Acciones.** Allowlist de IP NAT en Snowflake; key-pair _read-only_; finalizar el SQL factual contra el esquema confirmado; **congelar + resincronizar `crm.db`** (§8); snapshots EBS + respaldo S3 con **restauración de prueba**; runbook; E2E con un Director/Gerente real.
- **Gate.** Snowflake devuelve cifras reconciliadas y etiquetadas con procedencia; respaldos verificados por restauración; E2E real pasa; sign-off en el changelog.
- **Rollback.** Deshabilitar herramientas Snowflake (gated en `isSnowflakeConfigured`); degrada con gracia a Aura + CRM.

---

## 13. Criterios de aceptación (evidencia de auditoría)

- **Paridad de modelo (F0):** score vs. baseline + latencia concurrente; variante justificada.
- **Paridad de comportamiento (F2):** set fijo de consultas equivalente; suites _brand-firewall_ y RBAC verdes.
- **Liveness (todas las fases):** _probe_ hace round-trip real; alarmas de GPU OOM, disco y round-trip fallido.
- **Residencia (F2):** inferencia, embeddings **y transcripción** resueltos **en la VPC**; egress observado = sólo §5.1; `api.anthropic.com` sin tráfico.
- **Canal (F3):** round-trip Slack verificado (incl. voz si aplica); mapeo de organigrama correcto; WhatsApp retirado.
- **Microsoft 365 (F3):** envío de correo + lectura de archivo/calendario vía Graph verificados con la app de Entra ID.
- **Datos (F4):** cifras Snowflake con procedencia + estatus; “no reconciliado” nunca se presenta como “sin gasto”.
- **Recuperabilidad (F4):** restauración de prueba desde S3 exitosa.

---

## 14. Costos

- Una GPU `g6e` **24/7** cuesta aprox. **USD ~1.3k–2.4k/mes** (`g6e.xlarge` ≈ $1.86/h on-demand; **confirmar en la región**, D-open-4) vs. la API por token actual (Groq/Fireworks) probablemente **< USD 100/mes** para un piloto.
- **Desajuste de utilización:** tráfico de ventas a ráfagas vs. GPU reservada 24/7. La residencia de datos puede justificarlo, pero el registro de decisión debe **mostrar que se evaluó el trade-off**.
- **Mitigaciones:** arranque/apagado programado de la GPU, _right-sizing_, o endpoint OpenAI-compatible administrado **en la región** que cumpla residencia (Plan B, §7.3).
- **Costo de migraciones (F3):** Slack-único y Microsoft 365 son **ingeniería** (no infra). Presupuestar tiempo de desarrollo para el proveedor `workspace/microsoft/`, el mapeo de identidad y (si aplica) la paridad de voz en Slack.

---

## 15. Decisiones abiertas y responsables

| ID            | Decisión                                                                                                                                                                                 | Responsable               |
| :------------ | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------ |
| D-open-1      | Variante LLM open-weight (baseline `qwen3-32b` vs. alternativa que gane el benchmark)                                                                                                    | Producto + Infra (F0)     |
| D-open-2      | Región AWS (requisito de residencia)                                                                                                                                                     | Corporativo / Legal       |
| D-open-3      | Vía de acceso admin (SSM Session Manager vs. bastión)                                                                                                                                    | Seguridad                 |
| D-open-4      | Tamaño y precio de GPU en la región; ¿24/7 o programada?                                                                                                                                 | Infra + Presupuesto       |
| D-open-5      | Workspace de Slack (corporativo existente vs. dedicado); política de canales/DMs                                                                                                         | IT / Producto             |
| D-open-6      | Modelo de embeddings self-hosted (TEI vs. vLLM, 1024-dim)                                                                                                                                | Producto + Infra          |
| D-open-7      | Exposición del dashboard (interno VPC vs. ALB+TLS)                                                                                                                                       | Seguridad / Infra         |
| D-open-9      | ¿Paridad de voz en Slack en F3 o diferida? (desarrollo nuevo)                                                                                                                            | Producto                  |
| **D-open-10** | **Microsoft 365: alcance Graph (correo/OneDrive/SharePoint/Calendar/Excel/PowerPoint); registro de app en Entra ID; permisos delegados vs. application; ¿correo por Graph o SMTP O365?** | IT / Seguridad / Producto |
| **D-open-11** | **Identidad por persona: mapeo a Slack (canal/DM) y a M365 (UPN), reemplazando `whatsapp_group_folder` + `calendar_id` de Google**                                                       | Producto + IT             |

> **Cerrada respecto a 002:** D-open-8 (cubo MSSQL) — eliminado; Snowflake es el único proveedor de datos.

---

## 16. Anexo — comandos clave de referencia

```bash
# Construir las imágenes (encadena base nanoclaw-agent → agentic-crm-agent)
npm run build:container            # = crm/container/build.sh

# Red de contenedores (debe existir antes de arrancar)
docker network create crm-net

# Canal: aplicar Slack y fijarlo como único (retira WhatsApp)
npx tsx scripts/apply-skill.ts .claude/skills/add-slack
# luego en el entorno: SLACK_ONLY=true, SLACK_APP_TOKEN=..., SLACK_BOT_TOKEN=...

# Arrancar el host (en AWS: systemd o contenedor)
npm start                          # = tsx engine/src/index.ts   (Node 22, TZ=America/Mexico_City)

# Sembrar/verificar el corpus Aura en crm.db
npm run sync:aura-kb && npm run verify:aura-kb

# Probar/ajustar proveedores de inferencia (respalda .env, prueba endpoints, auto-rollback)
tsx scripts/set-inference-providers.ts
tsx scripts/inference-probe.ts

# Verificar la guarda anti-prune en las imágenes desplegadas
docker image inspect agentic-crm-agent:latest --format '{{ index .Config.Labels "keep" }}'   # → true
docker image inspect nanoclaw-agent:latest     --format '{{ index .Config.Labels "keep" }}'   # → true
```

---

## 17. Bitácora / change log (mantener append-only)

| Fecha      | Fase | Cambio                                                                                                                                          | Evidencia | Aprobó |
| :--------- | :--- | :---------------------------------------------------------------------------------------------------------------------------------------------- | :-------- | :----- |
| 2026-06-24 | —    | Perfil corporativo: Snowflake único proveedor de datos, Microsoft 365 (reemplaza Google), Slack canal único (reemplaza WhatsApp). Reemplaza 002 | este doc  | —      |
|            | F0   | _resultado eval de modelo_                                                                                                                      | _link_    |        |
|            | F1   | _instancia base_                                                                                                                                | _link_    |        |
|            | F2   | _app + inferencia/embeddings/whisper local + Snowflake_                                                                                         | _link_    |        |
|            | F3   | _Slack único + Microsoft 365_                                                                                                                   | _link_    |        |
|            | F4   | _Snowflake final + endurecimiento + go-live_                                                                                                    | _link_    |        |
