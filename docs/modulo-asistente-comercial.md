# Módulo Asistente Comercial (Comercial → Asistente) y Parámetros de cotización

Un asistente con IA para los vendedores de ABA. Arma presupuestos (orden borrador en Odoo y el
PDF de la Propuesta Técnico-Económica), re-emite presupuestos viejos a valor de hoy y contesta
consultas sobre Odoo (clientes, presupuestos, saldos, obras y pendientes del día) y sobre el
Tablero de Planificación (qué tiene cada cuadrilla, qué hay libre, cuándo se arma una obra).
Del tablero sólo lee. Se le puede
escribir, dictar o mandar audios, hablar en vivo por voz, y escribir por WhatsApp.

Estado: **en producción** desde el 2026-09-26 (commit `d4538c5`), con las migraciones 1 a 4
aplicadas en Supabase. La voz (audios y voz en vivo) está configurada con ElevenLabs.
WhatsApp espera la cuenta de Meta (§ WhatsApp).

---

## Qué reemplaza

| Antes | Ahora |
| --- | --- |
| La skill `andamios-propuesta` de Claude: la usaba Joaquín, con scripts Python | El mismo trabajo dentro de la app, para Gabriel, Jorge y Joaquín, desde el celular |
| El documento *ABA Criterio de Cotización v2*, con tarifas escritas en el texto | **Parámetros de cotización**: las tarifas en una tabla que usa el motor, y el criterio escrito aparte y versionado |
| Cuentas a mano o por la IA | Un **motor de precios** determinístico: la IA decide qué cotizar, pero los importes salen del motor |
| `configuracion/precios-fachadas` | Retirada. Sus 8 claves en `configuracion` no las lee nadie y se pueden borrar |

---

## Cómo se usa

**Pantalla** `/comercial/asistente` (pensada primero para el celular):

- La lista de conversaciones está a la izquierda (en el celular, en una hoja) y el chat en el
  centro.
- **El presupuesto en construcción** está a la derecha (en el celular, en el botón con el
  importe). Muestra las líneas, los totales, la renovación, lo que falta y los avisos.
- Compositor:
  - texto;
  - clip para fotos, planos en PDF o un audio reenviado;
  - micrófono para grabar un audio que se transcribe (queda en el cuadro para revisarlo);
  - con el cuadro vacío, el botón de la derecha es **Hablar** (voz en vivo).
- Tarjetas:
  - la acción a confirmar, con los botones Confirmar y Cancelar;
  - el PDF, para verlo, descargarlo o compartirlo directo a WhatsApp desde el celular;
  - el mensaje para el cliente, listo para copiar.

**Nada se escribe en Odoo sin confirmación.** El asistente propone la acción y lee el resumen.
El vendedor confirma de una de dos maneras:

- con el **botón**;
- con un **«sí, dale»** escrito o hablado. En este caso decide el servidor, no el modelo:
  - la acción tiene que ser de esta conversación y haberse presentado en el turno
    inmediatamente anterior;
  - el presupuesto no tiene que haber cambiado desde entonces;
  - no tienen que haber pasado 30 minutos;
  - el mensaje tiene que ser una afirmación clara, sin «pero», «esperá» ni cambios. Para
    mandar un mail tiene que decir que lo mande («mandalo»).

Cualquier cambio en el presupuesto vence la acción y hay que volver a proponerla.

**Qué escribe en Odoo** (sólo después de confirmado):

- da de alta el cliente (por CUIT, sin duplicar);
- crea o actualiza la orden en **borrador**: nunca la confirma y nunca crea productos;
- completa la solapa "Trabajo a ejecutar";
- vincula la oportunidad del CRM, sin moverla de etapa;
- deja una nota con quién lo pidió y los desvíos de tarifa;
- adjunta el PDF final;
- al re-emitir, cancela la orden vieja;
- manda el mail con la plantilla de la casa.

Cada orden lleva `x_asistente_ref`, así un reintento no duplica nada. Después de guardar, el
neto de Odoo tiene que coincidir con el del motor.

**Tope de gasto:** `asistente_tope_diario_usd` (hoy US$ 30 por persona y por día). Se cambia en
Parámetros.

---

## Parámetros de cotización (`/comercial/parametros`)

