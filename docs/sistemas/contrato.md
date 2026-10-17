# Módulo Sistemas: contrato de construcción (etapa 1)

Fecha: 17/10/2026. Rama `feat/sistemas`, worktree `.claude/worktrees/sistemas`.

Este documento fija lo que comparten los cuatro constructores que trabajan en paralelo:
**API**, **CAPTURA**, **UI** y **RECORRIDO**. Leelo entero antes de escribir código. Para
el producto, mirá `docs/sistemas/propuesta.md` (§1, §2 y §5 «Lo que decidió JS») y la maqueta
`docs/sistemas/maqueta.html`: copiá sus textos y su comportamiento.

Ya están escritos y ensayados (no los toques):

- `supabase/migrations/20261022000001_sistemas.sql`: tablas, RLS, `sis_puede_revisar()`, las 4 RPC, la auditoría y el permiso de los dos revisores.
- `supabase/migrations/20261022000002_sistemas_storage.sql`: bucket privado `sistemas`.
- `supabase/migrations/20261022000003_recorridos.sql`: `recorridos_vistos`.
- `src/lib/sistemas/tipos.ts`: tipos, constantes, textos y funciones puras compartidas.

Si te falta algo en `tipos.ts`, **no lo edites**: definilo en un archivo tuyo y avisalo en tu
resumen final. El orquestador lo integra después.

---

## 0. Reglas para todos

- **Textos:** se dice siempre «Sistemas», nunca un nombre propio. Español rioplatense con voseo y sin jerga técnica para el usuario. Los textos ya están en `tipos.ts` (`TEXTOS`, `TIPOS`, `ESTADOS`, `MOTIVOS`, `PASOS_RECORRIDO`, etc.): usalos de ahí, no los copies.
- **Next 16:** antes de usar una API de Next, leé `node_modules/next/dist/docs/`. No hay server actions: todo va por route handlers con zod, `export const dynamic = "force-dynamic"` y hooks de React Query en `src/hooks/use-*.ts`.
- **UI:** usá los componentes de `src/components/ui` (base-ui usa `render={...}`, no `asChild`), íconos de `lucide-react`, los tokens de `globals.css` y toasts con `sonner`.
- **Comentarios:** en español, con la densidad y el tono del código vecino.
- **Tests:** van con `node:test` en `src/lib/**/*.test.ts`, importando con extensión `.ts` (`npm test`). Antes de terminar, corré `npx tsc --noEmit -p .`, `npm test` y `npx eslint <tus archivos>`.
- **Migraciones sin aplicar:** el código tiene que andar aunque todavía no estén aplicadas. Ver §11.
- **Prohibido:** commit, push, deploy y aplicar migraciones. Tampoco escribas en `/Users/joaquin/Desktop/Proyectos/AndamiosOS` (la copia principal) ni en carpetas con sufijo « 2».
- **`npm install`:** sólo lo corre CAPTURA, y sólo para sumar `@zumer/snapdom@3.3.4`.

---

## 1. Quién es dueño de qué

Cada constructor edita **sólo** sus archivos. Si para algo necesitás tocar un archivo ajeno,
no lo hagas: dejá el pedido en tu resumen.

| Constructor | Archivos |
|---|---|
| **API** | `src/app/api/sistemas/**` (incluye `_comun.ts`), `src/lib/sistemas/{validar,contexto,prompt-claude,servidor,rutas}.ts` y sus `*.test.ts`, `src/lib/auth/acceso.ts`, `src/lib/auth/acceso.test.ts`, `src/lib/auth/explicitos-servidor.ts`, `src/lib/direccion/auditoria.ts` (sólo para sumar `"permiso_sistemas"` a `AccionAuditoria`), `src/lib/alertas/servicio.ts`, `src/lib/alertas/slack.ts`, `src/components/alertas/presentacion.tsx`, `src/lib/constants/navigation.ts` |
| **CAPTURA** | `package.json` y `package-lock.json` (sólo `@zumer/snapdom` `3.3.4` exacta), `next.config.ts`, `src/instrumentation-client.ts`, `src/lib/sistemas/{captura-cliente,contexto-cliente,captura-pantalla,lienzos-webgl,imagen}.ts` (y sus tests si los hay), `src/components/sistemas/editor-marcas.tsx`, y en `src/components/mapa-obras/ciudad/ciudad-armada-mapa.tsx`, `src/components/hoja-dia/pizarron/mini-mapa.tsx` y `src/components/tecnica/modelador/vista3d/escena.ts` sólo lo necesario para registrar la foto (§6.5) |
| **UI** | `src/components/sistemas/**` salvo `editor-marcas.tsx`, `src/hooks/use-sistemas.ts`, `src/components/layout/header.tsx`, `src/components/layout/campanita.tsx` (sólo para sumar `data-tour="campanita"`), `src/components/layout/command-search.tsx`, `src/app/(dashboard)/sistemas/**` |
| **RECORRIDO** | `src/lib/recorridos/**` (y sus tests), `src/components/recorridos/**`, `src/hooks/use-recorrido-obligatorio.ts`, `src/hooks/use-tour.ts` (sólo para extraer una fábrica de driver compartida, sin cambiar cómo se comporta Habilitaciones), `src/app/(dashboard)/layout.tsx`, y en `src/app/globals.css` sólo los estilos del recorrido |
| **Contrato (no tocar)** | `supabase/migrations/2026102200000{1,2,3}_*.sql`, `src/lib/sistemas/tipos.ts`, `docs/sistemas/**` |

`src/lib/supabase/proxy.ts` no se toca: el proxy ya usa `acceso.ts`, así que alcanza con lo
de §4.

### Qué importa cada uno del otro

```
UI        ← tipos.ts, captura-pantalla.ts, contexto-cliente.ts, imagen.ts, editor-marcas.tsx (CAPTURA), use-sistemas.ts (propio)
RECORRIDO ← tipos.ts (EVENTOS, DATA_TOUR, PASOS_RECORRIDO, RECORRIDO, BIENVENIDA, ATRIBUTO_RECORRIDO_ACTIVO)
API       ← tipos.ts, acceso.ts, servicio.ts (propios)
CAPTURA   ← tipos.ts
```

Mientras CAPTURA no termine, UI puede programar contra las firmas de §6. Son exactas: no
improvises nombres.

---

## 2. Datos (ya escritos en las migraciones)

### Tablas