| Pestaña | Qué es | Quién la cambia |
| --- | --- | --- |
| Tarifas | Los números del motor: bandejas, fachadas, alquiler, mano de obra, complementarios, viáticos, reglas, asistente (modelo, esfuerzo, esfuerzo en voz, tope) y Odoo (ids de impuesto, plazo de pago, lista y plantilla) | Módulo `parametros-cotizacion` con permiso de edición. El motivo es obligatorio y queda en el historial |
| Lista de alquiler | La lista de piezas (hoy JUN26, 48 piezas). Se importa desde el `.xlsx`, se ajusta en masa por % con vista previa y se activa | Ídem |
| Criterio | El criterio escrito (markdown, versionado) que lee el modelo. Los números no van acá: el texto dice *[Parámetro: …]*, y si algo no coincide, manda la tabla | Ídem |
| Productos de Odoo | Con qué producto sale cada línea. No se edita: sólo se verifica contra Odoo | Ídem (verificar) |
| Renders | La biblioteca de imágenes por tipo de sistema para la "representación gráfica" | Ídem |
| Vendedores | El nombre que sale como "Vendedor asignado" y **el WhatsApp de cada uno** | El nombre, quien edita parámetros. **El WhatsApp, sólo un admin**: con ese número se le habla al asistente como esa persona |
| Historial | Cada cambio de tarifa, con el valor anterior, quién, cuándo y por qué | — |

Una conversación **congela** el prompt del sistema (criterio y tarifas) al crearse. Si una
tarifa cambia en el medio, el asistente se entera por un aviso dentro de la charla y los
importes siempre se recalculan con la tarifa vigente.

---

## Voz

Dos cosas distintas, las dos con ElevenLabs:

1. **Audios** (micrófono de la pantalla o audio reenviado): se transcriben con Scribe v2 en
   castellano, con palabras de la casa para la jerga de obra. Alcanza con `ELEVENLABS_API_KEY`.
2. **Voz en vivo** (botón Hablar): una charla de ida y vuelta, como por teléfono, que se puede
   interrumpir. ElevenLabs escucha, maneja los turnos y habla. **El que piensa es el mismo
   asistente**: ElevenLabs llama a `/api/comercial/asistente/voz/llm` como si fuera su modelo
   (formato OpenAI). Ahí corre el mismo turno, con las mismas herramientas y el mismo
   borrador. La pantalla se va actualizando mientras se habla.

   En voz:
   - el esfuerzo del modelo es el de `asistente_esfuerzo_voz` (hoy `medium`), para que tarde
     menos en contestar;
   - si a los 3 s no dijo nada, la voz dice sola una frase de espera («A ver...»);
   - las respuestas son cortas, sin markdown y con los números dichos en palabras.

   Medido: una consulta con dos búsquedas en Odoo tarda ~12 s en total, con la primera
   palabra a los 3 s.

### Configurar ElevenLabs (una vez)

Estado (2026-09-26): **configurado**. El agente es "Asistente ABA"
(`agent_6901m3exw16xeykr468230jm6t73`), las tres variables están en Vercel (Production) y la
cadena se probó con el agente real en modo texto.

Si hay que rehacerlo:

1. Crear la cuenta de ElevenLabs.
2. **Desarrolladores → Claves API**: crear una clave restringida a **De voz a texto** y
   **ElevenLabs Agents (escritura)**. Va a `ELEVENLABS_API_KEY`. Con esa clave el agente se
   puede configurar por API (`PATCH /v1/convai/agents/{id}`), que es como se hizo.
3. Crear un agente en blanco (**Agents → Nuevo agente**) y dejarlo así:

   | Qué | Valor | Por qué |
   | --- | --- | --- |
   | Idioma | `es` | De eso depende que entienda lo que se le dice |
   | Modelo de voz | `eleven_flash_v2_5` | El `eleven_flash_v2` sólo habla inglés |
   | Voz | una argentina, a elección (p. ej. *Amanda – Warm Argentine Narrator*) | — |
   | Primer mensaje | «Hola, te escucho.» | — |
   | LLM | **Custom LLM**: URL `https://andamios-os.vercel.app/api/comercial/asistente/voz/llm`, Model ID `asistente-aba`, API key = un secreto con el valor de `ELEVENLABS_LLM_SECRETO` (`openssl rand -hex 32`) | ElevenLabs le agrega `/chat/completions` (también existe el alias `/v1/chat/completions`) |
   | LLM de respaldo | **Desactivado** | Si nuestro servidor tarda o falla, un modelo de respaldo contestaría sin ver Odoo ni las tarifas, o sea que inventaría precios |
   | `cascade_timeout_seconds` | **15** | Con el valor de fábrica (4 s), si el servidor arranca en frío la frase de espera llega tarde, ElevenLabs repite el pedido y el turno se procesa dos veces |
   | Tiempo de espera suave | Desactivado | La frase de espera ya la dice nuestro endpoint a los 3 s |
   | Keywords (ASR) | andamio, bandeja, concertina, multidireccional, fenólico, media sombra, silleteros, Odoo, CUIT, UOCRA, CAC, gestoría… | Jerga de obra |
   | Duración máxima | 1800 s | La de fábrica es 10 minutos |
   | Autenticación | activada, con `andamios-os.vercel.app` en la lista permitida | Sólo arranca con el token que da nuestro servidor |
   | Override `custom_llm_extra_body` | **permitido** | Por ahí viaja el token de sesión firmado; sin esto nuestro endpoint rechaza todo |

4. El id del agente va a `ELEVENLABS_AGENT_ID`.
5. Cargar las tres variables en Vercel (Production) y hacer el redeploy. Con la clave sola
   aparece el micrófono; con las tres, el botón Hablar.

Cómo se protege el endpoint público de voz:

- Autorización: el secreto del agente (`ELEVENLABS_LLM_SECRETO`).
- Identidad: el navegador arranca la sesión con un token nuestro, firmado y válido por 2 h,
  que dice quién habla y en qué conversación (`customLlmExtraBody`). ElevenLabs lo devuelve
  en cada pedido (`elevenlabs_extra_body`).
- De lo que manda ElevenLabs se usa sólo la última frase del vendedor. La historia verdadera
  está en nuestra base.

---

## WhatsApp

El vendedor le escribe al número del asistente, como a una persona: texto, audios (se
transcriben), fotos, planos en PDF o una ubicación. Contesta el mismo asistente:

- el texto sale con el formato de WhatsApp;
- el PDF sale como documento;
- el mensaje para el cliente va aparte, para reenviarlo tal cual;
- lo que hay que confirmar llega con **botones Confirmar / Cancelar** (también vale contestar
  «sí»).

Cómo maneja las conversaciones:

- **Una conversación de WhatsApp** sigue viva mientras no pasen 12 h sin mensajes. Escribir
  «nueva» arranca otra. Las conversaciones de WhatsApp aparecen en la pantalla y se pueden
  seguir desde ahí.
- **Mensajes cortados** ("hola" / "necesito cotizar" / "una bandeja…"): se juntan en una sola
  consulta. Hay un turno por teléfono (`whatsapp_tomar_turno`) y el que lo tiene, al terminar,
  se fija si llegó algo más.
- **Un número que no está cargado** en Vendedores recibe una vez por día un aviso de que el
  número es de uso interno, y nada más.

Cómo se protege: el webhook `/api/whatsapp/webhook` es público y valida la firma de Meta
(HMAC con la clave de la app). Cada mensaje se anota una sola vez aunque Meta reintente. El
teléfono identifica al vendedor, que además tiene que tener el módulo con permiso de edición.

### Configurar WhatsApp (una vez; la verificación de Meta puede tardar días)

1. **Un número dedicado**, que no esté en uso en la app de WhatsApp (si lo está, hay que
   borrar esa cuenta primero).
2. En developers.facebook.com, con el portfolio de Meta Business de ABA, crear una app de tipo
   **Business** y agregarle el producto **WhatsApp**. Registrar el número (se verifica por SMS
   o llamada) y pedir la aprobación del nombre visible.
3. **Business Settings → Usuarios del sistema**:
   - crear uno (admin);
   - asignarle la app y la cuenta de WhatsApp con control total;
   - generar un token **sin vencimiento** con los permisos `whatsapp_business_messaging` y
     `whatsapp_business_management`.

   El token va a `WHATSAPP_TOKEN`.
4. **WhatsApp → Configuración de la API**: el *Phone number ID* (no el número) va a
   `WHATSAPP_PHONE_NUMBER_ID`.