- **`sis_reportes`**: `id` uuid, `numero` (el #N, identity único), `tipo`, `descripcion`, `frena`, `estado`, `motivo_descarte`, `duplicado_de`, `prioridad`, `ruta`, `modulo`, `titulo_pantalla`, `sha_cliente`, `sha_servidor`, `contexto` jsonb, `creado_por`, `created_at`, `updated_at`, `ultima_actividad_at`, `cerrado_at`, `confirmado_ok`.
  - Checks: descartado ⇔ motivo; `duplicado_de` sólo con motivo `duplicado`; `frena` sólo en `error`.
- **`sis_reporte_capturas`**: `id`, `reporte_id`, `path` (único), `mime`, `bytes` (≤ 5 MB), `ancho`, `alto`, `orden` (0 a 5, único por reporte, así que hay 6 como máximo).
- **`sis_reporte_eventos`**: la línea de tiempo.
  - Campos: `id` bigint, `reporte_id`, `tipo` (`creado` | `comentario` | `estado` | `prioridad` | `duplicado`), `lado` (`usuario` | `sistemas`), `autor_id` (la sesión no lo puede leer: permiso por columna; la bandeja lo lee con la service role), `de`, `a`, `texto`, `created_at`.
  - En `estado` y en `prioridad`, `de` y `a` son códigos. En `duplicado`, `a` es el #N del original.
- **`recorridos_vistos`**: `(usuario_id, clave, version)` como PK, `pasos_total`, `dispositivo`, `visto_at`.

### RLS

- **`sis_*`:** se lee lo propio o, si `sis_puede_revisar()`, todo.
  - `sis_puede_revisar()` exige que el usuario esté activo y tenga `permisos->>'sistemas' = 'editar'`, sin atajo de admin. Un admin sin el módulo **no ve reportes ajenos** (ensayado).
- **Eventos:** quien reportó ve sólo `creado`, `comentario` y `estado`.
- **Escritura:** no hay políticas ni grants de escritura en `sis_*`. Todo se escribe por RPC.
- **`recorridos_vistos`:** cada uno lee lo suyo (el admin lee todo) y sólo inserta a su nombre. No se puede hacer UPDATE ni DELETE.

### Revisores

La migración 1 les da `sistemas: editar` a `js@` y a `jpm@andamiosbuenosaires.com.ar`.

### RPC

Se llaman con el cliente **de la sesión** (`createClient()` de `src/lib/supabase/server.ts`),
porque usan `auth.uid()`.

Los errores para mostrar son `RAISE EXCEPTION` (código `P0001`) con el texto listo para el toast.
Se devuelven tal cual con status 400.

| RPC | Quién | Devuelve (jsonb) |
|---|---|---|
| `sis_crear_reporte(p jsonb)` | Cualquiera activo. Hasta 20 reportes en 24 horas. | `{ id, numero }` |
| `sis_revisar_reporte(p_id uuid, p jsonb)` | Revisor | `{ id, numero, creado_por, estado_anterior, estado, cambio_estado, cambio_prioridad, motivo_descarte, estado_evento_id, comentario_id, duplicados: [{ id, numero, creado_por }] }` |
| `sis_comentar(p_id uuid, p_texto text, p_como text)` | `p_como = 'usuario'`: quien reportó, mientras no esté cerrado. `'sistemas'`: un revisor. | `{ id, reporte_id, numero, creado_por, lado, estado_anterior, estado }` |
| `sis_confirmar(p_id uuid, p_ok boolean, p_texto text)` | Quien reportó, sobre uno `resuelto` | `{ numero, creado_por, estado, reabierto, evento_id }` |

**`sis_crear_reporte`:**

- Recibe `p = { tipo, descripcion, frena, ruta, modulo, titulo_pantalla, sha_cliente, sha_servidor, contexto, capturas: [{ path, mime, bytes, ancho, alto }] }`, en snake_case.
- Valida todas las imágenes **antes** de insertar, así un rechazo no gasta un #N.
- Cada `path` tiene que cumplir `^<uid>/<uuid>\.(png|jpg|webp)$` y ya estar en `storage.objects` del bucket `sistemas`.
- El tipo y el tamaño los toma de la metadata de Storage, no de lo que diga el navegador.
- Deja el evento `creado`.

**`sis_revisar_reporte`:**

- Recibe `p = { estado?, prioridad? (con la clave presente y valor null quiere decir «Sin definir»), motivo_descarte?, duplicado_de?, mensaje? }`.
- Si se descarta, el motivo es obligatorio. Con `duplicado`, `duplicado_de` se resuelve a su raíz, y los duplicados del reporte pasan al mismo original.
- Si el estado sale de `descartado`, borra el motivo y el original.
- Al pasar a `resuelto` o `descartado`, pone `cerrado_at`. Cualquier cambio de estado vuelve `confirmado_ok` a NULL.
- Si viene `mensaje`, deja un `comentario` del lado `sistemas`.
- **Al resolver un original:** deja en cada duplicado el comentario `TEXTO_DUPLICADO_RESUELTO` y los devuelve en `duplicados`, para que la API les avise.
- Si nada cambia, no deja eventos.

**`sis_comentar` como `'sistemas'` sobre un reporte `nuevo`:** lo pasa a `visto`, con su evento de estado.

**`sis_confirmar`:**

- Con `p_ok = true`: guarda `confirmado_ok = true` y el comentario «Ya está, gracias.».
- Con `p_ok = false`: pasa el reporte a `visto`, borra `cerrado_at`, deja el evento de estado del lado `usuario` y el comentario «Sigue pasando.» (más el texto, si vino).

### Storage

- Bucket privado `sistemas`, de 5 MB, que acepta png, jpeg y webp.
- **Sin políticas para `authenticated`:**
  - Para subir, la API firma la subida con la service role (`createSignedUploadUrl`) y el navegador usa `uploadToSignedUrl`.
  - Para leer, la API firma con `createSignedUrls`: 600 s en las pantallas y 3600 s para el prompt.

---

## 3. Endpoints

Todos van en `src/app/api/sistemas/**` y llevan `export const dynamic = "force-dynamic"`.
Validan con zod (`src/lib/sistemas/validar.ts`). Los errores son siempre `{ error: string }`
(`RespuestaError`).

Los tipos de las respuestas están en `tipos.ts`. Los nombres van en camelCase.

**Segunda llave:**

- `exigirSesion()` en las rutas de «todos» (devuelve `{ userId, acceso }` o 401).
- `exigirRevisor()` = `exigirModulo(["sistemas"], "editar")` de `src/lib/auth/servidor.ts`, en todas las de revisión, **incluidos los GET** (con `sistemas: ver` no se ve nada).

Las dos van en `src/app/api/sistemas/_comun.ts`, junto con `errorResponse(e)` (P0001 → 400) y
`sinInstalar(error)` → 503 `MENSAJE_SIN_INSTALAR`.

La service role (`createAdminClient()`) se usa sólo **después** de la llave que corresponde:
para firmar URLs, leer nombres de `user_profiles`, armar métricas y crear alertas. Las
escrituras van siempre por RPC con la sesión.

### De todos (`APIS_DE_TODOS += "/api/sistemas/reportes"`)

| Método y ruta | Entrada | Respuesta |
|---|---|---|
| `POST /api/sistemas/reportes/subidas` | `PedidoSubidas`: `{ archivos: { mime, bytes }[] }`, de 1 a 6, con `mime` ∈ `MIMES_IMAGEN` y `bytes` de 1 a 5 MB | 200 `RespuestaSubidas`: `{ subidas: { path, token }[] }`, en el mismo orden. `path = <userId>/<randomUUID()>.<EXTENSION_MIME[mime]>` |
| `POST /api/sistemas/reportes` | `CrearReporteBody` (ver abajo) | 201 `CrearReporteRespuesta`: `{ id, numero, frena }` |
| `GET /api/sistemas/reportes` | — | 200 `MisReportesRespuesta`: `{ reportes: ReporteUsuario[] }` |
| `POST /api/sistemas/reportes/[id]/comentarios` | `ComentarBody`: `{ texto }`, de 1 a 5000 | 201 `ComentarRespuesta`: `{ evento: EventoPublico }` |
| `POST /api/sistemas/reportes/[id]/confirmar` | `ConfirmarBody`: `{ ok, texto? }`, con `texto` de hasta 2000 | 200 `ConfirmarRespuesta`: `{ estado, reabierto }` |

**`POST /api/sistemas/reportes` (crear):**

- Recibe `tipo`, `descripcion` (de 3 a 5000 después de `trim`), `frena`, `ruta` (hasta 2000), `tituloPantalla` (hasta 200), `shaCliente` (hasta 64), `contexto` (`unknown`, se sanea) y `capturas` (`CapturaSubida[]`, hasta 6).
- El servidor:
  1. sanea `contexto` y `ruta` (`src/lib/sistemas/contexto.ts`, §6.3);
  2. calcula `modulo = moduloDeRuta(pathname)?.id ?? null`;
  3. calcula `sha_servidor = process.env.VERCEL_GIT_COMMIT_SHA ?? "local"`;
  4. llama a `sis_crear_reporte`;
  5. manda los avisos (§5).
- La pantalla que va en los títulos sale de `pantallaDeRuta(ruta)` (`src/lib/sistemas/rutas.ts`), **nunca** de un texto del cliente.

**`GET /api/sistemas/reportes` (mis reportes):**

- Trae los propios (`creado_por = userId`), ordenados por `ultima_actividad_at` descendente, hasta 100.
- Cada reporte lleva `capturas` firmadas a 600 s y `eventos` públicos ordenados por `id` ascendente. Los eventos no traen autor.
- `estadoOriginal`: para los duplicados, el estado del original, leído con admin. Del reporte ajeno no se devuelve nada más.
- `pantalla = pantallaDeRuta(ruta)`.

**Comentarios y confirmar:**

- `[id]/comentarios` llama a `sis_comentar(id, texto, 'usuario')`.
- `[id]/confirmar` llama a `sis_confirmar`.
- Si el reporte no es de quien llama, la RPC contesta «Ese reporte no existe.», que se devuelve como 404 o 400.

### Revisión (`APIS += "/api/sistemas/revision": ["sistemas"]`)

Todas pasan además por `exigirRevisor()`.

| Método y ruta | Entrada | Respuesta |
|---|---|---|
| `GET /api/sistemas/revision` | query `estado` (por defecto `nuevo`), `tipo?`, `frena=1?`, `q?` | 200 `RevisionLista`: `{ reportes: ReporteFila[], contadores, frenanAbiertos, metricas, shaActual }` |
| `GET /api/sistemas/revision/[id]` | — | 200 `RevisionDetalleRespuesta`: `{ reporte: ReporteDetalle, shaActual }`. Con `?abrir=1` (sólo el primer pedido de cada reporte en la pestaña): **si estaba `nuevo`, lo pasa a `visto`** (RPC `{ estado: "visto" }`), sin aviso. Sin el parámetro no cambia el estado. |
| `PATCH /api/sistemas/revision/[id]` | `RevisarBody`: `{ estado?, prioridad?, motivoDescarte?, duplicadoDe?, mensaje? }` | 200 `RevisarRespuesta` (= detalle fresco) |
| `POST /api/sistemas/revision/[id]/comentarios` | `ComentarBody` | 201 `ComentarRevisionRespuesta`: `{ evento: EventoRevision }` |
| `GET /api/sistemas/revision/[id]/candidatos` | — | 200 `CandidatosRespuesta`: `{ candidatos: ReporteFila[] }`. Son los otros reportes que no son duplicados: primero los del mismo `modulo` (o la misma ruta), después los más recientes. Hasta 20, sin el propio. |
| `GET /api/sistemas/revision/[id]/prompt` | — | 200 `PromptRespuesta`: `{ texto, capturas: { url, vence }[] }`, con URLs de 3600 s (§10) |

**`GET /api/sistemas/revision` (lista):**

- `q` busca en la descripción, en el nombre y el apellido de quien reportó y por número (`#12` o `12`).
- **Orden en las pestañas abiertas:** primero `frena`, después `created_at` ascendente (lo más viejo arriba). **En las cerradas:** `numero` descendente.
- `descripcion` va recortada a 300 letras.
- `contadores` cuenta los 5 estados sin aplicar los filtros.
- `shaActual = process.env.VERCEL_GIT_COMMIT_SHA ?? "local"`.

**`PATCH /api/sistemas/revision/[id]` (revisar):**

- El body se mapea a snake_case para `sis_revisar_reporte`.
- La validación con zod repite las reglas: descartado exige motivo, y `duplicado` exige `duplicadoDe` (uuid).
- `mensaje` es opcional, de 1 a 5000.

**Comentarios de revisión:** llaman a `sis_comentar(id, texto, 'sistemas')`.

**Métricas** (las calcula la API con admin; si una no se puede calcular, va `null`):

- `semana`: reportes de los últimos 7 días y cuántas personas distintas los mandaron.
- `primeraRespuestaDias`: promedio de días hasta el primer evento del lado `sistemas` que no sea `creado`, sobre los reportes de los últimos 30 días que ya lo tienen.
- `resolverDias`: promedio de `cerrado_at - created_at` de los resueltos de los últimos 30 días.
- `preguntamosPct`: porcentaje de los reportes de 30 días con algún comentario de `sistemas` que cumpla `esPregunta()`.
- `recorrido`: cuántos hicieron el recorrido (`recorridos_vistos` con `RECORRIDO.clave`/`version`) sobre los usuarios activos, sin la cuenta técnica (§8.4). Sin la tabla, va `null`.

### Cómo se calculan algunos campos

- **`ReporteFila.esperandoRespuesta`:** el último comentario es de `sistemas` y cumple `esPregunta(texto)`.
- **`ReporteFila.respuestaSinLeer`:** hay un comentario de `usuario` posterior al último evento de `sistemas`, sin contar el `creado`.
- **`ReporteDetalle.dispositivo`:** `contexto.dispositivo` o, si falta, `describirDispositivo(contexto.navegador.userAgent, contexto.pantalla.ancho, contexto.pantalla.alto)`.
- **`ReporteDetalle.avisadoEnSlack`:** `frena && !!process.env.SLACK_WEBHOOK_SISTEMAS`.
- **`EventoRevision.autorNombre`:** el nombre de quien hizo el evento. Sirve para el registro interno; en la conversación, el lado `sistemas` se firma siempre `REVISOR`.

---

## 4. Permisos y menú (API)

En `src/lib/auth/acceso.ts`, que es la única fuente:

- **Módulo nuevo** al final de `DEFINICION`, después de `configuracion`: `{ id: "sistemas", titulo: "Sistemas · Revisión", grupo: "Sistema", rutas: ["/sistemas/revision"], exigeExplicito: true }`. No lleva `soloLectura`: los revisores necesitan «editar».
- **`RUTAS_DE_TODOS`:** sumar `"/sistemas/mis-reportes"`. **No** sumar `"/sistemas"`: compara por prefijo y abriría la revisión.
- **`/sistemas` exacta:** sumar una lista `RUTAS_EXACTAS_DE_TODOS = ["/sistemas"]` que `puedeAbrir` compare con `pathname === r`. La página `/sistemas` sólo redirige a `/sistemas/mis-reportes`.
- **`APIS_DE_TODOS`:** sumar `"/api/sistemas/reportes"`.
- **`APIS`:** sumar `"/api/sistemas/revision": ["sistemas"]`. Como todos sus módulos son explícitos, al admin se lo mide como a cualquiera (ya lo hace `motivoDeRechazoApi`).
- **`motivoRechazoExplicitos`:** hoy termina en «Pedíselo a un socio.». Hay que dejar ese final sólo para `direccion-socios` y usar «Pedíselo a quien ya lo tenga.» para el resto, sin romper los tests que ya existen.
- **Tests en `acceso.test.ts`:**
  - un admin sin el módulo no abre `/sistemas/revision` y recibe un mensaje de rechazo en `/api/sistemas/revision`;
  - cualquiera activo abre `/sistemas/mis-reportes` y `/sistemas`, y usa `/api/sistemas/reportes`;
  - `/sistemas/revisionX` no queda abierta por prefijo.

En `src/lib/auth/explicitos-servidor.ts`, `registrarCambioExplicito` hoy registra siempre
`"permiso_socios"`. Hay que parametrizar la acción por módulo:

```ts
const ACCION: Partial<Record<ModuloId, AccionAuditoria>> = { "direccion-socios": "permiso_socios", sistemas: "permiso_sistemas" };
```

Va una fila por acción, con los módulos de esa acción. La migración 1 ya amplía el CHECK de
`direccion_auditoria`. En `src/lib/direccion/auditoria.ts` sumá `"permiso_sistemas"` a
`AccionAuditoria`.

En `src/lib/constants/navigation.ts`, en el grupo «Sistema», **antes** de Alertas:

```ts
{ title: "Sistemas", href: "/sistemas/mis-reportes", icon: LifeBuoy,
  subItems: [{ title: "Mis reportes", href: "/sistemas/mis-reportes" }, { title: "Revisión", href: "/sistemas/revision" }] }
```

`navegacionPara` ya esconde «Revisión» a quien no tiene el módulo.

---

## 5. Avisos y Slack (API)

**Tipos nuevos en `TipoAlerta`** (`servicio.ts`), con sus valores en `TIPOS_ALERTA` de `tipos.ts`:

| Tipo | Cuándo | A quién | Slack |
|---|---|---|---|
| `sistemas_reporte` | Reporte nuevo que no frena | Cada revisor activo | No |
| `sistemas_bloqueante` | Reporte nuevo que frena el trabajo | Cada revisor activo, con prioridad `alta` | `#sistemas`, **una sola vez** |
| `sistemas_novedad` | Cambio de estado (salvo a `visto`) o mensaje de Sistemas | Quien reportó; al resolver un original, también cada creador de sus duplicados | No |
| `sistemas_respuesta` | Mensaje o «Sigue pasando» de quien reportó | Cada revisor activo | No |

**Revisores activos:** `createAdminClient().from("user_profiles").select("id").eq("activo", true).eq("permisos->>sistemas", "editar")`.
Va en `revisoresActivos()` de `src/lib/sistemas/servidor.ts`.

**Reglas:**

- Nunca se le avisa a quien hizo la acción.
- Se crea siempre con `crearAlertas(createAdminClient(), …)`: la RLS de `alertas` no deja insertar a campo, depósito ni comercial.
- Cada alerta lleva `destinatarioId`.

**Títulos:** son genéricos, **sin la descripción**, porque cualquier admin ve todas las alertas. Salen de las funciones de `tipos.ts`:

- `tituloAlertaNuevo({ numero, pantalla, tipo, frena })`.
- `tituloAlertaEstado(numero, estado, motivo)`. A los duplicados les llega `tituloAlertaEstado(suNumero, "resuelto")`.
- `tituloAlertaMensaje(numero)`: «Sistemas te respondió sobre el #N».
- `tituloAlertaRespuesta(numero, siguePasando)`.
- Si en el mismo PATCH cambia el estado y viene un mensaje, va **un solo** aviso: el de estado.

**Enlaces:**

- Para quien reportó: `enlaceMisReportes(id)`, o sea `/sistemas/mis-reportes?id=<uuid>`.
- Para los revisores: `enlaceRevision(id)`, o sea `/sistemas/revision?id=<uuid>`.

**Claves** (únicas para siempre, según `alertas.clave`):

- Reporte nuevo: `sistemas:<numero>:nuevo:<destinatario>`.
- El resto: `sistemas:ev<eventoId>:<destinatario>`. El `eventoId` es `estado_evento_id`, `comentario_id`, el `id` de `sis_comentar` o el `evento_id` de `sis_confirmar`.
- Duplicado avisado al resolver el original: `sistemas:ev<estado_evento_id del original>:dup<idDuplicado>:<destinatario>`.

**Slack una sola vez:**

- Sumá a `NuevaAlerta` el campo opcional `espejoSlack?: boolean`, con `true` por defecto. `espejarEnSlack` filtra las que lo tienen en `false`.
- Para un bloqueante se crean las filas de todos los revisores con `espejoSlack: i === 0`.
- Si no hay ningún revisor aparte de quien reportó, no se crea ninguna alerta (los admins no pueden abrir la bandeja); si frena, sale sólo el eco a Slack (`ecoSlackReporteNuevo` + `soloSlack`).

**Cambios en `slack.ts`:**

- `Canal` suma `"sistemas"`, con `NOMBRE_CANAL.sistemas = "#sistemas"`.
- `webhookDe("sistemas") = process.env.SLACK_WEBHOOK_SISTEMAS`, **sin caer a otro canal**: si no está cargado, no se manda nada.
- `DESTINOS`: `sistemas_bloqueante: ["sistemas"]`; los otros tres, `[]`.
- `ESTILO`: bloqueante con `destacado: true`, `emoji: "🚨"`, `rotulo: "Frena el trabajo"`, `prefijos: ["Frena el trabajo:"]`. Ojo: `tituloLimpio` hoy sólo saca prefijos seguidos de « — »; ajustalo para que también saque `"<prefijo> "`.
- Los otros tres tipos llevan un estilo no destacado.

En `presentacion.tsx`, en `ICONOS`:

- `sistemas_reporte`: `Megaphone`.
- `sistemas_bloqueante`: `Flame`.
- `sistemas_novedad`: `LifeBuoy`.
- `sistemas_respuesta`: `MessageCircle`.

**Variable nueva:** `SLACK_WEBHOOK_SISTEMAS`, el Incoming Webhook del canal `#sistemas`. Si falta, no se manda nada a Slack.

---

## 6. Cliente: captura, contexto, imagen, editor y WebGL (CAPTURA)

### 6.1 `src/lib/sistemas/imagen.ts`

```ts
/** Lleva cualquier fuente a ImagenLista: lado largo ≤ LIMITES.ladoMax, WebP 0,85; si el navegador
 *  no genera WebP (blob.type !== "image/webp", Safari), PNG. Tira Error(TEXTOS.panel.imagenIlegible) si no la puede leer. */
export async function normalizarImagen(fuente: Blob | HTMLCanvasElement | ImageBitmap): Promise<ImagenLista>;
/** Para las imágenes que se descartan (cierra el panel, Quitar). */
export function liberarImagen(img: ImagenLista | null | undefined): void; // URL.revokeObjectURL
```

- Si el resultado pasa de `LIMITES.bytesImagen`, se reintenta con menos calidad o menos lado.
- **UI** la usa para «Sumar imagen» (archivo o galería), para pegar con Ctrl+V y para arrastrar.

### 6.2 `src/lib/sistemas/captura-pantalla.ts`

```ts
/** Saca la foto de lo que se ve. NUNCA tira: ante cualquier problema devuelve { ok: false, motivo }. */
export async function capturarPantalla(): Promise<ResultadoCaptura>;
```

1. Carga snapdom con `import("@zumer/snapdom")` (`3.3.4` exacta), recién en ese momento.
2. Congela los lienzos WebGL (§6.5).
3. Corre `snapdom(document.documentElement, { clip: "viewport", dpr: Math.min(devicePixelRatio, 2), scale: 1 })`. Excluye `[data-capture="exclude"]` con la opción de exclusión de snapdom (`EXCLUIR_CAPTURA`).
4. Descongela los lienzos en un `finally`.
5. Normaliza con `normalizarImagen`.

**Falla y devuelve `ok: false` si:**

- snapdom tira un error (`"error"`);
- tarda más de `LIMITES.capturaMs` (`"tiempo"`);
- la imagen sale casi uniforme (`"uniforme"`): se muestrean unos 200 píxeles de un canvas chico, y si la desviación es mínima se descarta;
- no hay `document` o la API necesaria (`"sin-soporte"`).

El `<main>` del dashboard tiene `overflow-auto` y snapdom lo respeta: se ve lo que el usuario ve.

### 6.3 `src/lib/sistemas/contexto-cliente.ts` y `src/instrumentation-client.ts`

**`src/instrumentation-client.ts`** instala buffers circulares en `window[CLAVE_BUFFERS]` (`BuffersSistemas`):

- **Errores**, los últimos `LIMITES.errores`:
  - `window` `error` y `unhandledrejection`;
  - `console.error` y `console.warn`, envolviéndolos y llamando **siempre** al original.
- **Pedidos**, los últimos `LIMITES.pedidos` que vuelven con `!res.ok` o con error de red:
  - guarda método, URL sin query, status, duración y `x-vercel-id`;
  - **no lee el body** y devuelve la **misma** Response;
  - ignora `/api/sistemas/*`.
- **Rutas**, las últimas `LIMITES.rutas`, con `export function onRouterTransitionStart(url)`.

Todo va en try/catch: **jamás puede romper la app**, tampoco el streaming del asistente.
Pesa poco: Next avisa si la inicialización pasa de 16 ms.

**`src/lib/sistemas/contexto-cliente.ts`:**

```ts
/** Lo que va en CrearReporteBody.contexto. Lee los buffers (copia), location, document.title, navigator, screen. Nunca tira. */
export function armarContexto(): ContextoCliente;
/** Por si instrumentation-client no corrió (no debería pasar): instala los buffers una vez. Lo llama instrumentation-client. */
export function instalarBuffers(): void;
export function registrarRuta(url: string): void;
```

- **`next.config.ts`:** `env: { NEXT_PUBLIC_SHA: process.env.VERCEL_GIT_COMMIT_SHA ?? "local" }`. `armarContexto().sha` sale de ahí.
- **Saneado en el servidor** (`src/lib/sistemas/contexto.ts`, de API):
  - JWT → `[jwt]`;
  - emails → `[email]`;
  - fuera de las URLs y la ruta los parámetros `token`, `apikey`, `access_token`, `code`, `signature` y `key`;
  - textos recortados (mensaje 1000, stack 2000, URL 500) y listas limitadas a `LIMITES`;
  - el total queda en menos de `LIMITES.contextoBytes`: primero se recortan los stacks, después se descartan los más viejos;
  - lo que no tenga la forma de `ContextoCliente` se descarta y se reemplaza con valores vacíos.

### 6.4 `src/components/sistemas/editor-marcas.tsx`

```ts
export type PropsEditorMarcas = {
  abierto: boolean;
  /** La captura o imagen ORIGINAL (sin marcas). Nunca se sube. */
  original: ImagenLista;
  /** Las marcas que ya tenía (para volver a editar). */
  marcas: Marca[];
  onListo: (r: { imagen: ImagenLista; marcas: Marca[]; conMarcas: boolean }) => void; // imagen = aplanada con normalizarImagen
  onCancelar: () => void;
};
export function EditorMarcas(props: PropsEditorMarcas): React.JSX.Element;
```

- Es un `Dialog` (en el celular, pantalla completa) con `data-capture="exclude"`.
- Usa canvas 2D, sin librería.
- **Herramientas:**
  - Lápiz y Recuadro, con trazo rojo `#e5484d` de 3 px a escala de la imagen.
  - Tapar, en negro sólido.
  - Deshacer, Cancelar y Listo.
- Arranca con «Recuadro» elegido y usa los textos de `TEXTOS.editor`.
- Funciona con pointer events (mouse, dedo y lápiz) y con `touch-action: none` sobre el lienzo.
- `onListo` devuelve la versión **aplanada**. El panel guarda el original en memoria sólo para volver a editar: **lo único que se sube es la aplanada**.

### 6.5 `src/lib/sistemas/lienzos-webgl.ts`

```ts
/** Redibuja el lienzo y devuelve canvas.toDataURL("image/png"), o null si no puede. */
export type FotoLienzo = () => string | null;
/** Registra un canvas WebGL. Devuelve la función para desregistrarlo (llamarla en el cleanup). */
export function registrarLienzo(canvas: HTMLCanvasElement, foto: FotoLienzo): () => void;
/** Pone un <img> con la foto encima de cada lienzo registrado y visible, y oculta el canvas. Devuelve "restaurar". */
export function congelarLienzos(): () => void;
```

Sin `preserveDrawingBuffer`, los canvas WebGL salen en blanco. Por eso se registran estos
tres, sin cambiar nada más de los componentes:

| Componente | Cómo registra |
|---|---|
| `ciudad-armada-mapa.tsx` (maplibre) | `registrarLienzo(map.getCanvas(), () => { map.redraw(); return map.getCanvas().toDataURL("image/png"); })` |
| `mini-mapa.tsx` (maplibre) | igual que el anterior |
| `escena.ts` (three) | `registrarLienzo(this.canvas, () => { this.renderer.render(this.scene, this.camera); return this.canvas.toDataURL("image/png"); })`, y lo desregistra en `dispose()` |

---

## 7. Panel de reporte, header, ⌘K y menú (UI)

### 7.1 Canal de eventos (`EVENTOS` en `tipos.ts`, `window.dispatchEvent(new CustomEvent(...))`)

| Evento | Detail | Qué hace el panel |
|---|---|---|
| `sistemas:reportar` | — | Flujo normal: **primero** `capturarPantalla()` y **después** abre el panel. No hace nada si `<html>` tiene `ATRIBUTO_RECORRIDO_ACTIVO` o si el panel ya está abierto. |
| `sistemas:abrir-reporte` | `DetalleAbrirReporte`: `{ modo: "recorrido" }` | Abre el panel **sin capturar**, en «modo recorrido» (ver abajo). |
| `sistemas:cerrar-reporte` | — | Cierra el panel, en cualquier modo, y libera las imágenes. |

**Quién dispara `sistemas:reportar`:**

- el botón del header;
- el ítem «Reportar algo del sistema» del menú del avatar;
- el mismo ítem en ⌘K;
- el botón «Reportar algo» de Mis reportes.

Desde el menú y desde ⌘K, primero se cierra el popup y después se espera a que desaparezca
(unos 250 ms o dos `requestAnimationFrame` después de la animación de salida) antes de
disparar, así el popup no sale en la foto.

**Dónde vive el panel:** UI monta un componente `<ReportarSistemas/>` (en `src/components/sistemas/`)
**dentro de `header.tsx`**. Escucha los tres eventos y es dueño de todo el estado del panel.
RECORRIDO no importa componentes de UI: sólo dispara eventos y espera las anclas.

### 7.2 Header (`header.tsx`) y menú del avatar

- **Botón «Reportar»:** `Button variant="ghost"` con `Megaphone` y el texto `TEXTOS.boton.reportar`. En pantallas angostas queda sólo el ícono, con `sr-only`.
  - `title={TEXTOS.boton.titulo}`, `data-tour="sistemas-reportar"` y `data-capture="exclude"`.
  - Va a la izquierda de la campanita, en el mismo orden que la maqueta: Reportar, tema, campanita, avatar.
- **`campanita.tsx`:** sumá `data-tour="campanita"` al botón que abre el popover. Es el único cambio en ese archivo.
- **Menú del avatar:** suma «Mis reportes» (`Inbox`, que lleva a `/sistemas/mis-reportes`) y «Reportar algo del sistema» (`Megaphone`).
- **⌘K (`command-search.tsx`):** un grupo «Sistema» con «Reportar algo del sistema».

### 7.3 Panel

Es un `Sheet` lateral derecho de unos 420 px; en el celular ocupa la pantalla completa. Lleva
`data-capture="exclude"` en el contenido y usa los textos de `TEXTOS.panel`.

**De arriba hacia abajo:**

- **Encabezado:** «¿Qué querés avisar?» y el subtítulo «Lo revisan en Sistemas. Nadie más ve lo que mandás.».
- **«Mis reportes (N)»:** si ya mandó alguno (y no está en modo recorrido).
- **Captura** (`data-tour="sistemas-captura"`, en la `<section>`):
  - la imagen;
  - «Marcar», que abre `EditorMarcas`;
  - «Sumar imagen», con `<input type="file" accept="image/*" multiple>`, Ctrl+V y arrastrar;
  - «Quitar».
  - Va con el rótulo «Foto de la pantalla · <pantalla>».
  - Si la captura falló: `TEXTOS.panel.capturaFallo`, con «Sumar imagen» a mano.
  - Hasta `LIMITES.imagenes` imágenes en total.
- **Tipo y descripción** (`data-tour="sistemas-tipos"`, en la sección que envuelve las tres tarjetas, el hint y el textarea):
  - tres tarjetas con `aria-pressed`;
  - el placeholder del textarea depende del tipo (`TIPOS[t].placeholder`, o `placeholderSinTipo`).
- **Si es Error:** «¿Te frena el trabajo?», con «Sí, no puedo seguir» y «Molesta, pero sigo» (este último, por defecto).
- **Detalle plegable:** `<details>` con `TEXTOS.panel.contexto` y la tabla de `contextoFilas`, armada con `armarContexto()` y `useUser()`. Abajo, `contextoHint`.
- **Pie:** «Cancelar» y «Mandar a Sistemas» (`data-tour="sistemas-mandar"`). «Mandar» está deshabilitado hasta que haya tipo y la descripción tenga al menos 3 letras después de `trim`.

**Al mandar** (lo hace `useCrearReporte` de `use-sistemas.ts`):

1. `POST /subidas` con los mime y bytes de cada imagen.
2. `uploadToSignedUrl` de cada imagen con `createClient()` del navegador: `storage.from(BUCKET).uploadToSignedUrl(path, token, blob, { contentType: mime })`.
3. `POST /api/sistemas/reportes`.
4. Toast de `sonner`, armado con `toastGracias(nombre, numero, frena)` y la acción «Ver mis reportes».
5. Cierra el panel y libera las imágenes.

Si algo falla, el panel queda abierto con lo cargado y un toast de error con el mensaje de la API.

**Modo recorrido:**

- Sin captura: en lugar de la foto va un recuadro con `TEXTOS.panel.capturaRecorrido`.
- Sin trampa de foco: `modal={false}`, sin backdrop que bloquee y sin mover el foco.
- No se puede cerrar: sin X, sin Esc y sin clic afuera.
- Todo es inerte: no se elige tipo, no se escribe y «Mandar» no manda.
- Las tres anclas `data-tour` tienen que estar en el DOM apenas se abre.

**Esc y clic afuera** cierran en modo normal, salvo mientras se está mandando.

### 7.4 `src/hooks/use-sistemas.ts` (UI)

- Query keys bajo `["sistemas", …]`:
  - `useMisReportes()`;
  - `useRevision(filtros)`;
  - `useReporteRevision(id)`;
  - `useCandidatos(id)`;
  - `usePromptClaude(id)`, sólo cuando se pide.
- Mutaciones: `useCrearReporte()`, `useComentarReporte(id)`, `useConfirmarReporte(id)`, `useRevisar(id)` y `useComentarRevision(id)`.
- Al terminar, cada mutación invalida `["sistemas"]` y `["alertas"]` (la key de `use-alertas.ts`).
- Un 503 muestra `MENSAJE_SIN_INSTALAR`.

---

## 8. Recorrido obligatorio (RECORRIDO)

### 8.1 Clave y persistencia

- **Clave:** `RECORRIDO = { clave: "sistemas-reportar", version: 1, pasos: 5 }`.
- **Hook `use-recorrido-obligatorio.ts`:**
  - lee `recorridos_vistos` con el cliente del navegador, filtrando por `usuario_id`, `clave` y `version`;
  - si **la tabla no existe o la consulta falla**, no muestra nada y no bloquea.
- **Al tocar «Entendido»:** inserta `{ clave, version, pasos_total: 5, dispositivo }`. El `usuario_id` sale del default `auth.uid()`.
  - Un `23505` (fila duplicada) cuenta como éxito.
  - Si el insert falla, igual se cierra; vuelve a aparecer en la próxima carga.
- **Recién ahí** sale el toast `TOAST_RECORRIDO`.
- **Si recarga a mitad,** vuelve a empezar desde la bienvenida. No se guarda el progreso, que es lo más robusto.

### 8.2 Flujo

1. **Bienvenida:** tarjeta centrada con `BIENVENIDA` (eyebrow, título, texto, los tres chips de tipo con `TIPOS`, «1 minuto · 5 pasos» y el botón «Empezar»).
2. **Pasos 1 a 5:** salen de `PASOS_RECORRIDO`, con «Paso k de 5» y sólo el botón «Siguiente» (el último dice «Entendido»).
   - Antes del paso 2 (`antes: "abrir-panel"`), se dispara `sistemas:abrir-reporte` con `{ modo: "recorrido" }`.
   - Antes del paso 5 (`antes: "cerrar-panel"`), se dispara `sistemas:cerrar-reporte`.
   - Cada paso espera a que exista su ancla `[data-tour="…"]`, con `requestAnimationFrame` o un `MutationObserver` y hasta 3 s. Si el ancla no aparece, el paso se muestra centrado y sin recorte: el recorrido nunca se traba.
3. **Al terminar:** escribe la fila (§8.1).

**Mientras corre:**

- `<html>` lleva `ATRIBUTO_RECORRIDO_ACTIVO`, para que «Reportar» no haga nada.
- No se puede cerrar ni saltear: sin Esc, sin clic afuera, sin «Atrás» y sin teclado.
- La pantalla de abajo no se puede tocar.

**Configuración de driver.js 1.8** (la fábrica compartida que se extrae de `use-tour.ts`):

- `allowClose: false`;
- `allowKeyboardControl: false`;
- `overlayClickBehavior: () => {}`;
- `disableActiveInteraction: true`;
- `showButtons: ["next"]`;
- `popoverClass: "tour-aba"`.

La bienvenida puede ser un `Dialog` propio que no se cierre o un paso de driver sin elemento.
Lo que sea más simple, siempre que no se pueda cerrar.

Habilitaciones sigue igual: su `useTour` usa la misma fábrica con sus opciones de siempre.

### 8.3 Dónde se monta

En `src/app/(dashboard)/layout.tsx`, dentro de `AccesoProvider` y `QueryProvider`: un
`<RecorridoObligatorio/>` (en `src/components/recorridos/`).

- Arranca unos 600 ms después de que exista `[data-tour="sistemas-reportar"]`.
- Usa `useAcceso()` y `usePathname()`.

### 8.4 Regla de exclusión

Va en `src/lib/recorridos/reglas.ts`, como función pura y con tests:

```ts
export function decidirRecorrido(a: { pathname: string; acceso: Acceso | null }): "mostrar" | "postergar" | "nunca";
```

- **`"nunca"`:**
  - sin acceso o con el usuario inactivo;
  - con `debeCambiarClave`;
  - la **cuenta técnica**: `esCuentaTecnica(acceso)` de `tipos.ts` (`rol !== "admin"` y su único permiso es `panol-kiosco`).
- **`"postergar"`:** en `/p/…`, `/fichadas/escanear` y `/organigrama/imprimir`, comparando por prefijo. Arranca cuando navega a otra pantalla.
- **Fuera del dashboard** (`/cambiar-clave`, `/kiosco`, `/h/…`) no corre nunca, porque no está montado ahí.

La cuenta técnica también queda fuera de la métrica `recorrido` de §3: API usa el mismo
`esCuentaTecnica()` de `tipos.ts`, aplicado a cada fila de `user_profiles` (`rol`, `permisos`).

### 8.5 Estilos

En `globals.css`, sólo para el recorrido: la tarjeta de bienvenida y lo que haga falta sobre
`.driver-popover.tour-aba`, sin cambiar lo que ya ve Habilitaciones. Si necesitás una variante,
usá una clase nueva (`tour-aba obligatorio`).

---

## 9. Pantallas (UI)

- **`src/app/(dashboard)/sistemas/page.tsx`:** sólo `redirect("/sistemas/mis-reportes")`.
- **`/sistemas/mis-reportes`:**
  - Encabezado: título, subtítulo y «Reportar algo», con `TEXTOS.mis`.
  - Cada reporte es una tarjeta con:
    - el chip de tipo, `#N`, la pantalla y la fecha;
    - la descripción;
    - la barra de `PASOS_USUARIO`, con `pasoUsuario()` y la etiqueta `ESTADOS[e].usuario`; si está descartado, el banner `estadoParaUsuario()`;
    - la conversación (lado `sistemas` firmado «Sistemas»; lado `usuario`, «Vos»; los eventos de estado, como línea del sistema);
    - las capturas.
  - Si no está cerrado, se puede responder.
  - Si está resuelto y `confirmadoOk` es null: «¿Quedó bien?», con «Ya está, gracias» y «Sigue pasando».
  - `?id=` abre ese reporte y hace scroll hasta él.
- **`/sistemas/revision`** (con `TEXTOS.revision`):
  - Encabezado: título «Sistemas» y subtítulo con nuevos y los que frenan.
  - Franja de métricas.
  - Pestañas de `ESTADOS_REPORTE`, con contador.
  - Filtros: texto, tipo y «Frena el trabajo».
  - Lista con el detalle al costado. En pantallas angostas, lista y detalle van apilados, con «volver».
  - `?id=` abre ese detalle y elige la pestaña de su estado.
  - Si la API da 403: `TEXTOS.revision.sinPermiso`.
  - **Detalle:**
    - `#N`, tipo, estado, «Frena el trabajo» y «Avisado en Slack #sistemas» (si `avisadoEnSlack`);
    - botones de estado y select de prioridad (`PRIORIDADES`);
    - la captura grande y las miniaturas;
    - la conversación con `RESPUESTAS_RAPIDAS`;
    - el contexto técnico plegado: ruta con «Abrir esta pantalla» en otra pestaña, dispositivo, versión con `shaCorto()` y aviso «(la actual es X)» si difiere de `shaActual`, pantallas anteriores, errores y pedidos fallidos;
    - «Marcar duplicado» (modal con `/candidatos`), «Descartar» (motivo obligatorio de `MOTIVOS_ELEGIBLES` y mensaje) y «Resolver y avisar» (mensaje editable, precargado con `mensajeResolver(nombre)`);
    - «Copiar para Claude Code» (modal con `/prompt` y «Copiar texto»).
- **Lo que NO va:** campo «A cargo», asignación, «me pasa lo mismo», interruptor «con marcas / original» (sólo se sube la aplanada) y botón «Dictar».

---

## 10. Prompt para Claude Code (API, `src/lib/sistemas/prompt-claude.ts`)

```ts
export function armarPrompt(r: ReporteDetalle, o: { shaActual: string; urlsCapturas: string[]; docs: string | null }): string;
```

Es pura y lleva tests. Sigue a `promptDe()` de la maqueta, en este orden:

1. Encabezado: `Reporte #N de AndamiosOS · <Tipo>`, más ` · le frena el trabajo` y ` · prioridad <p>` si corresponden.
2. Quién reportó: nombre y apellido, rol, desde dónde (dispositivo) y fecha en `es-AR` / `America/Argentina/Buenos_Aires`.
3. «Lo que dice:», con el texto entre «».
4. «Dónde:», con la pantalla y la ruta.
5. Los docs del módulo, si hay: `docsDeModulo(modulo)` de `rutas.ts`, que mapea el módulo a su carpeta de `docs/` (por ejemplo, `partes` → `docs/partes/`, `planificacion` → `docs/tablero-planificacion/`, `hoja-dia` → `docs/equipos-del-dia/`, `computos` → `docs/computo-materiales/`, `clientes-whatsapp` → `docs/sofia/`, `mapa-obras` → `docs/mapa-obras/`, `habilitaciones` → `docs/habilitaciones/`, `panol` → `docs/panol/`, `direccion` → `docs/direccion/`, `modelador` → `docs/oficina-tecnica/`, `organigrama` → `docs/organigrama/`, `informes-obra` → `docs/informe-de-obra/`, `permisos-via-publica` → `docs/permisos/`, `asistente-comercial` → `docs/asistente-comercial/`).
6. La versión: si `shaCliente` difiere de `shaActual`, se suma `git log <corto>..HEAD`.
7. Para cada captura: `curl -sL "<url>" -o /tmp/sistemas-<N>-<i>.<ext>` y «Después abrila con Read.». El enlace vence en 1 h.
8. Errores de consola y pedidos fallidos.
9. Pantallas anteriores.
10. La conversación: el lado `sistemas` firmado «Sistemas» y el lado usuario con el primer nombre de quien reportó.
11. «Qué te pido:», con los 4 puntos de la maqueta, incluidos «Sistemas #N» en el commit y las 2 líneas para avisarle a la persona.

---

## 11. Si las migraciones no están aplicadas

- **API:**
  - si falta una tabla (`42P01` o `PGRST205`), una función (`PGRST202` o `42883`) o el bucket (`Bucket not found`), contesta 503 con `MENSAJE_SIN_INSTALAR`;
  - los avisos fallan en silencio, como ya hace `crearAlertas`.
- **UI:** el botón «Reportar» se muestra igual. Si al mandar llega un 503, se muestra el mensaje y el panel queda abierto.
- **Recorrido:** si la consulta falla, no se muestra.
- **Resto de la app:** nada de esto puede romperla. `instrumentation-client.ts` va todo en try/catch.

---

## 12. Al terminar, cada constructor

- Corre `npx tsc --noEmit -p .`, `npm test` y `npx eslint` sobre sus archivos. Si hay fallas fuera de su alcance, las anota sin arreglarlas.
- En su resumen final:
  - qué archivos creó o cambió;
  - qué quedó pendiente;
  - qué necesita de otro constructor.