5. **Configuración de la app → Básica**: la *Clave secreta de la app* va a
   `WHATSAPP_APP_SECRET`.
6. Inventar un token de verificación (`openssl rand -hex 16`) para `WHATSAPP_VERIFY_TOKEN`.
7. Cargar las cuatro variables en Vercel y hacer **el deploy antes del paso siguiente**: la
   verificación del webhook compara el token.
8. **WhatsApp → Configuración → Webhook**:
   - URL: `https://andamios-os.vercel.app/api/whatsapp/webhook`, con el token del paso 6;
   - Verificar y guardar;
   - suscribir el campo **messages**.
9. Pasar la app a modo **Live**.
10. **Parámetros de cotización → Vendedores**: un admin carga el WhatsApp de cada uno
    (54 9 + área + número, sin 0 ni 15).

No hacen falta plantillas: el asistente sólo contesta, siempre dentro de las 24 h desde el
último mensaje del vendedor.

---

## Cómo está hecho

```
 Pantalla (texto, dictado, adjuntos) ─┐
 Audios (Scribe → texto) ─────────────┤
 Voz en vivo (ElevenLabs Agents) ─────┼──► turno.ts ──┬─ Odoo (lectura; escritura sólo confirmada)
 WhatsApp (webhook de Meta) ──────────┘   (Claude)    ├─ motor de precios (src/lib/cotizador)
                                                      ├─ borrador del presupuesto (objeto)
                                                      ├─ acciones con confirmación
                                                      └─ PDF de la propuesta (@react-pdf)
```

**Un solo cerebro** (`src/lib/asistente/turno.ts`). Es un loop propio sobre la API de Mensajes
de Anthropic en streaming:

- modelo `claude-opus-5`, configurable en Parámetros;
- razonamiento adaptativo y esfuerzo desde Parámetros;
- *fallback* del lado de Anthropic;
- hasta 15 vueltas o 240 s por turno;
- un turno a la vez por conversación.

Cada canal sólo cambia cómo entra el texto y cómo sale.

**La historia es append-only** (`asistente_mensajes.contenido` es `json`, no `jsonb`, a
propósito). Se reenvía idéntica, y así funcionan el caché de la API y los bloques de
razonamiento. El prompt del sistema se congela por conversación, en tres bloques. El último
tiene caché de 1 h.

| Carpeta / archivo | Qué hay |
| --- | --- |
| `src/lib/cotizador/` | Motor de precios: bandeja, fachada, alquiler, mano de obra, complementarios, totales, chequeos, montos en letras, CUIT. Funciones puras con tests. `pdf/`: la propuesta en PDF (port de `generar_propuesta.py`, con paridad visual) |
| `src/lib/asistente/` | `turno.ts` (el loop), `prompt.ts` (instrucciones y aviso por turno), `herramientas.ts` (~30 herramientas con zod), `borrador.ts`, `acciones.ts` + `ejecutores.ts` (confirmación y escritura), `confirmacion.ts` (qué cuenta como «sí»), `datos.ts`, `nueva-conversacion.ts` |
| `src/lib/odoo/comercial.ts` | Lecturas: clientes, presupuestos, PDF adjuntos, precios recientes, conflicto de canal, pendientes del día, estado de obra, `consultar_odoo` (sólo lectura, sobre res.partner, sale.order y sus líneas, crm.lead, account.move, account.payment, OT, obras, productos y empleados) |
| `src/lib/odoo/presupuestos.ts` | Escrituras (sólo desde una acción confirmada) |
| `src/lib/asistente/planificacion.ts` | El tablero, **sólo lectura**, con la misma fuente y las mismas cuentas que la pantalla (`fetchTablero`, tareas de Operaciones, duración corregida por Operaciones, `ocupacionCelda`, `repartirJornadas`). Exige el permiso de Planificación |
| `src/lib/voz/` | ElevenLabs (Scribe y token del agente) y el token de sesión firmado |
| `src/lib/whatsapp/` | API de Meta, formato de WhatsApp y el procesamiento de lo que llega |
| `src/app/api/comercial/asistente/` | chat (SSE), conversaciones, acciones (botón), adjuntos (URL firmada), PDFs, transcribir, voz (token y endpoint del LLM) |
| `src/app/api/comercial/parametros/` | Tarifas, historial, criterio, lista de alquiler, productos, renders, vendedores |
| `src/app/api/whatsapp/webhook/` | El webhook de Meta |

**Datos** (migraciones `20260926000001` a `…04`):

- `cotizacion_parametros` (+ `_cambios`), `cotizacion_criterios`, `lista_alquiler` (+ `_piezas`),
  `cotizacion_renders`, `cotizacion_productos_odoo`;
- `asistente_conversaciones`, `asistente_mensajes`, `cotizacion_borradores` (+ `_cambios`),
  `asistente_acciones` (+ `_eventos`), `cotizacion_pdfs`, `comercial_vendedores`;
- `whatsapp_entrantes`;
- bucket privado `comercial`.

Los usuarios leen lo suyo (un admin, todo) y escribe sólo el servidor.

**Permisos:** hay dos módulos, `asistente-comercial` y `parametros-cotizacion`, en el grupo
Comercial. Para usar el chat hace falta el de edición. Las rutas con service role vuelven a
chequear el permiso (`exigirModulo`). Los dos endpoints públicos son el LLM de voz y el
webhook de WhatsApp, y cada uno tiene su secreto o firma.

---

## Cómo se prueba

| Qué | Cómo | Costo |
| --- | --- | --- |
| Motor, confirmación y formato de WhatsApp | `npm test` | — |
| Punta a punta con Odoo | `npx tsx --env-file=.env.local --tsconfig tsconfig.json scripts/test-asistente-e2e.mts`: cliente nuevo, presupuesto, «sí, dale», orden en Odoo verificada. Borra todo al final | ~US$ 1 |
| Voz en vivo (sin ElevenLabs) | `… scripts/test-asistente-voz.mts`: se hace pasar por ElevenLabs contra el endpoint | ~US$ 0,50 |
| WhatsApp (sin Meta) | `… scripts/test-asistente-whatsapp.mts`: avisos firmados simulados y la API de Meta interceptada; la acción se cancela, no escribe en Odoo | ~US$ 1 |
| PDF contra la skill | `node scripts/pdf-paridad.mjs` (necesita la skill descomprimida y PyMuPDF) | — |
| Migración nueva | `node --env-file=.env.local scripts/probar-migracion.mjs <archivo>` (la corre dos veces y hace ROLLBACK); después `scripts/apply-migration.mjs`. Nunca `supabase db push` | — |

---

## Costos (medidos en las pruebas)

- **Claude**:
  - primer turno de una conversación: ~US$ 0,50 (escribe el caché del prompt);
  - los siguientes: US$ 0,08 a 0,20;
  - un presupuesto completo conversado: ~US$ 1 a 3.

  La pantalla de uso por persona sale de `asistente_mensajes.uso`.
- **ElevenLabs**: la voz en vivo se cobra por minuto según el plan; transcribir, ~US$ 0,40 por
  hora de audio.
- **WhatsApp**: responder dentro de las 24 h de un mensaje del vendedor no tiene costo de Meta.

---

## Pendiente

- Alta de Gabriel y Jorge con `asistente-comercial` (edición).
- Elegir la voz del agente (hoy tiene una de fábrica) y probar la voz en vivo desde el celular.
- WhatsApp (postergado): cuenta de Meta (§ WhatsApp) y después cargar los WhatsApp en
  Vendedores.
- **Rotar la API key de Odoo** que está en texto plano en `references/odoo.md` de la skill.
- Piloto: Joaquín hace 5 presupuestos reales en paralelo con la skill y compara número por
  número antes de dárselo a Gabriel y Jorge.
- Revisión visual en el celular (iPhone y Android), sobre todo de la voz en vivo.
- Borrar las 8 claves viejas de `configuracion` que cargó la migración `20260403000001`
  (`precio_m2_fachada`, `precio_ml_bandeja`, `precio_gestoria_permiso`, `precio_ingenieria`,
  `precio_syh_jornada`, `multiplicadores_comerciales`, `condicion_pago_default` y
  `validez_oferta_dias`), cuando se confirme que no se extrañan. No las lee ningún código.
- Más adelante: la llamada telefónica (el mismo agente de voz con un número de Twilio).
